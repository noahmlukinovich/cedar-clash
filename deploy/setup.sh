#!/usr/bin/env bash
# Installs or updates Cedar Clash on an Ubuntu 24.04 server. Run as root from a checkout of
# the repo (cloud-init does this on first boot; deploy/push.sh does it on updates).
#
#   bash deploy/setup.sh           full setup (packages, user, firewall, Caddy, service)
#   bash deploy/setup.sh --update  rebuild and restart the game only
#
# Safe to run again: every step checks before it changes anything.
set -euo pipefail

APP_USER=cedarclash
APP_DIR=/opt/cedar-clash/app
DATA_DIR=/var/lib/cedar-clash
BACKUP_DIR=/var/backups/cedar-clash
PORT=8787
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-full}"

log() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi
export DEBIAN_FRONTEND=noninteractive

if [[ "$MODE" != "--update" ]]; then
  log "Installing packages"
  apt-get update -q
  apt-get install -y -q curl ca-certificates gnupg git ufw sqlite3 debian-keyring debian-archive-keyring apt-transport-https unattended-upgrades

  if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]]; then
    log "Installing Node.js 22"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y -q nodejs
  fi

  if ! command -v caddy >/dev/null; then
    log "Installing Caddy"
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
    apt-get update -q
    apt-get install -y -q caddy
  fi

  log "Creating the service user"
  id "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --no-create-home --shell /usr/sbin/nologin "$APP_USER"
  install -d -o "$APP_USER" -g "$APP_USER" -m 0700 "$DATA_DIR"
  install -d -o root -g root -m 0700 "$BACKUP_DIR"

  # Key-only SSH, but only if a key is installed (never lock the owner out).
  if [[ -s /root/.ssh/authorized_keys ]] && [[ ! -f /etc/ssh/sshd_config.d/60-cedar-clash.conf ]]; then
    log "SSH: keys only"
    printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' >/etc/ssh/sshd_config.d/60-cedar-clash.conf
    sshd -t && systemctl reload ssh || rm -f /etc/ssh/sshd_config.d/60-cedar-clash.conf
  fi

  log "Firewall: SSH, HTTP, HTTPS only"
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
fi

log "Building the game"
cd "$REPO_DIR"
npm ci --no-audit --no-fund
npm run build

log "Installing the build to $APP_DIR"
install -d -o root -g root -m 0755 "$APP_DIR" "$APP_DIR/public"
rsync_like() { rm -rf "$2.new" && cp -r "$1" "$2.new" && rm -rf "$2" && mv "$2.new" "$2"; }
rsync_like dist "$APP_DIR/public"
install -o root -g root -m 0644 server-dist/server.mjs "$APP_DIR/server.mjs"
chmod -R a+rX "$APP_DIR"

if [[ "$MODE" != "--update" ]]; then
  log "systemd service"
  install -o root -g root -m 0644 deploy/cedar-clash.service /etc/systemd/system/cedar-clash.service
  install -o root -g root -m 0755 deploy/cedar-clash-admin /usr/local/bin/cedar-clash-admin
  install -o root -g root -m 0755 deploy/backup.sh /etc/cron.daily/cedar-clash-backup
  systemctl daemon-reload
  systemctl enable cedar-clash >/dev/null

  log "Caddy (HTTPS)"
  if [[ -z "${SITE_HOST:-}" ]]; then
    IP="$(curl -fs --max-time 3 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address || true)"
    [[ -n "$IP" ]] || IP="$(curl -fs --max-time 5 https://api.ipify.org || true)"
    [[ -n "$IP" ]] || { echo "Couldn't work out this server's public IP; rerun with SITE_HOST=your.host" >&2; exit 1; }
    SITE_HOST="${IP//./-}.sslip.io"
  fi
  sed -e "s|__SITE_HOST__|$SITE_HOST|g" -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__PORT__|$PORT|g" deploy/Caddyfile >/etc/caddy/Caddyfile.new
  caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile.new >/dev/null
  mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
  systemctl enable caddy >/dev/null
  systemctl reload-or-restart caddy
  echo "$SITE_HOST" >/opt/cedar-clash/site-host
fi

log "Restarting the game server"
systemctl restart cedar-clash
for _ in $(seq 1 20); do
  if curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null; then break; fi
  sleep 0.5
done
curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null || { journalctl -u cedar-clash -n 40 --no-pager; echo "The game server did not start." >&2; exit 1; }

if [[ "$MODE" != "--update" ]] && [[ ! -s /root/cedar-clash-first-invite.txt ]]; then
  cedar-clash-admin invite 5 "first invites" >/root/cedar-clash-first-invite.txt
fi

log "Done: https://$(cat /opt/cedar-clash/site-host 2>/dev/null || echo '<your host>')"
[[ -s /root/cedar-clash-first-invite.txt ]] && echo "First invite code: $(cat /root/cedar-clash-first-invite.txt)"
