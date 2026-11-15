#!/usr/bin/env bash
# Deploys the latest pushed code to the Cedar Clash droplet. Run from your computer:
#
#   deploy/push.sh <droplet-ip> [branch]
#
# The droplet pulls the branch from GitHub (push your commits first), rebuilds, and
# restarts only the game. Player data in /var/lib/cedar-clash is never touched.
# The branch defaults to the one you have checked out. Deploying `main` keeps the droplet's
# auto-update running; deploying any other branch pauses it until `main` is deployed again.
set -euo pipefail
IP="${1:?usage: deploy/push.sh <droplet-ip> [branch]}"
BRANCH="${2:-$(git rev-parse --abbrev-ref HEAD)}"
[[ "$BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "Odd branch name: $BRANCH" >&2; exit 1; }

if git rev-parse --verify -q "origin/$BRANCH" >/dev/null && [[ -n "$(git log "origin/$BRANCH..$BRANCH" --oneline 2>/dev/null)" ]]; then
  echo "Note: $BRANCH has commits that aren't pushed to GitHub yet; the droplet won't see them." >&2
fi

echo "Deploying $BRANCH to $IP…"
# The lock keeps this from overlapping with the droplet's own auto-update.
ssh "root@$IP" "flock /run/cedar-clash-deploy.lock bash -c 'set -e
cd /opt/cedar-clash/repo
git fetch --quiet origin $BRANCH
git checkout --quiet -B $BRANCH origin/$BRANCH
rm -f /var/lib/cedar-clash-deploy/failed
bash deploy/setup.sh --update'"
