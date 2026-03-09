#!/usr/bin/env bash
# =============================================================================
# ModularMind V2 — Client Stack Installer
# =============================================================================
# One-liner install (served by Platform with pre-filled key):
#   curl -sSL https://platform.modularmind.dev/api/install/mmk_xxx | bash
#
# Or with options:
#   curl -sSL https://platform.modularmind.dev/api/install/mmk_xxx | bash -s -- \
#     --gpu \
#     --domain mm.example.com
# =============================================================================

set -euo pipefail

# --- Colors & helpers ---------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m'
BOLD='\033[1m'

info()  { printf "${BLUE}[INFO]${NC} %s\n" "$1"; }
ok()    { printf "${GREEN}[OK]${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}[WARN]${NC} %s\n" "$1"; }
err()   { printf "${RED}[ERROR]${NC} %s\n" "$1" >&2; }
die()   { err "$1"; exit 1; }

# --- Defaults -----------------------------------------------------------------
# When served by the Platform API, ENGINE_KEY and PLATFORM_URL are pre-filled.
# They can also be passed via --key and --platform-url flags.

MM_VERSION="latest"
ENGINE_KEY=""
PLATFORM_URL=""
DOMAIN=""
INSTALL_DIR="./modularmind"
USE_GPU=false
USE_TRAEFIK=false
INTERACTIVE=true

# --- Usage --------------------------------------------------------------------

usage() {
    cat <<EOF
${BOLD}ModularMind V2 — Client Stack Installer${NC}

Usage:
  install.sh [OPTIONS]

Options:
  --key KEY             Engine API key (from Platform admin)
  --platform-url URL    Platform URL (pre-filled when served by Platform)
  --domain DOMAIN       Domain name (enables Traefik labels)
  --version VER         Image version tag (default: latest)
  --dir PATH            Install directory (default: ./modularmind)
  --gpu                 Enable NVIDIA GPU for Ollama
  --traefik             Enable Traefik integration (auto TLS)
  --non-interactive     Skip interactive prompts
  -h, --help            Show this help

Examples:
  # One-liner from Platform (key is pre-filled):
  curl -sSL https://platform.example.com/api/install/mmk_xxx | bash

  # With GPU + custom domain:
  curl -sSL https://platform.example.com/api/install/mmk_xxx | bash -s -- --gpu --domain mm.example.com
EOF
}

# --- Parse arguments ----------------------------------------------------------

while [[ $# -gt 0 ]]; do
    case $1 in
        --key)             ENGINE_KEY="$2"; shift 2 ;;
        --platform-url)    PLATFORM_URL="$2"; shift 2 ;;
        --domain)          DOMAIN="$2"; shift 2 ;;
        --version)         MM_VERSION="$2"; shift 2 ;;
        --dir)             INSTALL_DIR="$2"; shift 2 ;;
        --gpu)             USE_GPU=true; shift ;;
        --traefik)         USE_TRAEFIK=true; shift ;;
        --non-interactive) INTERACTIVE=false; shift ;;
        -h|--help)         usage; exit 0 ;;
        *)                 die "Unknown option: $1 (use --help for usage)" ;;
    esac
done

# --- Validate required params ------------------------------------------------

if [[ -z "$ENGINE_KEY" ]]; then
    die "Engine API key is required. Use --key or install via Platform one-liner."
fi

if [[ -z "$PLATFORM_URL" ]]; then
    die "Platform URL is required. Use --platform-url or install via Platform one-liner."
fi

# --- Prerequisites ------------------------------------------------------------

check_prerequisites() {
    info "Checking prerequisites..."

    if ! command -v docker &>/dev/null; then
        die "Docker is not installed. Install it from https://docs.docker.com/engine/install/"
    fi

    local docker_version
    docker_version=$(docker --version | grep -oP '\d+' | head -1)
    if [[ "$docker_version" -lt 20 ]]; then
        die "Docker 20+ required (found: $(docker --version))"
    fi
    ok "Docker $(docker --version | grep -oP '[\d.]+')"

    if ! docker compose version &>/dev/null; then
        die "Docker Compose v2+ is required. Install: https://docs.docker.com/compose/install/"
    fi
    ok "Docker Compose $(docker compose version --short)"

    if ! command -v curl &>/dev/null; then
        die "curl is required but not installed."
    fi

    if ! command -v openssl &>/dev/null; then
        die "openssl is required but not installed."
    fi

    ok "All prerequisites met"
}

