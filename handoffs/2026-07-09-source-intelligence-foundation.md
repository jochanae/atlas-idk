# Handoff — F2 Source Intelligence Foundation (per-project code index)

**Date:** 2026-07-09
**Lane:** Backend (Axiom-Atlas repo, Cloud Run) + DB (Supabase `osuasytymbzurjvklhde`)
**Owner:** Cursor (backend). Lovable = frontend consumer only.
**Unlocks:** Every §3 row of `docs/MASTER_CAPABILITY_MATRIX.md` (codebase Q&A with citations, symbol search, import graph, impact analysis, safe edit plans, changelog auto-draft).

---

## 1. Problem

Every "codebase" tool today points at the wrong scope:

| Tool | Points at | Should point at |
|---|---|---|
| `search_codebase` (ripgrep) | Lovable dev workspace | user's project |
| `atlas_self_map` file + import graph | Atlas's own repo | user's project |
| `scanRoutes` | Atlas's own `App.tsx` | user's project |
| `git_diff` | Lovable workspace `.git` | user's project |
| `/api/search` vector index | Atlas memory entities | user's project source |
| `project_zip_imports.fullContext` | one flat blob per ZIP | hierarchical, chunked, embedded |

Result: Atlas cannot answer "where is `useAuth` used in *my* project?" with a `path:L1-L20` citation. This blocks real codebase Q&A, impact analysis, and safe edits.

The fix is one unified per-project source index. Source transport (ZIP / GitHub / Replit / generated / pasted) must not matter downstream.

---

## 2. Data model (Supabase)

All new tables in `public`. Grants + RLS per Cloud rules.

### 2.1 `project_sources`
The canonical row per (project, source). One project MAY have multiple sources (e.g. GitHub + pasted snippet), but there is exactly one **primary** per project.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| project_id | uuid fk → projects | |
| source_type | text | enum: `zip` \| `github` \| `replit` \| `generated` \| `pasted` |
| source_ref | jsonb | transport-specific: `{owner, repo, ref}` for github; `{filename}` for zip; `{snippetHash}` for pasted; etc. |
| is_primary | boolean | exactly one true per project (partial unique index) |
| last_ingested_at | timestamptz | |
| last_ingest_status | text | `pending` \| `indexing` \| `ready` \| `failed` |
| last_ingest_error | text | null unless failed |
| file_count | int | |
| total_bytes | bigint | |
| created_at / updated_at | timestamptz | |

Partial unique index: `create unique index one_primary_per_project on project_sources(project_id) where is_primary;`

### 2.2 `project_source_files`
One row per file in a source. Content stored inline for small files (<64 KB), in Storage bucket `project-sources` for larger.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| source_id | uuid fk → project_sources on delete cascade | |
| path | text | POSIX, no leading slash |
| size_bytes | int | |
| sha256 | text | content hash for change detection |
| language | text | detected (`ts`, `tsx`, `py`, `md`, etc.) |
| content | text | inline if size_bytes < 65536, else null |
| storage_key | text | non-null when content is null; points into `project-sources` bucket |
| exports | jsonb | `[{name, kind, line}]` from AST/regex pass |
| imports | jsonb | `[{specifier, resolvedPath|null, line}]` |
| indexed_at | timestamptz | |

Indexes: `(source_id, path)` unique; `(source_id, language)`; GIN on `exports` and `imports` for symbol lookup.

### 2.3 `project_source_symbols` (Phase 2 — defer)
Normalized symbol table for cross-file defs/refs once tree-sitter is in. Ship Phase 1 without it; import/export JSONB on `project_source_files` gets us 80% of the way.

### 2.4 `project_source_embeddings`
Chunk-level embeddings for codebase Q&A citations.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| file_id | uuid fk → project_source_files on delete cascade | |
| chunk_index | int | |
| line_start | int | 1-indexed inclusive |
| line_end | int | inclusive |
| content | text | chunk text (for citation display) |
| embedding | vector(1536) | pgvector; model = text-embedding-3-small |

Index: `ivfflat (embedding vector_cosine_ops)`.

