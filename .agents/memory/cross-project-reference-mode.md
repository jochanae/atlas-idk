---
name: Cross-Project Reference Mode
description: How Atlas gets read-only access to another owned project's real files for comparison/reuse, and the security/UX boundaries around it.
---

Atlas previously could only speak about other users' past projects from general/model knowledge — it could not actually open another project's files. This was closed by adding three new agent tools (`list_user_projects`, `list_reference_project_dir`, `read_reference_project_file`) rather than inventing a new ingestion pipeline.

**Why this shape:** the existing per-project file tools already resolve any project id to a workspace dir on disk (`projectWorkspaceDir(projectId)` + `resolveWorkspacePath`). Cross-project read access is just calling those same primitives with someone else's project id instead of the active one — no new source-of-truth, no `project_sources` "Reference" type, no embeddings/indexing needed for a narrow v1.

**Security boundary:** resolving "which project did the user mean" is always filtered to `projectsTable.userId = ctx.userId` first — a user can never read another user's project, only their own other projects. This is enforced in one helper (`resolveReferenceProject`), not scattered across call sites.

**Write boundary:** no tool writes to the reference project. `edit_file`/`line_patch` are hard-coded to the *active* project's `ctx.workspaceDir`. So "reuse a pattern from X" always requires an explicit follow-up edit against the current project — nothing silently copies code across projects.

**Audit trail:** every reference read calls the existing `ctx.writeStep()` run-step mechanism with verb `SOURCE_REFERENCED`, so which files Atlas inspected in another project is visible in the same timeline/run-card UI as any other tool call — no new UI surface needed.

**How to apply:** if asked to extend this (e.g. cross-project search, or letting the model diff two projects), extend `reference-project.ts` with more read-only tools following the same `resolveReferenceProject` ownership gate — don't build a parallel authz path.