# --- GPU detection & driver install -------------------------------------------

has_nvidia_hardware() {
    if command -v lspci &>/dev/null; then
        lspci | grep -qi 'nvidia' && return 0
    fi
    if [[ -d /sys/bus/pci/devices ]]; then
        grep -rql '0x10de' /sys/bus/pci/devices/*/vendor 2>/dev/null && return 0
    fi
    return 1
}

has_nvidia_drivers() {
    command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null
}

has_nvidia_container_toolkit() {
    command -v nvidia-ctk &>/dev/null && docker info 2>/dev/null | grep -qi 'nvidia'
}

install_nvidia_drivers() {
    info "Installing NVIDIA drivers..."

    if ! command -v apt-get &>/dev/null; then
        warn "Automatic driver install only supports apt-based distros (Ubuntu/Debian)."
        warn "Please install NVIDIA drivers manually, then re-run this script with --gpu."
        return 1
    fi

    if command -v ubuntu-drivers &>/dev/null; then
        info "Using ubuntu-drivers to install recommended driver..."
        sudo ubuntu-drivers install || {
            err "ubuntu-drivers install failed"
            return 1
        }
    else
        info "Installing nvidia-driver via apt..."
        sudo apt-get update -qq
        local driver_pkg
        driver_pkg=$(apt-cache search '^nvidia-driver-[0-9]+$' 2>/dev/null \
            | sort -t'-' -k3 -n | tail -1 | awk '{print $1}')
        if [[ -z "$driver_pkg" ]]; then
            err "No nvidia-driver package found in apt."
            warn "Add the NVIDIA PPA or install drivers manually."
            return 1
        fi
        info "Installing $driver_pkg..."
        sudo apt-get install -y "$driver_pkg" || {
            err "Failed to install $driver_pkg"
            return 1
        }
    fi

    ok "NVIDIA drivers installed"
    warn "A reboot is required for drivers to take effect."
    printf "  Reboot now and re-run the installer after? [Y/n] "
    read -r answer
    if [[ "$answer" != "n" && "$answer" != "N" ]]; then
        info "Rebooting in 5 seconds... Re-run this script after reboot."
        sleep 5
        sudo reboot
    else
        warn "Skipping reboot. GPU may not work until you reboot."
        warn "Continuing install in CPU mode."
        return 1
    fi
}

install_nvidia_container_toolkit() {
    info "Installing NVIDIA Container Toolkit..."

    if ! command -v apt-get &>/dev/null; then
        warn "Automatic install only supports apt-based distros (Ubuntu/Debian)."
        warn "See: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html"
        return 1
    fi

    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
        | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg 2>/dev/null

    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
        | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
        | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null

    sudo apt-get update -qq
    sudo apt-get install -y nvidia-container-toolkit || {
        err "Failed to install nvidia-container-toolkit"
        return 1
    }

    sudo nvidia-ctk runtime configure --runtime=docker
    sudo systemctl restart docker

    ok "NVIDIA Container Toolkit installed and configured"
}

detect_gpu() {
    if $USE_GPU; then
        info "GPU mode enabled via --gpu flag"
        if ! has_nvidia_drivers; then
            warn "GPU flag set but NVIDIA drivers not found."
            if has_nvidia_hardware; then
                install_nvidia_drivers || { USE_GPU=false; return; }
            else
                warn "No NVIDIA hardware detected. Falling back to CPU mode."
                USE_GPU=false
                return
            fi
        fi
        if ! has_nvidia_container_toolkit; then
            install_nvidia_container_toolkit || {
                warn "Container toolkit install failed. Falling back to CPU mode."
                USE_GPU=false
                return
            }
        fi
        return
    fi

    if ! $INTERACTIVE; then
        info "Non-interactive mode: GPU disabled (use --gpu to enable)"
        return
    fi

    if ! has_nvidia_hardware; then
        info "No NVIDIA GPU detected (Ollama will run in CPU mode)"
        return
    fi

    if ! has_nvidia_drivers; then
        warn "NVIDIA GPU hardware detected but drivers are not installed."
        printf "  Install NVIDIA drivers automatically? [Y/n] "
        read -r answer
        if [[ "$answer" != "n" && "$answer" != "N" ]]; then
            install_nvidia_drivers || {
                info "Continuing without GPU support"
                return
            }
        else
            info "Skipping GPU driver install. Ollama will run in CPU mode."
            return
        fi
    fi

    local gpu_name
    gpu_name=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
    info "NVIDIA GPU detected: $gpu_name"

    if ! has_nvidia_container_toolkit; then
        warn "NVIDIA Container Toolkit is not installed (required for Docker GPU access)."
        printf "  Install NVIDIA Container Toolkit automatically? [Y/n] "
        read -r answer
        if [[ "$answer" != "n" && "$answer" != "N" ]]; then
            install_nvidia_container_toolkit || {
                info "Continuing without GPU support"
                return
            }
        else
            info "Skipping toolkit install. Ollama will run in CPU mode."
            return
        fi
    fi

    printf "  Enable GPU acceleration for Ollama? [Y/n] "
    read -r answer
    if [[ "$answer" != "n" && "$answer" != "N" ]]; then
        USE_GPU=true
        ok "GPU acceleration enabled"
    fi
}

# --- Generate secrets ---------------------------------------------------------

generate_secrets() {
    info "Generating secrets..."
    DB_PASSWORD=$(openssl rand -base64 24 | tr -d '\n')
    SECRET_KEY=$(openssl rand -base64 32 | tr -d '\n')
    S3_SECRET_KEY=$(openssl rand -base64 24 | tr -d '\n')
    ok "Secrets generated"
}

# --- Build profiles -----------------------------------------------------------

build_profiles() {
    local profiles=()

    if $USE_GPU; then
        profiles+=("gpu")
    else
        profiles+=("ollama")
    fi

    profiles+=("storage")

    COMPOSE_PROFILES=$(IFS=,; echo "${profiles[*]}")
    info "Active profiles: $COMPOSE_PROFILES"
}

# --- Fetch config & authenticate registry ------------------------------------

fetch_config() {
    info "Fetching install config from Platform..."

    local config_url="$PLATFORM_URL/api/install/$ENGINE_KEY/config"
    local config_json
    config_json=$(curl -sSf "$config_url") || die "Failed to fetch config from Platform. Check your API key."

    # Parse JSON config (use python3 which is available on most systems)
    REGISTRY_SERVER=$(echo "$config_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['registry']['server'])")
    REGISTRY_USER=$(echo "$config_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['registry']['username'])")
    REGISTRY_PASS=$(echo "$config_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['registry']['password'])")

    if [[ -n "$REGISTRY_PASS" ]]; then
        ok "Config received from Platform"
    else
        die "Platform returned empty registry credentials. Contact your administrator."
    fi
}

docker_login() {
    info "Authenticating with container registry..."
    echo "$REGISTRY_PASS" | docker login "$REGISTRY_SERVER" -u "$REGISTRY_USER" --password-stdin || \
        die "Docker registry login failed. Check your credentials."
    ok "Authenticated with $REGISTRY_SERVER"
}

# --- Download files -----------------------------------------------------------

download_files() {
    info "Setting up in $INSTALL_DIR..."
    mkdir -p "$INSTALL_DIR"

    info "Downloading docker-compose.yml from Platform..."
    curl -sSf "$PLATFORM_URL/api/install/compose" \
        -o "$INSTALL_DIR/docker-compose.yml" || die "Failed to download docker-compose.yml"

    ok "Files downloaded"
}

# --- Write .env ---------------------------------------------------------------

write_env() {
    info "Writing .env configuration..."

    local ollama_url="http://ollama:11434"
    if $USE_GPU; then
        ollama_url="http://ollama-gpu:11434"
    fi

    local traefik_enabled="false"
    if $USE_TRAEFIK; then
        traefik_enabled="true"
    fi

    cat > "$INSTALL_DIR/.env" <<EOF
# =============================================================================
# ModularMind V2 — Generated by install.sh ($(date -u +%Y-%m-%dT%H:%M:%SZ))
# =============================================================================

# Profiles
COMPOSE_PROFILES=$COMPOSE_PROFILES

# Image version
MM_VERSION=$MM_VERSION

# Database
DB_USER=modularmind
DB_PASSWORD=$DB_PASSWORD

# Engine
SECRET_KEY=$SECRET_KEY

# Platform connection
PLATFORM_URL=$PLATFORM_URL
ENGINE_API_KEY=$ENGINE_KEY

# Domain & TLS
DOMAIN=$DOMAIN
TRAEFIK_ENABLED=$traefik_enabled

# Engine port (direct access)
PROXY_PORT=8080

# S3 (built-in MinIO)
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=modularmind
S3_SECRET_KEY=$S3_SECRET_KEY

# Ollama
OLLAMA_BASE_URL=$ollama_url
OLLAMA_KEEP_ALIVE=24h

# Gateway
GATEWAY_ENABLED=true

# Monitoring
GRAFANA_PASSWORD=$(openssl rand -base64 12 | tr -d '\n')
GRAFANA_PORT=3333
EOF

    ok ".env written"
}

# --- Pull & start -------------------------------------------------------------

start_services() {
    # Create proxy-network if it doesn't exist (required by docker-compose.client.yml)
    docker network create proxy-network 2>/dev/null || true

    info "Pulling images (this may take a few minutes)..."
    (cd "$INSTALL_DIR" && docker compose pull)
    ok "Images pulled"

    info "Running database migrations..."
    (cd "$INSTALL_DIR" && docker compose run --rm engine alembic upgrade head)
    ok "Migrations complete"

    info "Starting services..."
    (cd "$INSTALL_DIR" && docker compose up -d)
    ok "Services started"
}

# --- Health check -------------------------------------------------------------

wait_for_health() {
    info "Waiting for engine to be healthy..."

    local max_wait=90
    local elapsed=0
    local engine_url="http://127.0.0.1:8080/health"

    while [[ $elapsed -lt $max_wait ]]; do
        if curl -sf "$engine_url" &>/dev/null; then
            ok "Engine is healthy!"
            return 0
        fi
        sleep 3
        elapsed=$((elapsed + 3))
        printf "  Waiting... (%ds/%ds)\r" "$elapsed" "$max_wait"
    done

    echo ""
    warn "Engine health check timed out after ${max_wait}s"
    warn "Services may still be starting. Check with: cd $INSTALL_DIR && docker compose logs -f"
}

# --- Print summary ------------------------------------------------------------

print_summary() {
    local access_url="http://localhost:8080"
    if [[ -n "$DOMAIN" ]]; then
        if $USE_TRAEFIK; then
            access_url="https://$DOMAIN"
        else
            access_url="http://$DOMAIN:8080"
        fi
    fi

    echo ""
    printf "${GREEN}${BOLD}"
    echo "============================================"
    echo "  ModularMind V2 is running!"
    echo "============================================"
    printf "${NC}"
    echo ""
    echo "  Chat:       $access_url/"
    echo "  Ops:        $access_url/ops/"
    echo "  API Docs:   $access_url/api/docs"
    echo "  Health:     $access_url/health"
    echo ""
    echo "  Profiles:   $COMPOSE_PROFILES"
    echo "  Version:    $MM_VERSION"
    echo "  Directory:  $(cd "$INSTALL_DIR" && pwd)"
    echo ""

    if [[ -n "$PLATFORM_URL" ]]; then
        echo "  Platform:   $PLATFORM_URL (sync active)"
    else
        echo "  Platform:   not configured (standalone mode)"
    fi

    echo ""
    echo "  Next steps:"

    if [[ -n "$DOMAIN" ]] && ! $USE_TRAEFIK; then
        echo "  - Configure your reverse proxy to route $DOMAIN → localhost:8080"
    fi

    echo "  - View logs:   cd $INSTALL_DIR && docker compose logs -f"
    echo "  - Stop:        cd $INSTALL_DIR && docker compose down"
    echo "  - Update:      cd $INSTALL_DIR && docker compose pull && docker compose up -d"
    echo ""
}

# --- Main ---------------------------------------------------------------------

main() {
    echo ""
    printf "${BOLD}ModularMind V2 — Client Stack Installer${NC}\n"
    echo ""

    check_prerequisites
    detect_gpu
    generate_secrets
    build_profiles
    fetch_config
    docker_login
    download_files
    write_env
    start_services
    wait_for_health
    print_summary
}

main
