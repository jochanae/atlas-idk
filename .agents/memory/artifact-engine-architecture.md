---
name: Artifact Engine Architecture
description: Shared pipeline for every file-backed deliverable (DOCX/PPTX/XLSX/PDF/Mermaid/Charts/Drafts); renderers are plug-ins, not independent systems.
---

Every generated deliverable goes through one shared engine, not per-format pipelines. A renderer only implements content generation → file buffer; the engine owns everything else: file storage upload, persistence, Ledger linkage, and generic download/preview access. File metadata was folded into the existing artifact table's JSON columns rather than adding new schema — avoid re-migrating for future renderers unless a genuinely new field is needed.

**Why:** Phase 2 requires DOCX/PPTX/XLSX/PDF/Mermaid/Charts/Drafts to all plug into one engine rather than duplicating generation/persistence/Ledger code per file type (explicit user architecture requirement).

**How to apply:** Adding a new file-backed deliverable type = write one new renderer that only generates a buffer, and register it with the engine. No new routes, no schema changes, no Ledger code needed — those are generic across all renderer types. Draft generators (Email/Slack/PR/Changelog) should also register as renderers even without a "real" file, to keep preview/Ledger/download consistent.

**Gotcha:** version numbering for an artifact type must be computed via `MAX(version)+1` inside the same insert transaction, with retry-on-unique-violation. Computing it from a row count in a separate read is wrong after deletions and races under concurrent generation.

**Gotcha:** any renderer that generates content via an LLM call should go through a shared "generate + validate against zod schema" helper (one call site), not ad hoc JSON parsing per renderer — catches malformed LLM output before it reaches file-building code.

**Gotcha:** `pdfkit` (via its `fontkit` dependency) resolves font/data files using paths relative to its own package directory at runtime. If the server is bundled with esbuild, this breaks (`ENOENT ... Helvetica.afm`) because the bundle output lives in `dist/`, not `node_modules/pdfkit/`. Fix: add `pdfkit` and `fontkit` to the esbuild `external` list so they're `require`d normally instead of bundled. Any future renderer library that loads assets via relative-to-package-dir paths (fonts, templates, native data files) needs the same treatment — externalize, don't bundle.
