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

echo "[build-frontend] Bundling Node.js runtime..."
# The Replit GCE production container does not include nodejs in its nix store.
# The build container DOES have internet access, so we download the official
# Node.js binary from nodejs.org. Unlike the nix-built binary (which uses a
# nix-specific ELF interpreter and nix-specific library RPATHs), the official
# binary links against standard system paths (/lib64/ld-linux-x86-64.so.2,
# /lib/x86_64-linux-gnu/libc.so.6, etc.) that are present in the production
# container. Verified working in both dev and production containers.
NODE_VER="v24.13.0"
NODE_TAR="node-${NODE_VER}-linux-x64.tar.gz"
NODE_URL="https://nodejs.org/dist/${NODE_VER}/${NODE_TAR}"

echo "[build-frontend] Downloading Node.js ${NODE_VER} from nodejs.org..."
if curl -fsSL --retry 3 "${NODE_URL}" -o "/tmp/${NODE_TAR}"; then
  tar xf "/tmp/${NODE_TAR}" -C /tmp --wildcards '*/bin/node'
  cp "/tmp/node-${NODE_VER}-linux-x64/bin/node" ./node-runtime
  chmod +x ./node-runtime
  echo "[build-frontend] Bundled node: $(./node-runtime --version)"
  BUNDLED_NODE_OK=1
else
  echo "[build-frontend] WARNING: failed to download Node.js — falling back to nix store discovery" >&2
  BUNDLED_NODE_OK=0
fi

echo "[build-frontend] Writing production API launcher..."

cat > run-api.sh << 'LAUNCHER_EOF'
#!/bin/sh
# Production API server launcher.
#
# The Replit GCE production container does not include nodejs in its nix store.
# We bundle the official Node.js binary (nodejs.org prebuilt) during the build
# step and store it at ./node-runtime. That binary links against standard Linux
# paths (/lib64/ld-linux-x86-64.so.2) which exist in the production container.

ENTRY="artifacts/api-server/dist/index.mjs"

# Strategy 0: Bundled official binary (downloaded from nodejs.org at build time).
# This is the primary path in production. Uses standard /lib64/ paths — not
# nix-store-specific — so it works regardless of nix channel or hash.
if [ -x "./node-runtime" ]; then
  echo "[run-api] node (bundled official): $(./node-runtime --version 2>/dev/null)" >&2
  exec "./node-runtime" "$ENTRY"
fi

# Strategy 1: PATH lookup (works in dev, may work in some production configs)
if command -v node >/dev/null 2>&1; then
  NODE_BIN=$(command -v node)
  echo "[run-api] node (PATH): $NODE_BIN" >&2
  exec "$NODE_BIN" "$ENTRY"
fi

# Strategy 2: Known nix store paths (fallback for dev / alternate environments)
for NODE_PATH in \
  "/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node" \
  "/nix/store/s7awkfc4pym4zj139fsxrjs5xwf5hhnd-nodejs-24.13.0-wrapped/bin/node" \
  "/usr/local/bin/node" \
  "/usr/bin/node"; do
  if [ -x "$NODE_PATH" ]; then
    echo "[run-api] node (nix known): $NODE_PATH" >&2
    exec "$NODE_PATH" "$ENTRY"
  fi
done

# Strategy 3: Glob nix store (avoids slow ls /nix/store/)
for GLOB_PATH in /nix/store/*nodejs*24*/bin/node /nix/store/*nodejs*/bin/node; do
  if [ -x "$GLOB_PATH" ]; then
    echo "[run-api] node (nix glob): $GLOB_PATH" >&2
    exec "$GLOB_PATH" "$ENTRY"
  fi
done

echo "[run-api] FATAL: no executable node binary found" >&2
echo "[run-api] ./node-runtime exists: $(test -e ./node-runtime && echo yes || echo no)" >&2
echo "[run-api] PATH=$PATH" >&2
exit 127
LAUNCHER_EOF

chmod +x run-api.sh
echo "[build-frontend] run-api.sh ready"
