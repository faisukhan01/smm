#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# SMM — Oracle Cloud Always Free bootstrap (Ubuntu 24.04, ARM A1)
#
# Does everything on a fresh VM in one shot:
#   1. installs Docker + enables on boot
#   2. opens ports 80 / 443 / 3001 in the VM firewall (Oracle iptables)
#   3. clones the repo (pass your token for private repos)
#   4. scaffolds .env
#
# Usage on the VM (replace ghp_X with your GitHub token):
#   curl -fsSL -H "Authorization: Bearer ghp_X" \
#     https://raw.githubusercontent.com/faisukhan01/smm/main/deploy/oracle-setup.sh \
#     | SMM_GIT_TOKEN=ghp_X bash
# ─────────────────────────────────────────────────────────────────────
set -uo pipefail

REPO_URL="https://github.com/faisukhan01/smm.git"
APP_DIR="$HOME/smm"
BRANCH="main"

log() { echo -e "\n\033[1;36m[smm]\033[0m $*"; }
fail() { echo -e "\033[1;31m[smm] ERROR:\033[0m $*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || { sudo apt-get update -y && sudo apt-get install -y git curl; }

# ── 1. Docker ──────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker…"
  curl -fsSL https://get.docker.com | sudo sh
  sudo systemctl enable docker
  sudo systemctl start docker
fi
log "Docker: $(sudo docker --version)"

# ── 2. VM firewall (Oracle's Ubuntu image denies everything by default) ──
log "Opening ports 80 / 443 / 3001 in iptables…"
for PORT in 80 443 3001; do
  sudo iptables -I INPUT 5 -m state --state NEW -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT -m state --state NEW -p tcp --dport "$PORT" -j ACCEPT
done
command -v netfilter-persistent >/dev/null 2>&1 && sudo netfilter-persistent save >/dev/null 2>&1
log "Ports open (remember the OCI Security List ingress rules too — see guide)."

# ── 3. Clone ───────────────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  log "Repo already at $APP_DIR — pulling latest…"
  git -C "$APP_DIR" fetch --all --quiet && git -C "$APP_DIR" reset --hard "origin/$BRANCH" --quiet
else
  if [ -n "${SMM_GIT_TOKEN:-}" ]; then
    log "Cloning repo with token…"
    git clone --depth 1 --branch "$BRANCH" \
      "https://x-access-token:${SMM_GIT_TOKEN}@github.com/faisukhan01/smm.git" "$APP_DIR" \
      || fail "clone failed — check token validity"
  else
    git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR" \
      || fail "repo is private — re-run with SMM_GIT_TOKEN=ghp_X bash"
  fi
fi

# ── 4. .env scaffold ───────────────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/deploy/.env.oracle.example" "$APP_DIR/.env"
  log "Created $APP_DIR/.env — fill it:  nano $APP_DIR/.env"
fi

cd "$APP_DIR"
log "System prep complete. Next:"
echo "  1) nano .env                                  # paste your secrets"
echo "  2) sudo docker compose up -d --build          # build + start api/worker/caddy"
echo "  3) curl localhost:3001/api/v1/health          # expect {\"ok\":true}"
echo "  4) Vercel → API_BASE_URL = http://<this-vm-ip>:3001  (or https://api.yourdomain.com after DNS)"
