#!/bin/bash
##############################################################################
# TypeScript Worker – GCE Startup Script
# Installs Node.js 20, writes the TS worker source, compiles it,
# and registers a systemd service.
# Reads PYTHON_WORKER_URL from instance metadata set by Terraform.
##############################################################################
set -euo pipefail
exec > /var/log/startup-ts-worker.log 2>&1

echo "[startup] TypeScript worker startup script beginning at $(date)"

# ── Fetch instance metadata ────────────────────────────────────────────────
META_BASE="http://metadata.google.internal/computeMetadata/v1/instance/attributes"
META_OPTS=(-H "Metadata-Flavor: Google" --silent --fail)

PY_IP=$(curl "${META_OPTS[@]}" "$META_BASE/python-worker-internal-ip" || echo "10.0.1.2")
PY_PORT=$(curl "${META_OPTS[@]}" "$META_BASE/python-worker-port" || echo "8000")
PYTHON_WORKER_URL="http://${PY_IP}:${PY_PORT}"
TS_PORT=3001

echo "[startup] Python worker URL: $PYTHON_WORKER_URL"

# ── System packages ────────────────────────────────────────────────────────
apt-get update -y
apt-get install -y curl ca-certificates

# ── Node.js 20 ─────────────────────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "[startup] Node.js $(node -v) installed"

# ── App directory ─────────────────────────────────────────────────────────
APP_DIR="/opt/ts-worker"
mkdir -p "$APP_DIR/src" "$APP_DIR/dist"

# ── package.json ──────────────────────────────────────────────────────────
cat > "$APP_DIR/package.json" << 'EOF'
{
  "name": "ts-worker",
  "version": "1.0.0",
  "description": "TypeScript chaining worker for inference mesh",
  "main": "dist/worker.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/worker.js"
  },
  "dependencies": {
    "axios": "^1.7.2"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "@types/node": "^20.14.0"
  }
}
EOF

# ── tsconfig.json ─────────────────────────────────────────────────────────
cat > "$APP_DIR/tsconfig.json" << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
EOF

# ── TypeScript source ─────────────────────────────────────────────────────
cat > "$APP_DIR/src/worker.ts" << 'TSEOF'
/**
 * TypeScript Chaining Worker
 * - Exposes POST /infer and GET /health
 * - Validates input, forwards to Python worker, enriches response
 * - Demonstrates cross-language RPC over private subnet
 */

import http from "http";
import https from "https";
import { URL } from "url";

const PORT = parseInt(process.env.TS_WORKER_PORT ?? "3001", 10);
const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_URL ?? "http://10.0.1.2:8000";
const TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS ?? "30000", 10);

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

function log(level: string, msg: string, meta?: object) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message: msg,
    ...meta,
  }));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function httpPost(url: string, payload: object): Promise<PythonWorkerResponse> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: TIMEOUT_MS,
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data) as PythonWorkerResponse;
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`Python worker returned ${res.statusCode}: ${data}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse Python worker response: ${e}`));
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Python worker timed out after ${TIMEOUT_MS}ms`));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const sendJson = (status: number, body: object) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    });
    res.end(payload);
  };

  // ── GET /health ──────────────────────────────────────────────────────
  if (req.method === "GET" && req.url === "/health") {
    sendJson(200, { status: "ok", worker: "typescript", timestamp: Date.now() });
    return;
  }

  // ── POST /infer ──────────────────────────────────────────────────────
  if (req.method === "POST" && req.url === "/infer") {
    let payload: InferPayload;
    try {
      const raw = await readBody(req);
      payload = JSON.parse(raw) as InferPayload;
    } catch {
      sendJson(400, { error: "Invalid JSON body" });
      return;
    }

    if (!payload.prompt || typeof payload.prompt !== "string") {
      sendJson(400, { error: "prompt is required and must be a non-empty string" });
      return;
    }

    const requestId = payload.request_id ?? crypto.randomUUID();
    const tsStart = Date.now();

    log("info", "Forwarding to Python worker", {
      request_id: requestId,
      python_url: PYTHON_WORKER_URL,
    });

    try {
      const pythonResult = await httpPost(`${PYTHON_WORKER_URL}/infer`, {
        prompt: payload.prompt,
        max_tokens: payload.max_tokens ?? 100,
        temperature: payload.temperature ?? 0.7,
        request_id: requestId,
      });

      const totalLatency = Date.now() - tsStart;

      const response = {
        result: pythonResult.result,
        tokens_used: pythonResult.tokens_used,
        latency_ms: totalLatency,
        worker_chain: ["typescript", ...( pythonResult.worker_chain ?? ["python"])],
        request_id: requestId,
      };

      log("info", "Inference complete", {
        request_id: requestId,
        latency_ms: totalLatency,
        tokens_used: response.tokens_used,
      });

      sendJson(200, response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("error", `Python worker call failed: ${msg}`, { request_id: requestId });
      sendJson(502, { error: `Python worker error: ${msg}`, request_id: requestId });
    }
    return;
  }

  sendJson(404, { error: "Not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  log("info", `TypeScript worker listening`, {
    port: PORT,
    python_worker_url: PYTHON_WORKER_URL,
  });
});

process.on("SIGTERM", () => {
  log("info", "SIGTERM received, shutting down");
  server.close(() => process.exit(0));
});
TSEOF

# ── Install deps and build ─────────────────────────────────────────────────
cd "$APP_DIR"
npm install
npm run build

# ── Create dedicated user ─────────────────────────────────────────────────
if ! id "tsworker" &>/dev/null; then
    useradd -r -s /usr/sbin/nologin -d "$APP_DIR" tsworker
fi
chown -R tsworker:tsworker "$APP_DIR"

# ── Write systemd unit ────────────────────────────────────────────────────
cat > /etc/systemd/system/ts-worker.service << EOF
[Unit]
Description=TypeScript Chaining Worker
After=network.target
StartLimitIntervalSec=200
StartLimitBurst=5

[Service]
Type=simple
User=tsworker
WorkingDirectory=/opt/ts-worker
ExecStart=/usr/bin/node /opt/ts-worker/dist/worker.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGTERM

Environment=TS_WORKER_PORT=3001
Environment=PYTHON_WORKER_URL=${PYTHON_WORKER_URL}
Environment=REQUEST_TIMEOUT_MS=30000
Environment=NODE_ENV=production

StandardOutput=journal
StandardError=journal
SyslogIdentifier=ts-worker

LimitNOFILE=65536
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# ── Enable and start ──────────────────────────────────────────────────────
systemctl daemon-reload
systemctl enable ts-worker.service
systemctl start ts-worker.service

echo "[startup] TypeScript worker startup complete at $(date)"
systemctl status ts-worker.service --no-pager || true
