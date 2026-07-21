#!/bin/sh
# Production API server launcher.
#
# Replit's deployment container does not expose the nix profile PATH, so bare
# "node" is not found. We discover the node binary via multiple strategies —
# no hardcoded nix store hashes that go stale across environment updates.
#
# build-frontend-prod.sh overwrites the ENTRY and NODE_BIN at build time
# when the exact path is known; this fallback chain handles fresh containers
# where the build-time path hasn't been written yet.

ENTRY="artifacts/api-server/dist/index.mjs"

# 0. PATH lookup — works in dev and when pnpm sets up the environment
if command -v node >/dev/null 2>&1; then
  NODE_BIN=$(command -v node)
  echo "[run-api] node (PATH): $NODE_BIN" >&2
  exec "$NODE_BIN" --enable-source-maps "$ENTRY"
fi

# 1. Known explicit nix store paths — O(1) check, try first.
#    Includes both wrapped and unwrapped variants; wrapped is the default
#    in Replit's nix profile and must NOT be filtered out.
for P in \
  /nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node \
  /nix/store/s7awkfc4pym4zj139fsxrjs5xwf5hhnd-nodejs-24.13.0-wrapped/bin/node \
  /usr/local/bin/node \
  /usr/bin/node; do
  if [ -x "$P" ]; then
    echo "[run-api] node (known path): $P" >&2
    exec "$P" --enable-source-maps "$ENTRY"
  fi
done

# 2. Directory listing of /nix/store — one stat, no recursion, sub-second
#    even with thousands of packages. Tries unwrapped first, then wrapped.
#    NOTE: do NOT filter out -wrapped; that is the active variant in Replit.
for VARIANT in "nodejs-24" "nodejs-22" "nodejs-20" "nodejs"; do
  for WRAPPED in "" "-wrapped"; do
    NODE_DIR=$(ls /nix/store/ 2>/dev/null | grep "${VARIANT}" | grep -v "nodejs-[0-9]*-[a-z]" | grep "${WRAPPED}$" | head -1 || true)
    if [ -n "$NODE_DIR" ]; then
      P="/nix/store/$NODE_DIR/bin/node"
      if [ -x "$P" ]; then
        echo "[run-api] node (store scan${WRAPPED}): $P" >&2
        exec "$P" --enable-source-maps "$ENTRY"
      fi
    fi
  done
done

# 3. Broad scan — any nix store entry with a node binary
NODE_DIR=$(ls /nix/store/ 2>/dev/null | grep "nodejs" | head -1 || true)
if [ -n "$NODE_DIR" ]; then
  P="/nix/store/$NODE_DIR/bin/node"
  if [ -x "$P" ]; then
    echo "[run-api] node (store fallback): $P" >&2
    exec "$P" --enable-source-maps "$ENTRY"
  fi
fi

# 4. Diagnostics — print what IS in the store so we can debug
echo "[run-api] ERROR: no executable node binary found" >&2
echo "[run-api] /nix/store entries matching 'node':" >&2
ls /nix/store/ 2>/dev/null | grep -i "node" | head -30 >&2
echo "[run-api] PATH=$PATH" >&2
exit 127
