#!/usr/bin/env bash
# Usage: docker/backup.sh   Env: BACKUP_DIR (./backups), RETENTION_DAYS (30), COMPOSE ("docker compose")
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
COMPOSE="${COMPOSE:-docker compose}"
TS="$(date +%Y%m%d-%H%M%S)"
DB_OUT="$BACKUP_DIR/canopy-db-$TS.db.gz"
PHOTOS_OUT="$BACKUP_DIR/canopy-photos-$TS.tar.gz"

mkdir -p "$BACKUP_DIR"
umask 077

$COMPOSE exec -T app node scripts/backup.mjs db > "$DB_OUT.part"
mv "$DB_OUT.part" "$DB_OUT"
$COMPOSE exec -T app node scripts/backup.mjs photos > "$PHOTOS_OUT.part"
mv "$PHOTOS_OUT.part" "$PHOTOS_OUT"

find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'canopy-db-*.db.gz' -o -name 'canopy-photos-*.tar.gz' \) \
  -mtime "+$RETENTION_DAYS" -print -delete | sed 's/^/pruned: /'

echo "backup ok: $DB_OUT ($(du -h "$DB_OUT" | cut -f1)), $PHOTOS_OUT ($(du -h "$PHOTOS_OUT" | cut -f1))"
