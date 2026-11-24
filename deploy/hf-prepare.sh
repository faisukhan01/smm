#!/usr/bin/env bash
# Assembles a Hugging Face Space repo (Docker SDK) from this monorepo.
# Output: deploy/hf-space/ — a self-contained git-ready directory.
#
# After running, push it to your Space:
#   cd deploy/hf-space
#   git init -b main
#   git remote add space https://huggingface.co/spaces/<user>/<space-name>
#   git add -A && git commit -m "SMM deploy" && git push space main
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/deploy/hf-space"

# Keep README.md (front matter) written by hand; wipe the rest.
find "$DEST" -mindepth 1 -maxdepth 1 ! -name 'README.md' -exec rm -rf {} +

cp "$ROOT/package.json" "$ROOT/bun.lock" "$DEST/"
cp "$ROOT/deploy/Dockerfile.hf" "$DEST/Dockerfile"
mkdir -p "$DEST/deploy"
cp "$ROOT/deploy/start-all.sh" "$DEST/deploy/start-all.sh"
cp -r "$ROOT/packages" "$DEST/packages"
cp -r "$ROOT/prisma" "$DEST/prisma"

# mini-services: source only (no dist, no node_modules)
mkdir -p "$DEST/mini-services"
for SVC in api worker; do
  cp -r "$ROOT/mini-services/$SVC" "$DEST/mini-services/$SVC"
  find "$DEST/mini-services/$SVC" -name node_modules -type d -exec rm -rf {} + 2>/dev/null || true
  find "$DEST/mini-services/$SVC" -name dist -type d -exec rm -rf {} + 2>/dev/null || true
done

echo "Space payload ready at $DEST"
du -sh "$DEST"
