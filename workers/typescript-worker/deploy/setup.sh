#!/bin/bash
##############################################################################
# TypeScript Worker – Standalone Deploy Script
#
# Usage:
#   # From your local machine:
#   scp -r workers/typescript-worker devops@<TS_WORKER_IP>:/tmp/ts-worker
#   ssh devops@<TS_WORKER_IP> "sudo PYTHON_WORKER_URL=http://10.0.1.5:8000 bash /tmp/ts-worker/deploy/setup.sh"
##############################################################################
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

require_root() {
    [[ $EUID -eq 0 ]] || { log_error "Run as root: sudo bash $0"; exit 1; }
}

# ── Config ─────────────────────────────────────────────────────────────────
APP_USER="tsworker"
APP_DIR="/opt/ts-worker"
ENV_DIR="/etc/ts-worker"
PYTHON_WORKER_URL="${PYTHON_WORKER_URL:?ERROR: set PYTHON_WORKER_URL before running this script}"
TS_PORT="${TS_WORKER_PORT:-3001}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(dirname "$SCRIPT_DIR")"

require_root
log_info "=== TypeScript Worker Setup ==="
log_info "Python worker URL: $PYTHON_WORKER_URL"

# ── Node.js 20 ─────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 20 ]]; then
    log_info "Installing Node.js 20..."
    apt-get update -y
    apt-get install -y curl ca-certificates
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
log_info "Node.js $(node -v)"

# ── App user ──────────────────────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
    useradd -r -s /usr/sbin/nologin -d "$APP_DIR" "$APP_USER"
fi

# ── App directory ─────────────────────────────────────────────────────────
mkdir -p "$APP_DIR/src"
cp -r "$SRC_DIR/src/."    "$APP_DIR/src/"
cp    "$SRC_DIR/package.json"  "$APP_DIR/"
cp    "$SRC_DIR/tsconfig.json" "$APP_DIR/"

log_info "Installing npm dependencies..."
cd "$APP_DIR"
npm install

log_info "Building TypeScript..."
npm run build

chown -R "$APP_USER:$APP_USER" "$APP_DIR"
log_info "App deployed and built"

# ── Environment file ───────────────────────────────────────────────────────
mkdir -p "$ENV_DIR"
cat > "$ENV_DIR/.env" << EOF
TS_WORKER_PORT=${TS_PORT}
PYTHON_WORKER_URL=${PYTHON_WORKER_URL}
REQUEST_TIMEOUT_MS=30000
NODE_ENV=production
EOF
chmod 600 "$ENV_DIR/.env"
chown -R "$APP_USER:$APP_USER" "$ENV_DIR"
log_info "Environment file written to $ENV_DIR/.env"

# ── Systemd service ───────────────────────────────────────────────────────
cp "$SCRIPT_DIR/ts-worker.service" /etc/systemd/system/ts-worker.service
chmod 644 /etc/systemd/system/ts-worker.service
systemctl daemon-reload
systemctl enable ts-worker.service

# ── Firewall ──────────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    SUBNET="${WORKER_SUBNET:-10.0.1.0/24}"
    ufw allow from "$SUBNET" to any port "$TS_PORT" proto tcp comment "TS worker RPC"
fi

# ── Start ─────────────────────────────────────────────────────────────────
systemctl restart ts-worker.service
sleep 2
if systemctl is-active --quiet ts-worker.service; then
    log_info "✓ ts-worker.service is running"
else
    log_error "ts-worker.service failed – check: journalctl -u ts-worker -n 50"
    exit 1
fi

log_info ""
log_info "=== Setup Complete ==="
log_info "Status : sudo systemctl status ts-worker"
log_info "Logs   : sudo journalctl -u ts-worker -f"
log_info "Test   : curl http://localhost:${TS_PORT}/health"
