#!/bin/bash
set -e

echo "[build-frontend] Building frontend..."
pnpm --filter @workspace/atlas-frontend run build

echo "[build-frontend] Removing devDependencies to reduce deployment image size..."
CI=true pnpm prune --prod

echo "[build-frontend] Removing API server source maps (not needed in production)..."
find artifacts/api-server/dist -name "*.map" -delete 2>/dev/null || true

echo "[build-frontend] Disk usage breakdown:"
echo "  node_modules: $(du -sh node_modules 2>/dev/null | cut -f1)"
echo "  /nix/store:   $(du -sh /nix/store 2>/dev/null | cut -f1)"
echo "  /home/runner: $(du -sh /home/runner 2>/dev/null | cut -f1)"
echo "  workspace:    $(du -sh /home/runner/workspace 2>/dev/null | cut -f1)"
