#!/bin/sh
# Production API server launcher.
#
# The Replit deployment container does not expose the nix profile PATH, so
# bare "node" is not found at runtime. We also cannot hardcode a nix store
# hash because the production nix layer is built from a different closure
# than the dev environment, giving node a different store path.
#
# Strategy: try known candidates in order, then fall back to find-based
# discovery that is hash-independent. /bin/sh is stable in the base container.

ENTRY="artifacts/api-server/dist/index.mjs"

# 1. Candidates from known nix store paths (fast O(1) checks)
for CANDIDATE in \
  /nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node \
  /nix/store/s7awkfc4pym4zj139fsxrjs5xwf5hhnd-nodejs-24.13.0-wrapped/bin/node \
  /usr/local/bin/node \
  /usr/bin/node; do
  if [ -x "$CANDIDATE" ]; then
    echo "[run-api] node: $CANDIDATE" >&2
    exec "$CANDIDATE" "$ENTRY"
  fi
done

# 2. Hash-independent discovery via find (works regardless of nixpkgs revision)
#    -maxdepth 3 = /nix/store/<hash>/<subdir>/node — fast even with many packages
NODE_BIN=$(find /nix/store -maxdepth 3 -type f -name "node" 2>/dev/null \
  | grep "nodejs-24" | grep -v "wrapped" | head -1)
if [ -n "$NODE_BIN" ] && [ -x "$NODE_BIN" ]; then
  echo "[run-api] node (discovered): $NODE_BIN" >&2
  exec "$NODE_BIN" "$ENTRY"
fi

# 3. Any node binary in the nix store as last resort
NODE_BIN=$(find /nix/store -maxdepth 3 -type f -name "node" 2>/dev/null \
  | grep -v "wrapped" | head -1)
if [ -n "$NODE_BIN" ] && [ -x "$NODE_BIN" ]; then
  echo "[run-api] node (fallback): $NODE_BIN" >&2
  exec "$NODE_BIN" "$ENTRY"
fi

# 4. Diagnostics — print what IS available so we can debug
echo "[run-api] ERROR: no executable node binary found" >&2
echo "[run-api] /nix/store entries containing 'node':" >&2
ls /nix/store/ 2>/dev/null | grep -i "node" | head -20 >&2
echo "[run-api] PATH=$PATH" >&2
exit 127
