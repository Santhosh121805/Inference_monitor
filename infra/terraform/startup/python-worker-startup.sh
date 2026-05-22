#!/bin/bash
##############################################################################
# Python Worker – GCE Startup Script
# Runs automatically on first boot via instance metadata.
# Installs Python 3.11, the worker app, and registers a systemd service.
##############################################################################
set -euo pipefail
exec > /var/log/startup-python-worker.log 2>&1

echo "[startup] Python worker startup script beginning at $(date)"

# ── System packages ────────────────────────────────────────────────────────
apt-get update -y
apt-get install -y python3 python3-pip python3-venv git curl

# ── App directory ─────────────────────────────────────────────────────────
APP_DIR="/opt/python-worker"
mkdir -p "$APP_DIR"

# ── Write the Python worker source inline ─────────────────────────────────
cat > "$APP_DIR/worker.py" << 'PYEOF'
#!/usr/bin/env python3
"""
Python Inference Worker
Exposes POST /infer and GET /health over HTTP.
Simulates a small language model (SLM) inference.
In production, swap the _run_inference() body with a real model call
(e.g., HuggingFace transformers, llama.cpp, etc.)
"""

import os
import time
import uuid
import logging
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

# ── Logging ──────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
)
logger = logging.getLogger("python-worker")

PORT = int(os.environ.get("PYTHON_WORKER_PORT", "8000"))


def _run_inference(prompt: str, max_tokens: int, temperature: float) -> dict:
    """
    Core inference logic.
    Replace this stub with a real model (transformers, llama-cpp-python, etc.)
    For the free-tier demo we generate a deterministic mock response so the
    entire stack can be validated without a GPU.
    """
    start = time.time()
    # --- stub: echo + metadata ---
    result_text = (
        f"[python-worker] Processed: \"{prompt[:80]}\" "
        f"(max_tokens={max_tokens}, temperature={temperature:.2f})"
    )
    elapsed_ms = int((time.time() - start) * 1000)
    tokens = min(max_tokens, len(result_text.split()))
    return {
        "result": result_text,
        "tokens_used": tokens,
        "latency_ms": elapsed_ms,
        "worker": "python",
    }


class WorkerHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        logger.info(fmt % args)

    def _send_json(self, status: int, body: dict):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        return json.loads(raw)

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {"status": "ok", "worker": "python", "timestamp": int(time.time() * 1000)})
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/infer":
            self._send_json(404, {"error": "not found"})
            return

        try:
            body = self._read_json()
        except Exception as e:
            self._send_json(400, {"error": f"invalid JSON: {e}"})
            return

        prompt = body.get("prompt", "")
        if not prompt or not isinstance(prompt, str):
            self._send_json(400, {"error": "prompt is required and must be a non-empty string"})
            return

        max_tokens = int(body.get("max_tokens", 100))
        temperature = float(body.get("temperature", 0.7))
        request_id = body.get("request_id", str(uuid.uuid4()))

        logger.info(json.dumps({
            "event": "infer_request",
            "request_id": request_id,
            "prompt_len": len(prompt),
            "max_tokens": max_tokens,
        }))

        try:
            result = _run_inference(prompt, max_tokens, temperature)
            result["request_id"] = request_id
            result["worker_chain"] = ["python"]
            logger.info(json.dumps({
                "event": "infer_complete",
                "request_id": request_id,
                "tokens_used": result["tokens_used"],
                "latency_ms": result["latency_ms"],
            }))
            self._send_json(200, result)
        except Exception as e:
            logger.error(f"Inference error: {e}")
            self._send_json(500, {"error": str(e), "request_id": request_id})


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), WorkerHandler)
    logger.info(f"Python worker listening on 0.0.0.0:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Python worker shutting down")
        server.server_close()
PYEOF

# ── Write requirements (none needed for stdlib-only worker) ───────────────
cat > "$APP_DIR/requirements.txt" << 'EOF'
# No third-party dependencies – uses Python stdlib http.server
# To add real SLM inference, uncomment one of:
# transformers==4.40.0
# torch==2.3.0
# llama-cpp-python==0.2.75
EOF

# ── Create dedicated system user ──────────────────────────────────────────
if ! id "pyworker" &>/dev/null; then
    useradd -r -s /usr/sbin/nologin -d "$APP_DIR" pyworker
fi
chown -R pyworker:pyworker "$APP_DIR"

# ── Write systemd service unit ────────────────────────────────────────────
cat > /etc/systemd/system/python-worker.service << 'EOF'
[Unit]
Description=Python Inference Worker
After=network.target
StartLimitIntervalSec=200
StartLimitBurst=5

[Service]
Type=simple
User=pyworker
WorkingDirectory=/opt/python-worker
ExecStart=/usr/bin/python3 /opt/python-worker/worker.py
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGTERM

Environment=PYTHON_WORKER_PORT=8000

StandardOutput=journal
StandardError=journal
SyslogIdentifier=python-worker

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
systemctl enable python-worker.service
systemctl start python-worker.service

echo "[startup] Python worker startup complete at $(date)"
echo "[startup] Service status:"
systemctl status python-worker.service --no-pager || true
