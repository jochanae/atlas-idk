---
name: Sync workflow
description: How to keep Replit frontend in sync with atlas-idk GitHub repo (Lovable pushes there)
---

## The problem
Lovable publishes frontend changes to `jochanae/atlas-idk` on GitHub. Replit has its own copy at `artifacts/atlas-frontend/`. They drift apart.

## The solution
`scripts/sync-frontend.sh` — pulls the latest from atlas-idk main branch, diffs by md5, copies changed files.

**Run it any time Lovable pushes a change.**

## Files that must NOT be overwritten by sync
- `vite.config.ts` — Replit-patched with PORT/BASE_PATH env vars + @workspace/api-client-react alias
- (sync script already skips this)

## Files that need patching AFTER every sync
- `src/pages/onboarding.tsx` — GitHub version has `overflow: "hidden"` which breaks scroll on small screens. Must be changed to `overflowX: "hidden", overflowY: "auto"`. The sync script does this automatically.

## Why vite.config.ts differs
The atlas-idk original uses a simple Vite config. Replit requires PORT and BASE_PATH env vars, and the @workspace/api-client-react alias for the local API client copy.

**How to apply:** Run `bash scripts/sync-frontend.sh` from the workspace root.
