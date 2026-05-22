#!/bin/bash

##############################################################################
# API Gateway Setup Script
# 
# Installs and configures the API Gateway on a Linux VM
# Handles: Node.js installation, app setup, systemd configuration, firewall
# 
# Usage: sudo bash setup.sh
##############################################################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
GATEWAY_USER="gateway"
GATEWAY_HOME="/opt/gateway"
GATEWAY_CONFIG="/etc/gateway"
NODE_VERSION="20.10.0"
NVM_DIR="/root/.nvm"

##############################################################################
# Utility Functions
##############################################################################

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

require_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        return 1
    fi
    return 0
}

##############################################################################
# Installation Steps
##############################################################################

step_1_check_prerequisites() {
    log_info "Step 1: Checking prerequisites..."
    
    if ! check_command curl; then
        log_error "curl is required but not installed"
        exit 1
    fi
    
    log_info "Prerequisites OK"
}

step_2_install_nodejs() {
    log_info "Step 2: Installing Node.js ${NODE_VERSION}..."
    
    if check_command node; then
        INSTALLED_VERSION=$(node -v | sed 's/v//')
        log_warn "Node.js already installed: v${INSTALLED_VERSION}"
    else
        # Install Node.js from NodeSource repository (alternative to nvm)
        if ! check_command curl; then
            log_error "curl is required for Node.js installation"
            exit 1
        fi
        
        # Using NodeSource setup script (more reliable for systemd)
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get update
        apt-get install -y nodejs
        
        log_info "Node.js $(node -v) installed successfully"
    fi
}

step_3_create_gateway_user() {
    log_info "Step 3: Creating gateway user..."
    
    if id "$GATEWAY_USER" &>/dev/null; then
        log_warn "User $GATEWAY_USER already exists"
    else
        useradd -r -s /bin/bash -d "$GATEWAY_HOME" "$GATEWAY_USER"
        log_info "User $GATEWAY_USER created"
    fi
}

step_4_setup_directories() {
    log_info "Step 4: Setting up directories..."
    
    # Create gateway home directory
    if [[ ! -d "$GATEWAY_HOME" ]]; then
        mkdir -p "$GATEWAY_HOME"
    fi
    
    # Create config directory
    if [[ ! -d "$GATEWAY_CONFIG" ]]; then
        mkdir -p "$GATEWAY_CONFIG"
    fi
    
    # Set permissions
    chown -R "$GATEWAY_USER:$GATEWAY_USER" "$GATEWAY_HOME"
    chmod 750 "$GATEWAY_HOME"
    
    chown -R "$GATEWAY_USER:$GATEWAY_USER" "$GATEWAY_CONFIG"
    chmod 750 "$GATEWAY_CONFIG"
    
    log_info "Directories created and permissions set"
}

step_5_deploy_app_files() {
    log_info "Step 5: Deploying application files..."
    
    # Source directory (relative to script location)
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    APP_SOURCE="$(dirname "$SCRIPT_DIR")"
    
    # Copy source files
    if [[ -d "$APP_SOURCE/src" ]]; then
        cp -r "$APP_SOURCE/src" "$GATEWAY_HOME/"
        cp -r "$APP_SOURCE/dist" "$GATEWAY_HOME/" 2>/dev/null || true
        cp "$APP_SOURCE/package.json" "$GATEWAY_HOME/"
        cp "$APP_SOURCE/package-lock.json" "$GATEWAY_HOME/" 2>/dev/null || true
        cp "$APP_SOURCE/tsconfig.json" "$GATEWAY_HOME/"
        log_info "Application files copied"
    else
        log_warn "Source files not found at $APP_SOURCE"
    fi
    
    # Install dependencies
    log_info "Installing npm dependencies..."
    cd "$GATEWAY_HOME"
    npm install --omit=dev --production
    
    # Build TypeScript
    log_info "Building TypeScript..."
    npm run build
    
    # Set ownership
    chown -R "$GATEWAY_USER:$GATEWAY_USER" "$GATEWAY_HOME"
    
    log_info "Application deployed and built"
}

