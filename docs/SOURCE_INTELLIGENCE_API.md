# Source Intelligence API (F2 Phase 1)

Per-project code index. All routes require `Authorization: Bearer <token>` (atlas session or Supabase JWT) and are scoped to projects the caller owns.

**Base:** `/api/sources`

> `projectId` is an **integer** (matches `projects.id`). `sourceId` is a **UUID**.

---

## Ingestion

### `POST /api/sources/:projectId/ingest`

```json
{
  "sourceType": "zip" | "generated" | "pasted",
  "sourceRef": { "filename": "app.zip" },
  "isPrimary": true,
  "payload": {
    "storageKey": "<projectId>/<uploadId>/archive.zip",
    "files": [{ "path": "src/App.tsx", "content": "..." }]
  }
}
```

- `zip`: requires `payload.storageKey` (object in `project-sources` bucket, or `local:<path>` in dev).
- `generated` / `pasted`: requires `payload.files`.
- `github` / `replit`: **501** in Phase 1.

**202 response:**

```json
{ "sourceId": "uuid", "status": "indexing" }
```

Ingest runs async. Subscribe to SSE for progress.

### `GET /api/sources/:sourceId/events` (SSE)

```
event: progress
data: {"status":"indexing","progress":0.42,"message":"Indexed 100/500 files","fileCount":500,"processed":100}
```

Terminal statuses: `ready` | `failed`.

### `POST /api/sources/:sourceId/reingest`

Refresh from same transport. Body may supply new `storageKey` / `files`. Returns `{ sourceId, status: "indexing", previousSnapshotId }`.

### `DELETE /api/sources/:sourceId`

Cascade-deletes files, embeddings, snapshots, and storage objects. **204**.

---

## Read

### `GET /api/sources/:projectId`

```json
{ "sources": [SourceListItem] }
```

### `GET /api/sources/:sourceId/tree?depth=N`

```json
{
  "sourceId": "uuid",
  "fileCount": 120,
  "tree": [
    {
      "name": "src",
      "path": "src",
      "type": "dir",
      "children": [
        { "name": "App.tsx", "path": "src/App.tsx", "type": "file", "sizeBytes": 1200, "language": "tsx" }
      ]
    }
  ]
}
```

### `GET /api/sources/:sourceId/file?path=src/App.tsx&lineStart=1&lineEnd=40`

```json
{
  "path": "src/App.tsx",
  "language": "tsx",
  "sizeBytes": 1200,
  "sha256": "...",
  "lineStart": 1,
  "lineEnd": 40,
  "content": "...",
  "exports": [{ "name": "App", "kind": "function", "line": 10 }],
  "imports": [{ "specifier": "@/hooks/useAuth", "resolvedPath": "src/hooks/useAuth.ts", "line": 2 }]
}
```

### `GET /api/sources/:sourceId/search?q=useAuth&type=literal|regex&glob=**/*.{ts,tsx}`

```json
{
  "query": "useAuth",
  "type": "literal",
  "hits": [
    { "path": "src/App.tsx", "line": 12, "preview": "const { user } = useAuth()", "matchRange": [18, 25] }
  ],
  "capped": false
}
```

### `GET /api/sources/:sourceId/symbols?name=useAuth`

```json
{
  "name": "useAuth",
  "symbols": [{ "path": "src/hooks/useAuth.ts", "name": "useAuth", "kind": "function", "line": 4 }]
}
```

### `GET /api/sources/:sourceId/imports?path=src/hooks/useAuth.ts&direction=in|out`

```json
{
  "path": "src/hooks/useAuth.ts",
  "direction": "in",
  "edges": [{ "path": "src/App.tsx", "line": 2, "specifier": "@/hooks/useAuth" }]
}
```

### `GET /api/sources/:sourceId/routes`

```json
{
  "sourceId": "uuid",
  "routes": [
    { "path": "/login", "handler": "Route", "file": "src/App.tsx", "line": 24 },
    { "method": "GET", "path": "/api/health", "handler": "get", "file": "server/index.ts", "line": 10 }
  ]
}
```

### `POST /api/sources/:sourceId/qa`

```json
{ "question": "where is auth state persisted?", "k": 8 }
```

```json
{
  "answer": "...",
  "citations": [
    { "path": "src/hooks/useAuth.ts", "lineStart": 1, "lineEnd": 40, "snippet": "..." }
  ]
}
```

Citation chips should render as `path:L{lineStart}-L{lineEnd}`.

### `GET /api/sources/:sourceId/diff?since=<snapshotId|iso>`

```json
{
  "since": "uuid",
  "sinceTakenAt": "...",
  "latestSnapshotId": "uuid",
  "latestTakenAt": "...",
  "added": ["src/new.ts"],
  "removed": ["src/old.ts"],
  "modified": [{ "path": "src/App.tsx", "oldSha": "...", "newSha": "..." }]
}
```

### `POST /api/sources/:sourceId/impact` (early Phase 2)

```json
{ "paths": ["src/hooks/useAuth.ts"], "depth": 2 }
```

```json
{
  "callers": [{ "path": "src/App.tsx", "line": 2 }],
  "routes": [],
  "components": ["src/App.tsx"],
  "estimatedBlastRadius": 3
}
```

---

## Storage

Bucket: `project-sources` (private)

```
project-sources/<projectId>/<sourceId>/<sha256>.txt
```

ZIP uploads from the frontend should land under `<projectId>/uploads/<id>.zip` before calling ingest with that `storageKey`.

---

## Zod schemas

See `@workspace/api-zod` (`IngestSourceBody`, `SourceQaResponse`, `SourceDiffResponse`, …).
