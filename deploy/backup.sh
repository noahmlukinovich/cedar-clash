#!/usr/bin/env bash
# Daily SQLite backup (installed as /etc/cron.daily/cedar-clash-backup). Keeps 14 days.
set -euo pipefail
DB=/var/lib/cedar-clash/cedar-clash.db
DIR=/var/backups/cedar-clash
[[ -f "$DB" ]] || exit 0
install -d -m 0700 "$DIR"
OUT="$DIR/cedar-clash-$(date +%F).db"
TMP=/var/lib/cedar-clash/backup-in-progress.db
# Run sqlite as the game's user so any files it touches keep the right owner.
rm -f "$TMP"
runuser -u cedarclash -- sqlite3 "$DB" ".backup '$TMP'"
mv "$TMP" "$OUT"
chown root:root "$OUT"
chmod 0600 "$OUT"
ln -sf "$OUT" "$DIR/latest.db"
find "$DIR" -name 'cedar-clash-*.db' -mtime +14 -delete
