#!/usr/bin/env python3
"""
Python Inference Worker
========================
Exposes two endpoints over plain HTTP:
  POST /infer  – run SLM inference
  GET  /health – liveness check

The _run_inference() function is the only part that changes when you
swap in a real model.  Everything else (HTTP framing, JSON schema,
logging, graceful shutdown) stays the same.

Default port: 8000  (override with PYTHON_WORKER_PORT env var)
"""

import os
import sys
import time
import uuid
import signal
import logging
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

# ── Structured JSON logging ───────────────────────────────────────────────

class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps({
            "timestamp": self.formatTime(record, datefmt="%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname.lower(),
            "worker": "python",
            "message": record.getMessage(),
        })

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(JsonFormatter())
logging.root.handlers = [handler]
logging.root.setLevel(logging.INFO)
logger = logging.getLogger("python-worker")

# ── Configuration ─────────────────────────────────────────────────────────

PORT = int(os.environ.get("PYTHON_WORKER_PORT", "8000"))

# ── Inference stub ────────────────────────────────────────────────────────

def _run_inference(prompt: str, max_tokens: int, temperature: float) -> dict:
    """
    Core inference function.

    PRODUCTION SWAP-IN OPTIONS:
    ----------------------------
    Option A – HuggingFace transformers (CPU, ~500 MB for GPT-2):
        from transformers import pipeline
        _pipe = pipeline("text-generation", model="gpt2")
        out = _pipe(prompt, max_new_tokens=max_tokens, temperature=temperature)
        return {"result": out[0]["generated_text"], "tokens_used": max_tokens}

    Option B – llama.cpp (quantized GGUF, very low memory):
        from llama_cpp import Llama
        _llm = Llama(model_path="/opt/models/model.gguf", n_ctx=512)
        out = _llm(prompt, max_tokens=max_tokens, temperature=temperature)
        return {"result": out["choices"][0]["text"], "tokens_used": out["usage"]["completion_tokens"]}

    For the free-tier demo, we use a deterministic echo so the full
    stack can be validated without a GPU or large model download.
    """
    t0 = time.perf_counter()

    # ---- stub response ----
    short_prompt = prompt[:60] + ("…" if len(prompt) > 60 else "")
    result_text = (
        f"[python-worker] Echo inference → \"{short_prompt}\" "
        f"| max_tokens={max_tokens} temperature={temperature:.2f}"
    )
    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    tokens = min(max_tokens, max(1, len(result_text.split())))

    return {
        "result": result_text,
        "tokens_used": tokens,
        "latency_ms": elapsed_ms,
    }

# ── HTTP Handler ──────────────────────────────────────────────────────────

class WorkerHandler(BaseHTTPRequestHandler):
    """Handle /infer and /health requests."""

    def log_message(self, fmt: str, *args) -> None:  # suppress default access log
        pass

    def _send_json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        return json.loads(raw)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json(200, {
                "status": "ok",
                "worker": "python",
                "port": PORT,
                "timestamp": int(time.time() * 1000),
            })
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/infer":
            self._send_json(404, {"error": "not found"})
            return

        try:
            body = self._read_json()
        except Exception as exc:
            self._send_json(400, {"error": f"invalid JSON: {exc}"})
            return

        prompt: str = body.get("prompt", "")
        if not prompt or not isinstance(prompt, str):
            self._send_json(400, {"error": "prompt is required and must be a non-empty string"})
            return

        max_tokens: int   = int(body.get("max_tokens", 100))
        temperature: float = float(body.get("temperature", 0.7))
        request_id: str   = body.get("request_id") or str(uuid.uuid4())

        logger.info(json.dumps({
            "event": "infer_start",
            "request_id": request_id,
            "prompt_len": len(prompt),
            "max_tokens": max_tokens,
            "temperature": temperature,
        }))

        try:
            result = _run_inference(prompt, max_tokens, temperature)
        except Exception as exc:
            logger.error(json.dumps({"event": "infer_error", "request_id": request_id, "error": str(exc)}))
            self._send_json(500, {"error": str(exc), "request_id": request_id})
            return

        logger.info(json.dumps({
            "event": "infer_complete",
            "request_id": request_id,
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }))

        self._send_json(200, {
            **result,
            "worker": "python",
            "worker_chain": ["python"],
            "request_id": request_id,
        })

# ── Server lifecycle ──────────────────────────────────────────────────────

_server: HTTPServer | None = None

def _handle_sigterm(signum, frame):  # noqa: ARG001
    logger.info("SIGTERM received – shutting down")
    if _server:
        _server.server_close()
    sys.exit(0)

signal.signal(signal.SIGTERM, _handle_sigterm)
signal.signal(signal.SIGINT,  _handle_sigterm)

if __name__ == "__main__":
    _server = HTTPServer(("0.0.0.0", PORT), WorkerHandler)
    logger.info(f"Python worker listening on 0.0.0.0:{PORT}")
    _server.serve_forever()
