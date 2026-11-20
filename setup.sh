#!/usr/bin/env bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()    { echo -e "${CYAN}[•]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
log_error()   { echo -e "${RED}[X]${NC} $1"; exit 1; }

SUDO=""
if [ "$(id -u)" -ne 0 ] && [ -z "$TERMUX_VERSION" ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    log_error "This script requires root or sudo access to install system packages"
  fi
fi

log_info "Checking environment..."

install_system_packages() {
  if [ -n "$TERMUX_VERSION" ]; then
    log_info "Termux detected. Installing system packages..."
    pkg update -y
    pkg install -y ffmpeg nodejs git curl
  elif command -v apt-get >/dev/null 2>&1; then
    log_info "Debian/Ubuntu detected. Installing system packages..."
    $SUDO apt-get update -y
    $SUDO apt-get install -y ffmpeg curl git ca-certificates
  elif command -v dnf >/dev/null 2>&1; then
    log_info "Fedora/RHEL detected. Installing system packages..."
    $SUDO dnf install -y ffmpeg curl git
  elif command -v pacman >/dev/null 2>&1; then
    log_info "Arch Linux detected. Installing system packages..."
    $SUDO pacman -Sy --noconfirm ffmpeg curl git
  elif command -v apk >/dev/null 2>&1; then
    log_info "Alpine Linux detected. Installing system packages..."
    $SUDO apk add --no-cache ffmpeg curl git bash
  elif command -v brew >/dev/null 2>&1; then
    log_info "macOS detected. Installing system packages..."
    brew install ffmpeg
  else
    log_error "Unsupported package manager. Please install ffmpeg, git, curl, and Node.js v24+ manually"
  fi
}

install_system_packages

if [ -z "$TERMUX_VERSION" ]; then
  export NVM_DIR="$HOME/.nvm"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    log_info "Installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
  fi

  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  log_info "Installing latest Node.js..."
  nvm install node
  nvm use node
  nvm alias default node

  log_info "Updating npm to the latest version..."
  npm install -g npm@latest
fi

echo ""
log_info "Verifying global packages..."
command -v ffmpeg >/dev/null 2>&1 || log_error "FFmpeg installation failed. Please try again"
log_success "FFmpeg  : $(ffmpeg -version | head -n 1)"
log_success "Node.js : $(node -v)"
log_success "npm     : v$(npm -v)"

mkdir -p database

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    log_warn ".env created from .env.example. Please fill in your credentials before running npm start"
  else
    log_warn ".env file not found! Make sure you create it before running npm start"
  fi
fi

if [ -f "package.json" ]; then
  log_info "Installing dependencies from package.json..."
  npm install
  log_success "Done"
fi

echo ""
log_success "Setup complete! Run miko with: npm start"
