#!/bin/bash
set -e

echo "[post-build] Pruning pnpm store..."
pnpm store prune

echo "[post-build] Removing devDependencies from node_modules..."
pnpm prune --prod

echo "[post-build] Removing API server source maps (not needed in production)..."
find artifacts/api-server/dist -name "*.map" -delete 2>/dev/null || true

echo "[post-build] Done. Approximate node_modules size:"
du -sh node_modules 2>/dev/null || true
