#!/bin/bash
##############################################################################
# API Gateway – GCE Startup Script
# Installs Node.js 20, copies the api-gateway app from the repo
# (cloned via git or pre-baked in a custom image), and starts systemd.
# Worker URLs are injected via instance metadata set by Terraform.
##############################################################################
set -euo pipefail
exec > /var/log/startup-gateway.log 2>&1

echo "[startup] Gateway startup script beginning at $(date)"

# ── Fetch instance metadata ────────────────────────────────────────────────
META_BASE="http://metadata.google.internal/computeMetadata/v1/instance/attributes"
META_OPTS=(-H "Metadata-Flavor: Google" --silent --fail)

PY_IP=$(curl "${META_OPTS[@]}" "$META_BASE/python-worker-internal-ip" || echo "10.0.1.2")
TS_IP=$(curl "${META_OPTS[@]}" "$META_BASE/ts-worker-internal-ip"     || echo "10.0.1.3")
PY_PORT=$(curl "${META_OPTS[@]}" "$META_BASE/python-worker-port"       || echo "8000")
TS_PORT=$(curl "${META_OPTS[@]}" "$META_BASE/ts-worker-port"           || echo "3001")
GW_PORT=$(curl "${META_OPTS[@]}" "$META_BASE/gateway-port"             || echo "3000")

PYTHON_WORKER_URL="http://${PY_IP}:${PY_PORT}"
TS_WORKER_URL="http://${TS_IP}:${TS_PORT}"

echo "[startup] Python worker URL : $PYTHON_WORKER_URL"
echo "[startup] TypeScript worker URL: $TS_WORKER_URL"

# ── System packages ────────────────────────────────────────────────────────
apt-get update -y
apt-get install -y curl ca-certificates git

# ── Node.js 20 ─────────────────────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
echo "[startup] Node.js $(node -v) installed"

# ── Clone repo ─────────────────────────────────────────────────────────────
# Replace REPO_URL with your actual public GitHub repo URL
REPO_URL="${REPO_URL:-https://github.com/YOUR_USERNAME/inference-monitor.git}"
CLONE_DIR="/opt/repo"

if [[ -d "$CLONE_DIR" ]]; then
    cd "$CLONE_DIR" && git pull || true
else
    git clone "$REPO_URL" "$CLONE_DIR"
fi

APP_DIR="/opt/gateway"
mkdir -p "$APP_DIR"
cp -r "$CLONE_DIR/api-gateway/." "$APP_DIR/"

# ── Install dependencies and build ────────────────────────────────────────
cd "$APP_DIR"
npm install --omit=dev
npm run build

# ── Create dedicated user ─────────────────────────────────────────────────
if ! id "gateway" &>/dev/null; then
    useradd -r -s /usr/sbin/nologin -d "$APP_DIR" gateway
fi

# ── Write environment file ────────────────────────────────────────────────
mkdir -p /etc/gateway
cat > /etc/gateway/.env << EOF
PYTHON_WORKER_URL=${PYTHON_WORKER_URL}
TYPESCRIPT_WORKER_URL=${TS_WORKER_URL}
PORT=${GW_PORT}
REQUEST_TIMEOUT_MS=30000
LOG_LEVEL=info
NODE_ENV=production
RATE_LIMIT_MAX_REQUESTS=60
EOF
chmod 600 /etc/gateway/.env

chown -R gateway:gateway "$APP_DIR" /etc/gateway

# ── Write systemd unit ────────────────────────────────────────────────────
cat > /etc/systemd/system/gateway.service << 'EOF'
[Unit]
Description=API Gateway - Distributed Inference Mesh Front Door
After=network.target
StartLimitIntervalSec=200
StartLimitBurst=5

[Service]
Type=simple
User=gateway
WorkingDirectory=/opt/gateway
EnvironmentFile=/etc/gateway/.env
ExecStart=/usr/bin/node /opt/gateway/dist/server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
KillMode=mixed
KillSignal=SIGTERM

StandardOutput=journal
StandardError=journal
SyslogIdentifier=api-gateway

LimitNOFILE=65536
MemoryLimit=512M
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# ── Enable and start ──────────────────────────────────────────────────────
systemctl daemon-reload
systemctl enable gateway.service
systemctl start gateway.service

echo "[startup] Gateway startup complete at $(date)"
systemctl status gateway.service --no-pager || true
