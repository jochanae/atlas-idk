---
name: _workspace api-client-react sync pattern
description: How codegen output flows into the frontend and what to do when adding new endpoints
---

## The rule

Codegen (`pnpm --filter @workspace/api-spec run codegen`) writes output to `lib/api-client-react/src/generated/`. However, the frontend's `tsconfig.json` and `vite.config.ts` both resolve `@workspace/api-client-react` to `artifacts/atlas-frontend/src/_workspace/api-client-react/src/index.ts` **first**, before falling back to `lib/`. This means TypeScript and Vite always use the `_workspace` copy at runtime and type-check time.

## What to do when adding a new endpoint

1. Update `lib/api-spec/openapi.yaml` and run codegen — new types/hooks land in `lib/api-client-react/src/generated/`.
2. **Do NOT copy the entire generated files** into `_workspace/` — this overwrites the atlas-idk hooks that `workspace.tsx` depends on.
3. Instead, **append** only the new schema types to `_workspace/.../api.schemas.ts` and the new hook functions to `_workspace/.../api.ts`.
4. For the hook in `api.ts`: avoid using `customFetch` (not available in _workspace without extra wiring) — use plain `fetch` with manual `res.ok` check instead.
5. Drop the `{ query: { enabled: ... } }` options argument from hook call sites — the generated options already include `enabled: !!(id)` so `id=0` disables the query automatically.

**Why:** The `_workspace/` copy is the "atlas-idk" version — it contains many more hooks that `workspace.tsx` imports. Codegen only regenerates what's in the local OpenAPI spec, so a full overwrite would drop all the atlas-idk–sourced hooks.

**How to apply:** Every time a new endpoint is added to the local OpenAPI spec, run codegen, then append the diff (new types + new hook) to the `_workspace` counterparts rather than copying the whole file.
