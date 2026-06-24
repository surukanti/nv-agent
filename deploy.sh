#!/usr/bin/env bash
# ── NV-Agent Production Deploy Script ──────────────────────────────
# Usage:
#   ./deploy.sh                    # Deploy to server via SSH
#   ./deploy.sh --pull-only        # Just pull latest images
#   ./deploy.sh --logs             # Follow logs after deploy
#   ./deploy.sh -h                 # Show help
#
# Prerequisites:
#   - SSH access to server with Docker + Docker Compose installed
#   - Server has docker-compose.prod.yml, Caddyfile, .env.prod
#   - SSH key authentication set up
#
# Configuration: edit variables below or set via environment

set -euo pipefail

# ════════════════════════════════════════════════════════════════════
# CONFIGURATION — EDIT THESE FOR YOUR SETUP
# ════════════════════════════════════════════════════════════════════
REMOTE_HOST="${DEPLOY_HOST:-your.server.com}"
REMOTE_USER="${DEPLOY_USER:-ubuntu}"
REMOTE_PATH="${DEPLOY_PATH:-/opt/nv-agent}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
# ════════════════════════════════════════════════════════════════════

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()  { echo -e "${BLUE}[deploy]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; }

usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --pull-only    Only pull latest images, don't restart
  --logs         Follow logs after deploy
  --no-build     Skip local build (use pre-pushed GHCR image)
  -h, --help     Show this help

Environment variables:
  DEPLOY_HOST     SSH host (default: your.server.com)
  DEPLOY_USER     SSH user (default: ubuntu)
  DEPLOY_PATH     Remote path (default: /opt/nv-agent)
  DEPLOY_SSH_KEY  SSH private key path (default: ~/.ssh/id_ed25519)

Examples:
  DEPLOY_HOST=my.vps DEPLOY_PATH=/opt/nv-agent ./deploy.sh
  ./deploy.sh --pull-only --logs
EOF
}

PULL_ONLY=false
FOLLOW_LOGS=false
NO_BUILD=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --pull-only) PULL_ONLY=true; shift ;;
    --logs) FOLLOW_LOGS=true; shift ;;
    --no-build) NO_BUILD=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# Validate required files exist locally
if [[ ! -f "$COMPOSE_FILE" ]]; then
  err "Missing $COMPOSE_FILE in current directory"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  err "Missing $ENV_FILE — copy .env.prod.example and fill in values"
  exit 1
fi

if [[ "$NO_BUILD" == false ]]; then
  # Build multi-arch locally if Docker Buildx is available
  log "Building multi-arch image locally..."
  if docker buildx version >/dev/null 2>&1; then
    docker buildx build \
      --platform linux/amd64,linux/arm64 \
      --tag ghcr.io/$(git config --get remote.origin.url | sed 's/.*[:/]\([^/]*\/[^.]*\).*/\1/')/nv-agent:latest \
      --load \
      .
    ok "Local build complete"
  else
    warn "Docker Buildx not available — skipping local build"
  fi
fi

# Deploy via SSH
log "Deploying to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}"

ssh -o StrictHostKeyChecking=accept-new "${REMOTE_USER}@${REMOTE_HOST}" <<ENDSSH
  set -euo pipefail
  cd "${REMOTE_PATH}"

  # Pull latest images
  echo "Pulling images..."
  docker compose -f ${COMPOSE_FILE} pull

  if [[ "${PULL_ONLY}" == "false" ]]; then
    # Start/recreate services
    echo "Starting services..."
    docker compose -f ${COMPOSE_FILE} up -d --remove-orphans

    # Clean up old images
    docker image prune -f

    # Wait for health checks
    echo "Waiting for health checks..."
    for i in {1..30}; do
      if docker compose -f ${COMPOSE_FILE} ps --format json | jq -e '.[] | select(.Health == "healthy")' >/dev/null 2>&1; then
        echo "All services healthy"
        break
      fi
      sleep 2
    done
  fi

  # Show status
  docker compose -f ${COMPOSE_FILE} ps
ENDSSH

ok "Deploy complete"

if [[ "$FOLLOW_LOGS" == true ]]; then
  log "Following logs (Ctrl+C to exit)..."
  ssh -o StrictHostKeyChecking=accept-new "${REMOTE_USER}@${REMOTE_HOST}" \
    "cd ${REMOTE_PATH} && docker compose -f ${COMPOSE_FILE} logs -f --tail=100"
fi