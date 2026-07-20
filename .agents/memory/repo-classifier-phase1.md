---
name: Repository Classifier Phase 1
description: Pure static classifier lib that analyzes a repo's file tree and returns a RepositoryRunabilityReport. No I/O inside the lib. Phase 1 ceiling is "likely-runnable" — "verified-runnable" requires Phase 2 runtime.
---

## Architecture

- `lib/repo-classifier/` — composite lib, in root tsconfig.json references, added to api-server deps
- `src/types.ts` — full locked contract; Phase 1 max status = "likely-runnable" (never "verified-runnable")
- `src/staticClassifier.ts` — pure function, no I/O; orchestrates 5 evidence modules
- `src/evidence/workspaceDiscovery.ts` — parses pnpm-workspace.yaml / package.json#workspaces, groups files by package, extracts root --filter refs
- `src/evidence/frameworkDetector.ts` — detects Vite/Next.js/Expo/Express per package; sets isMobile/isLibraryOnly flags
- `src/evidence/scriptDetector.ts` — finds recognized runnable scripts; rootFilterRef matching uses `ref.endsWith(/${lastName})` NOT `name.endsWith(/${segment})`
- `src/evidence/envVarScanner.ts` — scans .env.example/source code; DATABASE_URL classified as secret (connection URL pattern); never scans real .env files
- `src/evidence/serviceDetector.ts` — maps deps to external services (pg→PostgreSQL, etc.)
- `src/evidence/activityScorer.ts` — strong inactive: missing entry point, negated glob; weak: no script, legacy dir segment, outside workspace

## Critical rules

- Lib packages (only build/typecheck/test scripts) are skipped as targets — `framework.isLibraryOnly && !script → continue`
- `overallStatus` derived from RECOMMENDED target, not worst-case; inactive/unsupported siblings add warnings, never override
- `github-partial` sourceMode caps report confidence at "medium"
- `inactivityReasons` must have at least one non-commit reason when `packageActivity` metadata is absent
- Secret env vars must never have `defaultValue` set

## Source adapters (api-server)

- `artifacts/api-server/src/services/repositoryClassificationSource.ts`
- `loadFromWorkspace(dir)` — walks project workspace dir, skips node_modules/dist/.git/build/coverage
- `loadFromGitHub(repoFull, token)` — fetches tree + selectively fetches content for classifier-relevant files
- `loadClassificationInput({workspaceDir, linkedRepo, githubToken})` — picks best source: local-complete preferred, GitHub fallback

## Route

- `POST /api/projects/:id/classify` — authenticated; owner-gated; returns `{ report: RepositoryRunabilityReport }`
- Registered in `artifacts/api-server/src/routes/projects.ts`

## Test suite

- `lib/repo-classifier/src/__tests__/staticClassifier.test.ts` — 106 tests, all passing
- 7 fixtures (A=atlas-monorepo, B=simple-vite, C=nextjs-prisma, D=dead+live, E=expo, F=mixed, G=empty)
- Key bug fixed in scriptDetector: the rootFilterRef match was reversed — it was checking if the package's name ended with the dir segment instead of if any rootFilterRef ends with the package's dir segment

## Node.js 24 gotcha

- `readdir(dir, { withFileTypes: true })` returns `Dirent<NonSharedBuffer>[]` without encoding spec
- Must use `{ withFileTypes: true, encoding: "utf-8" }` to get `Dirent<string>[]` with `.name` as string
- Also use `raw.indexOf(0) !== -1` not `raw.includes(0)` for null-byte binary detection

## walkDir: files before subdirectories (critical ordering)

- walkDir MUST process all files at a given level before recursing into any subdirectory
- If directories are processed in readdir order (alphabetical), a `generated/` dir can exhaust the file cap before root `package.json` is read, leaving workspace.packages empty and crashing classifyRepository
- Fix: collect subdirs in a separate array during the file pass, then recurse after all files at the current level are counted

## scanTruncated propagation

- `loadFromWorkspace` sets `scanTruncated: true` when `totals.count >= limits.maxFiles || totals.bytes >= limits.maxTotalBytes` after the walk
- `loadFromGitHub` sets it when GitHub returns more blobs than `limits.maxFiles`
- `classifyRepository` pushes a warning into `report.warnings` when `input.scanTruncated === true`
- The classifier still builds all targets normally — truncation is advisory, not fatal

## lib rebuild requirement

- `lib/repo-classifier` is a composite lib compiled to `dist/`; api-server imports the compiled JS
- Any change to lib types or logic requires `pnpm run typecheck:libs` before restarting the server
- Without the rebuild, the server runs stale compiled code and new behaviour never takes effect
