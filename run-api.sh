#!/bin/sh
# Production API server launcher.
#
# Why this exists: Replit's deployment container PATH does not include nodejs.
# Node binaries in the nix store need Replit's RTLD loader to resolve library
# paths across dev/prod nix channel differences. The -wrapped node script handles
# this but uses a dev-specific bash shebang that doesn't exist in production.
# This script replicates the wrapper's RTLD setup in portable /bin/sh, then
# execs the actual node binary directly.

ENTRY="artifacts/api-server/dist/index.mjs"

# Replicate what the Replit node wrapper does — set up library path resolution.
# REPLIT_LD_LIBRARY_PATH, REPLIT_RTLD_LOADER, REPLIT_NIX_CHANNEL are set by
# Replit's runtime in both dev and production environments.
if [ -n "${REPLIT_LD_LIBRARY_PATH-}" ]; then
  if [ "${REPLIT_RTLD_LOADER:-}" = "1" ] && [ "${REPLIT_NIX_CHANNEL:-}" != "legacy" ]; then
    export LD_AUDIT="/nix/store/sj11ljhx4n79h9g0167f8lg8hp7n545m-replit_rtld_loader-1/rtld_loader.so"
  else
    export LD_LIBRARY_PATH="${REPLIT_LD_LIBRARY_PATH}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  fi
fi

# Strategy 0: PATH lookup — works when Replit sets up the environment correctly
if command -v node >/dev/null 2>&1; then
  NODE_BIN=$(command -v node)
  echo "[run-api] node (PATH): $NODE_BIN" >&2
  exec "$NODE_BIN" "$ENTRY"
fi

# Strategy 1: The actual node binary (process.execPath from build env).
# With RTLD setup above, this binary's library dependencies are resolved
# by the RTLD loader even if the production nix store uses different hashes.
for NODE_PATH in \
  "/nix/store/9cyx2v23dip6p9q98384k9v06c96qskb-nodejs-24.13.0/bin/node" \
  "/nix/store/s7awkfc4pym4zj139fsxrjs5xwf5hhnd-nodejs-24.13.0-wrapped/bin/node" \
  "/usr/local/bin/node" \
  "/usr/bin/node"; do
  if [ -x "$NODE_PATH" ]; then
    echo "[run-api] node (known path): $NODE_PATH" >&2
    exec "$NODE_PATH" "$ENTRY"
  fi
done

# Strategy 2: Glob expansion — avoids ls /nix/store/ (too slow to list)
for GLOB_PATH in /nix/store/*nodejs*24*/bin/node /nix/store/*nodejs*/bin/node; do
  if [ -x "$GLOB_PATH" ]; then
    echo "[run-api] node (glob): $GLOB_PATH" >&2
    exec "$GLOB_PATH" "$ENTRY"
  fi
done

# Diagnostics — print env vars that govern library resolution
echo "[run-api] ERROR: no executable node binary found" >&2
echo "[run-api] REPLIT_LD_LIBRARY_PATH=${REPLIT_LD_LIBRARY_PATH:-unset}" >&2
echo "[run-api] REPLIT_RTLD_LOADER=${REPLIT_RTLD_LOADER:-unset}" >&2
echo "[run-api] REPLIT_NIX_CHANNEL=${REPLIT_NIX_CHANNEL:-unset}" >&2
echo "[run-api] LD_AUDIT=${LD_AUDIT:-unset}" >&2
echo "[run-api] PATH=$PATH" >&2
exit 127
