---
name: run-api.sh node discovery — wrapped variant bug
description: Production API 502s caused by run-api.sh filtering out the only nodejs variant present in Replit's production nix store
---

## The bug
`run-api.sh` used `grep -v "wrapped"` on every nix store scan to find the node binary. In Replit's production container, the ONLY nodejs package present is the `-wrapped` variant (e.g. `nodejs-24.13.0-wrapped`). The exclusion filter silently killed every strategy, the script exited 127, and all `/api/*` requests returned 502.

## Diagnostics
Deployment logs show: `[run-api] ERROR: no executable node binary found` followed by exit status 127. The `ls /nix/store/ | grep -i "node"` diagnostic in the script shows `-wrapped` entries — if those are the only matches and the script filters them out, the failure is this bug.

## Fix
`run-api.sh` (workspace root): removed all `grep -v "wrapped"` filters. Discovery order: (0) `command -v node` via PATH, (1) known hardcoded paths including wrapped variant, (2) nix store scan over "nodejs-24" / "nodejs-22" / "nodejs" without exclusion.

`scripts/build-frontend-prod.sh`: now generates a fresh `run-api.sh` at each production build, capturing the exact node path from the build environment (build and run share the same nix closure in Replit deployments). Fallback chain written as backup.

## How to apply
Any time `axiomsystem.app/api/*` returns 502 with no Express headers — check deployment logs for `[run-api] ERROR: no executable node binary found`. If present, the node discovery is failing. Check the nix store scan output in the diagnostic lines and verify the `-wrapped` exclusion hasn't been re-introduced.

**Why:** Replit's production container strips the normal PATH but the nix store is present. The wrapped nodejs variant is the standard form in Replit's nix profile — scripts must not filter it out.
