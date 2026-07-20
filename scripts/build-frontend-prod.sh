#!/bin/bash
set -e

echo "[build-frontend] Building frontend..."
pnpm --filter @workspace/atlas-frontend run build

echo "[build-frontend] Removing API server source maps..."
find artifacts/api-server/dist -name "*.map" -delete 2>/dev/null || true

echo "[build-frontend] Removing large packages that are no longer needed at runtime..."

# Frontend-only packages (bundled into dist/public/ by Vite — not needed at runtime)
rm -rf node_modules/.pnpm/react-icons*/
rm -rf node_modules/.pnpm/lucide-react*/
rm -rf node_modules/.pnpm/three*/
rm -rf node_modules/.pnpm/pdfjs-dist*/
rm -rf node_modules/.pnpm/date-fns*/
rm -rf node_modules/.pnpm/jspdf*/
rm -rf node_modules/.pnpm/html2pdf.js*/
rm -rf node_modules/.pnpm/web-streams-polyfill*/
rm -rf node_modules/.pnpm/core-js*/
rm -rf node_modules/.pnpm/@shikijs*/

# Test tools (never needed at runtime)
rm -rf node_modules/.pnpm/playwright*/
rm -rf node_modules/.pnpm/@playwright*/
rm -rf node_modules/.pnpm/chromium-bidi*/
rm -rf node_modules/.pnpm/vitest*/
rm -rf node_modules/.pnpm/@testing-library*/
rm -rf node_modules/.pnpm/jsdom*/

# Build tools (builds are complete — safe to remove)
rm -rf node_modules/.pnpm/typescript*/
rm -rf node_modules/.pnpm/esbuild*/
rm -rf node_modules/.pnpm/drizzle-kit*/
rm -rf node_modules/.pnpm/vite*/
rm -rf node_modules/.pnpm/@vitejs*/
rm -rf node_modules/.pnpm/tailwindcss*/
rm -rf node_modules/.pnpm/@tailwindcss*/
rm -rf node_modules/.pnpm/lightningcss*/
rm -rf node_modules/.pnpm/prettier*/

echo "[build-frontend] node_modules size after cleanup: $(du -sh node_modules | cut -f1)"

echo "[build-frontend] Pruning pnpm store..."
# The pnpm content-addressable store lives inside the workspace at
# .local/share/pnpm/store/v10 and is included in the deployment image.
# It grows throughout dev sessions as new package versions are installed.
# All builds are complete at this point so the store is no longer needed.
PNPM_STORE="$(pnpm store path 2>/dev/null || echo '')"
if [ -n "$PNPM_STORE" ] && [ -d "$PNPM_STORE" ]; then
  echo "[build-frontend] Removing pnpm store at $PNPM_STORE..."
  rm -rf "$PNPM_STORE"
  echo "[build-frontend] pnpm store removed."
else
  echo "[build-frontend] pnpm store not found, skipping."
fi

echo "[build-frontend] Removing git history (not needed at runtime)..."
# .git is ~1 GB and grows with every checkpoint. The running server
# (node artifacts/api-server/dist/index.mjs) and static frontend
# have no dependency on version history at runtime.
rm -rf .git

echo "[build-frontend] Removing agent workspace files (not needed at runtime)..."
# .local contains agent skills (~1.3 GB of markdown/scripts) used only
# during development. They are not referenced by the production server.
rm -rf .local

echo "[build-frontend] Removing build cache..."
# .cache accumulates Vite/esbuild/turbo cache entries throughout dev sessions.
# All builds are complete — safe to remove.
rm -rf .cache

echo "[build-frontend] Removing attached_assets (agent screenshots, not needed at runtime)..."
# attached_assets contains screenshots taken by the dev agent (~700 MB+).
# Not referenced by the production server or frontend.
rm -rf attached_assets

echo "[build-frontend] Removing other dev-only workspace directories..."
rm -rf .agents        # agent memory files
rm -rf .project-workspaces  # dev workspace state
rm -rf docs handoffs supabase local .lovable .upm

echo "[build-frontend] Writing production API launcher..."
# The production container runs commands without the Replit nix profile PATH,
# so bare "node" is not found. Capture the absolute path to node right now
# (while the build environment has PATH set correctly) and bake it into a
# tiny launcher script that /bin/sh — which IS stable in the base container
# at /bin/sh — can execute directly without needing PATH at all.
NODE_BIN="$(which node)"
cat > run-api.sh << EOF
#!/bin/sh
exec $NODE_BIN artifacts/api-server/dist/index.mjs
EOF
chmod +x run-api.sh
echo "[build-frontend] Launcher written: exec $NODE_BIN"
