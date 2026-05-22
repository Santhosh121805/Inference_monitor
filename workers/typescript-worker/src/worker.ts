/**
 * TypeScript Chaining Worker
 * ===========================
 * Exposes:
 *   POST /infer  – validates payload, calls Python worker via RPC, enriches response
 *   GET  /health – liveness check
 *
 * Environment variables:
 *   TS_WORKER_PORT        (default 3001)
 *   PYTHON_WORKER_URL     (required – e.g. http://10.0.1.5:8000)
 *   REQUEST_TIMEOUT_MS    (default 30000)
 */

import http from "http";
import https from "https";
import { URL } from "url";
import crypto from "crypto";

// ── Config ────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.TS_WORKER_PORT ?? "3001", 10);
const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_URL ?? "http://10.0.1.5:8000";
const TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS ?? "30000", 10);

// ── Types ─────────────────────────────────────────────────────────────────

interface InferPayload {
  prompt: string;
  max_tokens?: number;
  temperature?: number;
  request_id?: string;
}

interface PythonWorkerResponse {
  result: string;
  tokens_used: number;
  latency_ms: number;
  worker: string;
  worker_chain: string[];
  request_id: string;
}

// ── Logging ───────────────────────────────────────────────────────────────

function log(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>
): void {
  process.stdout.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      worker: "typescript",
      message,
      ...meta,
    }) + "\n"
  );
}

// ── HTTP helpers ──────────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function rpcPost<T>(url: string, payload: object): Promise<T> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          const statusCode = res.statusCode ?? 500;
          if (statusCode >= 400) {
            reject(new Error(`Remote returned ${statusCode}: ${text}`));
            return;
          }
          try {
            resolve(JSON.parse(text) as T);
          } catch (e) {
            reject(new Error(`Failed to parse response JSON: ${e}`));
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request to ${url} timed out after ${TIMEOUT_MS}ms`));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Request handler ───────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  function sendJson(status: number, body: object): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    });
    res.end(payload);
  }

  // ── GET /health ────────────────────────────────────────────────────────
  if (req.method === "GET" && req.url === "/health") {
    sendJson(200, {
      status: "ok",
      worker: "typescript",
      port: PORT,
      python_worker_url: PYTHON_WORKER_URL,
      timestamp: Date.now(),
    });
    return;
  }

  // ── POST /infer ────────────────────────────────────────────────────────
  if (req.method === "POST" && req.url === "/infer") {
    let payload: InferPayload;
    try {
      const raw = await readBody(req);
      payload = JSON.parse(raw) as InferPayload;
    } catch (e) {
      sendJson(400, { error: `Invalid JSON body: ${e}` });
      return;
    }

    if (!payload.prompt || typeof payload.prompt !== "string") {
      sendJson(400, { error: "prompt is required and must be a non-empty string" });
      return;
    }

    const requestId = payload.request_id ?? crypto.randomUUID();
    const tsStart = Date.now();

    log("info", "Forwarding inference to Python worker", {
      request_id: requestId,
      python_url: PYTHON_WORKER_URL,
      prompt_len: payload.prompt.length,
    });

    try {
      const pythonResult = await rpcPost<PythonWorkerResponse>(
        `${PYTHON_WORKER_URL}/infer`,
        {
          prompt: payload.prompt,
          max_tokens: payload.max_tokens ?? 100,
          temperature: payload.temperature ?? 0.7,
          request_id: requestId,
        }
      );

      const totalLatency = Date.now() - tsStart;

      log("info", "Inference complete", {
        request_id: requestId,
        latency_ms: totalLatency,
        tokens_used: pythonResult.tokens_used,
      });

      sendJson(200, {
        result: pythonResult.result,
        tokens_used: pythonResult.tokens_used,
        latency_ms: totalLatency,
        worker_chain: ["typescript", ...(pythonResult.worker_chain ?? ["python"])],
        request_id: requestId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("error", `Python worker RPC failed: ${msg}`, { request_id: requestId });
      sendJson(502, {
        error: `Python worker error: ${msg}`,
        request_id: requestId,
      });
    }
    return;
  }

  sendJson(404, { error: "Not found" });
});

// ── Start ─────────────────────────────────────────────────────────────────

server.listen(PORT, "0.0.0.0", () => {
  log("info", "TypeScript worker started", {
    port: PORT,
    python_worker_url: PYTHON_WORKER_URL,
    timeout_ms: TIMEOUT_MS,
  });
});

process.on("SIGTERM", () => {
  log("info", "SIGTERM received – shutting down gracefully");
  server.close(() => {
    log("info", "Server closed");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
});

process.on("SIGINT", () => {
  log("info", "SIGINT received – exiting");
  process.exit(0);
});
