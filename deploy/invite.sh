#!/usr/bin/env bash
# Makes an invite code on the droplet. Run from your computer:
#
#   deploy/invite.sh <droplet-ip> [uses] [note]
#
# e.g. deploy/invite.sh 203.0.113.7 3 "dorm floor"  → one code good for 3 sign-ups.
set -euo pipefail
IP="${1:?usage: deploy/invite.sh <droplet-ip> [uses] [note]}"
USES="${2:-1}"
NOTE="${3:-}"
[[ "$USES" =~ ^[0-9]+$ ]] || { echo "uses must be a number" >&2; exit 1; }
ssh "root@$IP" cedar-clash-admin invite "$USES" "$(printf '%q' "$NOTE")"
