# Cross-Project Reference Mode — backend

## What shipped
Atlas can now actually open another of the user's projects read-only and inspect its real files, instead of only speaking from general/model knowledge.

New agent tools (`artifacts/api-server/src/lib/agent-tools/reference-project.ts`), registered in `agent-tools/index.ts` alongside the existing `read_file`/`list_dir`/`edit_file` tools:

- `list_user_projects` — lists the current user's other projects (id, name, description), scoped to `userId`.
- `list_reference_project_dir` — read-only directory listing inside another project, resolved by name or id.
- `read_reference_project_file` — read-only file read inside another project, resolved by name or id.

## Design choices
- **Reused existing primitives** rather than inventing a new "Reference" source type: `projectWorkspaceDir(projectId)` + `resolveWorkspacePath` (traversal-safe) already exist and work for any project id, so cross-project read access is just "call them with someone else's project id" instead of the *active* one.
- **Ownership gate**: `resolveReferenceProject()` only searches projects where `projectsTable.userId = ctx.userId`, so a user can never read another user's project. No new authz primitive needed — this piggybacks on the fact that `projectId` and `userId` are already both on `AgentToolContext`.
- **Read-only by construction**: no write tool touches the reference project's workspace dir; `edit_file`/`line_patch` are hard-coded to `ctx.workspaceDir` (the current project). So "reuse a pattern" always requires the model to explicitly call `edit_file` against the current project after reading the reference — there is no path that silently copies code over.
- **Audit trail**: every reference read calls `ctx.writeStep({ verb: "SOURCE_REFERENCED", target: "<projectName>:<path>", phase: "reference" })`, which flows into the existing run-step/timeline plumbing — so "what did Atlas look at in Compani" is inspectable after the fact, same as any other tool call.
- **System prompt**: `atlasIdentity.ts` Capability section now explicitly tells Atlas this ability exists and to cite files inspected, so it stops improvising a refusal ("I can only speak from general knowledge") when the user asks it to compare/reuse from another project.

## Explicitly out of scope (kept narrow per user ask)
- No new `project_sources` "Reference" source type, no ingestion/embeddings/indexing for other projects — this is a live filesystem read against `.project-workspaces/<id>`, same mechanism the current-project tools already use.
- No cross-project search/QA endpoint — the model browses via `list_reference_project_dir` + targeted `read_reference_project_file` calls, same pattern as the existing single-project tools.
- No UI changes — this is purely an agent-tool capability; it surfaces through normal tool-call rendering in the existing run/thinking timeline.

## Verification
- `pnpm --filter @workspace/api-server run typecheck` — no new errors (all remaining errors are the pre-existing baseline: `stripe-replit-sync`, `source-index` build lag, `sourceIngest.ts`/`selfmap.ts` implicit-any, `chat.ts`/`nexus.ts` optional-field errors).
- API server workflow restarted cleanly, booted with no new errors.
- Not yet tested end-to-end against a real "Compare this app's invite system with Compani" conversation turn — recommend an e2e/manual check next: create two test projects, put a distinctive file in one, and ask Atlas from the other to reference it.

## Files touched
- `artifacts/api-server/src/lib/agent-tools/reference-project.ts` (new)
- `artifacts/api-server/src/lib/agent-tools/index.ts` (registered 3 new tools)
- `artifacts/api-server/src/lib/atlasIdentity.ts` (Capability section — cross-project reference paragraph)
