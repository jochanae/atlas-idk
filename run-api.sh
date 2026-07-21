#!/bin/sh
# Production API server launcher.
#
# Replit's deployment container does not expose the nix profile PATH, so bare
# "node" is not found. We discover the node binary without recursive find —
# `ls /nix/store/` is a single directory read (fast) and lets us construct
# the correct path regardless of which nix store hash production uses.

ENTRY="artifacts/api-server/dist/index.mjs"

# 1. Known explicit nix store paths — O(1) check, try first
for P in \
  /nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node \
  /nix/store/s7awkfc4pym4zj139fsxrjs5xwf5hhnd-nodejs-24.13.0-wrapped/bin/node \
  /usr/local/bin/node \
  /usr/bin/node; do
  if [ -x "$P" ]; then
    echo "[run-api] node: $P" >&2
    exec "$P" "$ENTRY"
  fi
done

# 2. Directory listing of /nix/store — one stat, no recursion, sub-second
#    even with thousands of packages. Finds whatever hash production uses.
NODE_DIR=$(ls /nix/store/ 2>/dev/null | grep "nodejs-24" | grep -v "wrapped" | head -1)
if [ -n "$NODE_DIR" ]; then
  P="/nix/store/$NODE_DIR/bin/node"
  if [ -x "$P" ]; then
    echo "[run-api] node (store scan): $P" >&2
    exec "$P" "$ENTRY"
  fi
fi

# 3. Any nodejs entry in the store (version-agnostic fallback)
NODE_DIR=$(ls /nix/store/ 2>/dev/null | grep "nodejs" | grep -v "wrapped" | head -1)
if [ -n "$NODE_DIR" ]; then
  P="/nix/store/$NODE_DIR/bin/node"
  if [ -x "$P" ]; then
    echo "[run-api] node (store fallback): $P" >&2
    exec "$P" "$ENTRY"
  fi
fi

# 4. Diagnostics — print what IS in the store so we can debug
echo "[run-api] ERROR: no executable node binary found" >&2
echo "[run-api] /nix/store entries matching 'node':" >&2
ls /nix/store/ 2>/dev/null | grep -i "node" | head -30 >&2
echo "[run-api] PATH=$PATH" >&2
exit 127
