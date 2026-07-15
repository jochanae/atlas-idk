#!/bin/bash
set -e

echo "[build-frontend] Building frontend..."
pnpm --filter @workspace/atlas-frontend run build

echo "[build-frontend] Removing devDependencies to reduce deployment image size..."
pnpm prune --prod

echo "[build-frontend] Removing API server source maps (not needed in production)..."
find artifacts/api-server/dist -name "*.map" -delete 2>/dev/null || true

echo "[build-frontend] Image size after cleanup:"
du -sh node_modules 2>/dev/null || true
