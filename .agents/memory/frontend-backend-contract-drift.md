---
name: Frontend/backend contract drift
description: A feature can have a fully working backend AND a fully working frontend component, yet still be totally broken end-to-end because the two were built against different assumed API contracts (path params vs query params, wrapped vs flat response, differently-named fields).
---

When a feature "seems built" (routes exist, hooks exist, component exists) but doesn't work in the UI, don't trust that either side in isolation proves the whole path works. Explicitly diff the exact URLs and response shapes the frontend hook constructs against the actual route signatures and `res.json(...)` shapes in the backend route file.

**Why:** In the Axiom Source Intelligence feature (F2 §5b), the backend routes (`/api/sources/:sourceId/tree`, `/file`, `/search`) and the frontend hook (`useProjectSource.ts`) were both fully implemented and individually correct, but the hook called query-param URLs (`/api/sources/tree?sourceId=`) that didn't exist on the server, and expected wrapped/differently-named response fields (`{tree: TreeNode}` singular vs actual `{tree: TreeNode[]}`, `{file: FilePayload}` vs flat, `text` vs actual `preview`). Both sides passed their own isolated tests; only an end-to-end trace caught it.

**How to apply:** When asked to "verify X works end-to-end" or when a feature has been developed by different sessions/agents on frontend vs backend, grep the actual route definitions (`router.get(...)` paths) and compare directly against every fetch URL and response-field access in the consuming hook/component before declaring it done.
