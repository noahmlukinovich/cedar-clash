#!/usr/bin/env bash
# Self-update: run every few minutes by cedar-clash-update.timer (as root).
# If `main` on GitHub has moved, it checks out the new commit, runs the tests, and only
# if they pass rebuilds and restarts the game (deploy/setup.sh --update, which rolls back
# if the new version won't start). A commit that fails is remembered and not retried.
#
# Status: https://<your-site>/deploy-status.json, or `journalctl -u cedar-clash-update`.
# To pause: systemctl disable --now cedar-clash-update.timer
set -euo pipefail

REPO="${CC_REPO:-/opt/cedar-clash/repo}"
BRANCH=main
STATE_DIR="${CC_STATE_DIR:-/var/lib/cedar-clash-deploy}"
STATUS="${CC_STATUS:-/opt/cedar-clash/app/public/deploy-status.json}"

install -d -m 0700 "$STATE_DIR"
cd "$REPO"

# Someone deployed another branch by hand (deploy/push.sh <ip> <branch>): leave it alone.
current="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current" != "$BRANCH" ]]; then
  echo "On branch $current, not $BRANCH: auto-update paused until $BRANCH is deployed again."
  exit 0
fi

git fetch --quiet origin "$BRANCH"
old="$(git rev-parse HEAD)"
new="$(git rev-parse "origin/$BRANCH")"
[[ "$old" == "$new" ]] && exit 0
if [[ "$(cat "$STATE_DIR/failed" 2>/dev/null || true)" == "$new" ]]; then
  exit 0 # already tried this commit and it failed; wait for the next one
fi

status() {
  # $1 = ok|failed, $2 = stage, $3 = commit
  local deployed
  deployed="$(git rev-parse HEAD)"
  printf '{"result":"%s","stage":"%s","commit":"%s","deployed":"%s","at":"%s"}\n' \
    "$1" "$2" "$3" "$deployed" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$STATUS.tmp" && mv "$STATUS.tmp" "$STATUS" || true
  chmod a+r "$STATUS" 2>/dev/null || true
}

fail() {
  echo "Auto-update to ${new:0:7} failed at: $1. Staying on ${old:0:7}." >&2
  echo "$new" >"$STATE_DIR/failed"
  git checkout --quiet -B "$BRANCH" "$old"
  npm ci --no-audit --no-fund >/dev/null 2>&1 || true
  status failed "$1" "$new"
  exit 1
}

echo "Updating ${old:0:7} -> ${new:0:7}"
git checkout --quiet -B "$BRANCH" "$new"
npm ci --no-audit --no-fund || fail "install"
npm test || fail "tests"
bash deploy/setup.sh --update || fail "build/start"
rm -f "$STATE_DIR/failed"
status ok deployed "$new"
echo "Deployed ${new:0:7}"
