#!/bin/bash
##############################################################################
# Python Worker – Standalone Deploy Script
#
# Run this on the python-worker VM (after SSHing in).
# Idempotent: safe to re-run for updates.
#
# Usage:
#   scp -r workers/python-worker devops@<PYTHON_WORKER_IP>:/tmp/python-worker
#   ssh devops@<PYTHON_WORKER_IP> "sudo bash /tmp/python-worker/deploy/setup.sh"
##############################################################################
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

require_root() {
    [[ $EUID -eq 0 ]] || { log_error "Run as root: sudo bash $0"; exit 1; }
}

# ── Config ────────────────────────────────────────────────────────────────
APP_USER="pyworker"
APP_DIR="/opt/python-worker"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(dirname "$SCRIPT_DIR")"   # workers/python-worker/

require_root
log_info "=== Python Worker Setup ==="

# ── Python 3 ──────────────────────────────────────────────────────────────
log_info "Checking Python 3..."
if ! command -v python3 &>/dev/null; then
    apt-get update -y
    apt-get install -y python3
fi
log_info "Python $(python3 --version)"

# ── App user ──────────────────────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
    useradd -r -s /usr/sbin/nologin -d "$APP_DIR" "$APP_USER"
    log_info "Created user $APP_USER"
fi

# ── App directory ─────────────────────────────────────────────────────────
mkdir -p "$APP_DIR"
cp "$SRC_DIR/worker.py" "$APP_DIR/worker.py"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 750 "$APP_DIR"
log_info "Deployed worker.py to $APP_DIR"

# ── Systemd service ───────────────────────────────────────────────────────
cp "$SCRIPT_DIR/python-worker.service" /etc/systemd/system/python-worker.service
chmod 644 /etc/systemd/system/python-worker.service
systemctl daemon-reload
systemctl enable python-worker.service
log_info "Systemd service installed and enabled"

# ── Firewall (ufw if available) ────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    # Only allow from subnet – adjust CIDR to match your VPC subnet
    SUBNET="${WORKER_SUBNET:-10.0.1.0/24}"
    ufw allow from "$SUBNET" to any port 8000 proto tcp comment "Python worker RPC"
    log_info "Firewall: allowed port 8000 from $SUBNET"
fi

# ── Start / Restart ───────────────────────────────────────────────────────
systemctl restart python-worker.service
sleep 2
if systemctl is-active --quiet python-worker.service; then
    log_info "✓ python-worker.service is running"
else
    log_error "python-worker.service failed to start – check: journalctl -u python-worker -n 50"
    exit 1
fi

log_info ""
log_info "=== Setup Complete ==="
log_info "Status : sudo systemctl status python-worker"
log_info "Logs   : sudo journalctl -u python-worker -f"
log_info "Test   : curl http://localhost:8000/health"
