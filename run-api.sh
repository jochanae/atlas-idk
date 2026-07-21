#!/bin/sh
# Production API server launcher.
#
# The Replit GCE production container does not include nodejs in its nix store.
# We bundle the official Node.js binary (nodejs.org prebuilt) during the build
# step and store it at ./node-runtime. That binary links against standard Linux
# paths (/lib64/ld-linux-x86-64.so.2, /lib/x86_64-linux-gnu/libc.so.6) which
# exist in the production container regardless of nix channel or hash.
#
# Verified: the official Node.js 24 binary runs correctly on the Replit container.

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