### 2.5 `project_source_snapshots`
Rolling snapshots for diff-vs-last-ingest ("changed-file awareness" that doesn't depend on git).

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| source_id | uuid fk → project_sources | |
| taken_at | timestamptz | |
| file_manifest | jsonb | `{[path]: sha256}` |

Diff = compare two snapshots. Works for ZIP re-import, GitHub sync, Replit pull, generated regeneration alike.

---

## 3. Backend routes (Cloud Run — `axiom-atlas`)

All under `/api/sources/*`. All accept `Authorization: Bearer <atlas token>`. All scoped to `project_id` the caller owns.

### 3.1 Ingestion

- `POST /api/sources/:projectId/ingest` — body: `{ sourceType, sourceRef, payload }`. `payload` is:
  - `zip`: `{ storageKey }` (frontend uploaded to `project-sources` bucket first)
  - `github`: `{ owner, repo, ref, installationId? }` — pulls via GitHub App if connected, else public tarball
  - `replit`: `{ replSlug, token }`
  - `generated`: `{ files: [{path, content}] }`
  - `pasted`: `{ files: [{path, content}] }`
  Returns `{ sourceId, status: "indexing" }`. Runs async — do NOT block. Emits SSE `/api/sources/:sourceId/events` with `{status, progress, message}`.

- `POST /api/sources/:sourceId/reingest` — refresh from same transport; creates new snapshot; returns diff summary.

- `DELETE /api/sources/:sourceId` — cascade removes files, embeddings, snapshots.

### 3.2 Read

- `GET /api/sources/:projectId` — list sources for project.
- `GET /api/sources/:sourceId/tree` — file tree (paths + sizes + languages); `?depth=N` for lazy expansion.
- `GET /api/sources/:sourceId/file?path=...&lineStart=&lineEnd=` — file contents (range optional).
- `GET /api/sources/:sourceId/search?q=...&type=regex|literal&glob=...` — server-side ripgrep against ingested files (NOT the workspace). Returns `[{path, line, preview, matchRange}]`.
- `GET /api/sources/:sourceId/symbols?name=...` — resolves against `exports` JSONB. Phase 2 upgrades to tree-sitter.
- `GET /api/sources/:sourceId/imports?path=...&direction=in|out` — reverse-edge query. `direction=in` = who imports this file (impact / usage tracing). `direction=out` = what this file imports.
- `GET /api/sources/:sourceId/routes` — per-project route scan. Detect: React Router `<Route>`, TanStack Router file-based, Next `app/` and `pages/`, Express `app.get/post/...`, Supabase Edge Functions in `supabase/functions/*`. Return `[{method?, path, handler, file, line}]`.
- `POST /api/sources/:sourceId/qa` — body: `{ question, k? }`. Runs embedding retrieval, returns `{ answer, citations: [{path, lineStart, lineEnd, snippet}] }`.
- `GET /api/sources/:sourceId/diff?since=<snapshotId|iso>` — file-level diff since a snapshot. Returns `{added:[], removed:[], modified:[{path, oldSha, newSha}]}`.

### 3.3 Impact analysis (used by planner)

- `POST /api/sources/:sourceId/impact` — body: `{ paths: [path], depth?: 2 }`. Traverses reverse import graph. Returns `{ callers: [{path, line}], routes: [...], components: [...], estimatedBlastRadius: N }`. Wired into `propose_plan` payload downstream.

---

## 4. Ingestion pipeline (worker)

Same code path regardless of transport. Steps:

1. Materialize files to `/tmp/src-<sourceId>/` (from ZIP extract, git clone, Replit pull, or in-memory writes).
2. Walk tree; skip: `node_modules/`, `.git/`, `dist/`, `build/`, `.next/`, `.turbo/`, images, binaries > 2 MB.
3. For each file: sha256, detect language, extract exports/imports (regex first pass — same patterns as `atlas_self_map` in `artifacts/api-server/src/routes/selfmap.ts`), upsert `project_source_files`.
4. Resolve imports: mirror `resolveImport` from selfmap.ts (relative + `@/` alias, extension probing). Populate resolved paths in `imports` JSONB.
5. Chunk each text file: ~40-line windows with 10-line overlap. Embed via `text-embedding-3-small`. Insert into `project_source_embeddings`.
6. Write `project_source_snapshots` row with full manifest.
7. Update `project_sources.last_ingest_status = 'ready'`.

Budget: emit SSE progress every 25 files. Fail soft on individual files (log to `last_ingest_error` array; don't abort the whole ingest).

Reuse `atlas_self_map` extraction logic (`extractExports`, `extractImportSpecifiers`, `resolveImport`) — copy into a shared `lib/source-index/` module so both self-map and per-project indexing share it.

---

## 5. Storage bucket

Add bucket `project-sources` (private). Structure:
```
project-sources/<projectId>/<sourceId>/<sha256>.txt
```
Content-addressed so re-ingest is cheap. Lifecycle: delete objects when parent `project_sources` row is deleted (cascade via edge function trigger or worker sweep).

RLS: only project members can read/write their own project paths.

---

## 6. Frontend consumption (Lovable — this repo)

Not this handoff's build scope, but the shape the backend must satisfy. Everything below is what the frontend will call once routes exist:

- **Home / composer** — file/ZIP attach → upload to `project-sources` bucket → `POST /ingest`.
- **Workspace Connections tab** — GitHub connect → on save, kick `POST /ingest` with `sourceType: 'github'`.
- **Workspace Codebase panel (new)** — reads `/tree`, `/file`, `/search`, `/symbols`, `/imports`, `/routes`. Renders as sidebar drawer with tabs: Tree / Search / Symbols / Routes / Diff.
- **Chat with Atlas** — new tool functions surfaced through nexus: `codebase_search`, `codebase_file`, `codebase_symbol`, `codebase_impact`, `codebase_qa`. All call `/api/sources/*`. Every answer that cites code must render `path:L1-L20` chips (tap → opens file at range in Codebase panel).
- **Ledger / Decision Catch** — impact previews call `/impact` before Commit.

---

## 7. Phasing

**Phase 1 (this handoff — ship first)**
- Tables: `project_sources`, `project_source_files`, `project_source_snapshots`, `project_source_embeddings`.
- Routes: ingest (ZIP + generated + pasted first), tree, file, search, imports, routes, diff, qa.
- Regex-based exports/imports (port from `selfmap.ts`).
- Worker with SSE progress.

**Phase 2 (follow-up)**
- GitHub + Replit transports.
- `project_source_symbols` with tree-sitter for `ts/tsx/js/jsx/py`.
- `/impact` endpoint + wire into `propose_plan`.
- Component usage tracing built on symbol table.

**Phase 3**
- Duplicate system detection (cluster by exports + import fan-in).
- Hierarchical summarization (repo → package → dir → file).
- Auto-changelog from `/diff` + Ledger release entries.

---

## 8. Consuming files in Lovable (for backend awareness)

The frontend hooks and panels below will call these routes once live. Backend does not need to touch them; listed so response shapes are locked in:

- `artifacts/atlas-frontend/src/features/codebase/*` (new) — panel, tree view, search box, symbol lookup, routes list.
- `artifacts/atlas-frontend/src/hooks/useProjectSource.ts` (new) — thin wrapper over `_workspace/api-client-react/`.
- `artifacts/atlas-frontend/src/lib/scanRoutes.ts` — deprecated once `/routes` ships; replace call sites with hook.
- Nexus workspace chat message renderer — MemoryChips-style citation chips for `path:L1-L20`.

Update `_workspace/api-client-react/` schemas after routes land (per `mem://workspace-api-client-sync.md`).

---

## 9. Acceptance tests

Backend ships only when all pass, against a real user project (ZIP-ingested):

1. `POST /ingest` with a 500-file TypeScript ZIP → `status=ready` within 90s; SSE progress observed.
2. `GET /tree` returns full nested tree; matches `find . -type f` count minus skipped dirs.
3. `GET /search?q=useAuth` returns every hit with correct `path:line`.
4. `GET /imports?path=src/hooks/useAuth.ts&direction=in` returns every file that imports it.
5. `GET /routes` on a Vite+TanStack project returns all `<Route>` entries with file:line.
6. `POST /qa` with "where is auth state persisted?" returns an answer with ≥1 citation whose `path:lineStart-lineEnd` opens to the actual relevant code.
7. Re-ingest → `GET /diff?since=<prevSnapshotId>` lists exactly the files changed between ingests.
8. Delete source → all files, embeddings, snapshots, and Storage objects removed.

---

## 10. Next step for you (Cursor)

1. Create migrations for §2 tables + `project-sources` bucket + RLS.
2. Copy `extractExports` / `extractImportSpecifiers` / `resolveImport` from `artifacts/api-server/src/routes/selfmap.ts` into `lib/source-index/`.
3. Scaffold `/api/sources/*` routes on Cloud Run with Phase 1 endpoints stubbed and typed.
4. Ship ingestion worker for `zip` + `generated` + `pasted` transports.
5. Ping back with route URLs + response schemas; Lovable will wire the Codebase panel + citation chips.
