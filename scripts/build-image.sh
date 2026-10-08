#!/usr/bin/env bash
# Build the Canopy container image with melange + apko (Wolfi packages).
# Usage: scripts/build-image.sh [tag]   e.g. scripts/build-image.sh canopy-map:dev
# Env: ARCH (default: host), VERSION (default: package.json), PACKAGES_ONLY=1 (skip apko)
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="${1:-canopy-map:dev}"
ARCH="${ARCH:-$(uname -m)}"
VERSION="${VERSION:-$(node -p "require('./package.json').version")}"
VERSION="${VERSION#v}"
SRC="$(mktemp -d)"
trap 'rm -rf "$SRC"' EXIT

git ls-files -z --cached --others --exclude-standard | rsync -a --from0 --files-from=- ./ "$SRC/"
sed -i "0,/^  version: .*/s//  version: ${VERSION%%-*}/" "$SRC/melange.yaml"

[ -f melange.rsa ] || melange keygen melange.rsa
melange build "$SRC/melange.yaml" --source-dir "$SRC" --arch "$ARCH" \
  --signing-key melange.rsa --out-dir packages --runner bubblewrap
[ "${PACKAGES_ONLY:-}" = "1" ] && exit 0
apko build apko.yaml "$TAG" canopy-map.tar --arch "$ARCH"

echo "Built canopy-map.tar ($TAG). Load it with: docker load < canopy-map.tar"