step_6_configure_environment() {
    log_info "Step 6: Configuring environment..."
    
    ENV_FILE="$GATEWAY_CONFIG/.env"
    
    if [[ ! -f "$ENV_FILE" ]]; then
        # Copy from .env.example if available
        if [[ -f "$GATEWAY_HOME/.env.example" ]]; then
            cp "$GATEWAY_HOME/.env.example" "$ENV_FILE"
            log_info "Environment file created from template"
        else
            # Create minimal template
            cat > "$ENV_FILE" <<EOF
# Configure these with your actual worker IPs
PYTHON_WORKER_URL=http://10.0.1.5:8000
TYPESCRIPT_WORKER_URL=http://10.0.1.6:3001

PORT=3000
REQUEST_TIMEOUT_MS=30000
LOG_LEVEL=info
NODE_ENV=production
RATE_LIMIT_MAX_REQUESTS=60
EOF
            log_info "Minimal environment file created"
        fi
        
        chmod 600 "$ENV_FILE"
        chown "$GATEWAY_USER:$GATEWAY_USER" "$ENV_FILE"
        
        log_warn "Please edit $ENV_FILE with your actual worker URLs"
    else
        log_warn "Environment file already exists at $ENV_FILE"
    fi
}

step_7_setup_systemd() {
    log_info "Step 7: Setting up systemd service..."
    
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    SERVICE_FILE="$SCRIPT_DIR/gateway.service"
    SYSTEMD_SERVICE="/etc/systemd/system/gateway.service"
    
    if [[ -f "$SERVICE_FILE" ]]; then
        cp "$SERVICE_FILE" "$SYSTEMD_SERVICE"
        chmod 644 "$SYSTEMD_SERVICE"
        log_info "Systemd service file installed"
    else
        log_error "Service file not found at $SERVICE_FILE"
        exit 1
    fi
    
    # Reload systemd daemon
    systemctl daemon-reload
    
    # Enable service to start on boot
    systemctl enable gateway.service
    
    log_info "Systemd service configured and enabled"
}

step_8_configure_firewall() {
    log_info "Step 8: Configuring firewall..."
    
    if check_command ufw; then
        # Allow port 3000 (or configured port) from anywhere
        ufw allow 3000/tcp
        log_info "Firewall rule added for port 3000"
    else
        log_warn "ufw not found, skipping firewall configuration"
        log_warn "Make sure to open port 3000 (or configured PORT) manually"
    fi
}

step_9_verify_setup() {
    log_info "Step 9: Verifying setup..."
    
    # Check if files are in place
    if [[ ! -d "$GATEWAY_HOME/dist" ]]; then
        log_error "Compiled app not found at $GATEWAY_HOME/dist"
        exit 1
    fi
    
    if [[ ! -f "$GATEWAY_CONFIG/.env" ]]; then
        log_error "Environment file not found at $GATEWAY_CONFIG/.env"
        exit 1
    fi
    
    if [[ ! -f "/etc/systemd/system/gateway.service" ]]; then
        log_error "Systemd service not installed"
        exit 1
    fi
    
    log_info "Setup verification passed"
}

##############################################################################
# Main Execution
##############################################################################

main() {
    log_info "=========================================="
    log_info "API Gateway Setup Script"
    log_info "=========================================="
    
    require_root
    
    step_1_check_prerequisites
    step_2_install_nodejs
    step_3_create_gateway_user
    step_4_setup_directories
    step_5_deploy_app_files
    step_6_configure_environment
    step_7_setup_systemd
    step_8_configure_firewall
    step_9_verify_setup
    
    log_info "=========================================="
    log_info "Setup Complete!"
    log_info "=========================================="
    echo ""
    log_info "Next steps:"
    echo "  1. Edit environment file: sudo nano $GATEWAY_CONFIG/.env"
    echo "  2. Set PYTHON_WORKER_URL and TYPESCRIPT_WORKER_URL to your worker IPs"
    echo "  3. Start the service: sudo systemctl start gateway.service"
    echo "  4. Check status: sudo systemctl status gateway.service"
    echo "  5. View logs: sudo journalctl -u gateway.service -f"
    echo ""
    log_info "API Gateway will be available at: http://localhost:3000"
    echo ""
}

# Run main function
main
