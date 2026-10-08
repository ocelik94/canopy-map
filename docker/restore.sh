#!/usr/bin/env bash
# Usage: docker/restore.sh <canopy-db-*.db.gz> [canopy-photos-*.tar.gz]   Env: COMPOSE, YES=1 (no prompt)
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="${COMPOSE:-docker compose}"
DB_FILE="${1:-}"
PHOTOS_FILE="${2:-}"

[ -n "$DB_FILE" ] && [ -f "$DB_FILE" ] || { echo "Usage: $0 <db.db.gz> [photos.tar.gz]" >&2; exit 1; }
[ -z "$PHOTOS_FILE" ] || [ -f "$PHOTOS_FILE" ] || { echo "No such file: $PHOTOS_FILE" >&2; exit 1; }
gzip -t "$DB_FILE"
[ -z "$PHOTOS_FILE" ] || gzip -t "$PHOTOS_FILE"

echo "This stops the app and replaces the database${PHOTOS_FILE:+ and photos} with:"
echo "  $DB_FILE${PHOTOS_FILE:+, $PHOTOS_FILE}"
if [ "${YES:-}" != "1" ]; then
  read -r -p "Type 'restore' to continue: " answer
  [ "$answer" = "restore" ] || { echo "Aborted."; exit 1; }
fi

$COMPOSE stop app
$COMPOSE run --rm -T --no-deps app scripts/backup.mjs restore-db < "$DB_FILE"
[ -z "$PHOTOS_FILE" ] || $COMPOSE run --rm -T --no-deps app scripts/backup.mjs restore-photos < "$PHOTOS_FILE"
$COMPOSE start app
echo "Restore complete. Migrations run automatically when the app starts."
