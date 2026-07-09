---
name: Artifact Engine Architecture
description: Shared pipeline for every file-backed deliverable (DOCX/PPTX/XLSX/PDF/Mermaid/Charts/Drafts); renderers are plug-ins, not independent systems.
---

Every generated deliverable goes through one shared engine, not per-format pipelines. A renderer only implements content generation → file buffer; the engine owns everything else: file storage upload, persistence, Ledger linkage, and generic download/preview access. File metadata was folded into the existing artifact table's JSON columns rather than adding new schema — avoid re-migrating for future renderers unless a genuinely new field is needed.

**Why:** Phase 2 requires DOCX/PPTX/XLSX/PDF/Mermaid/Charts/Drafts to all plug into one engine rather than duplicating generation/persistence/Ledger code per file type (explicit user architecture requirement).

**How to apply:** Adding a new file-backed deliverable type = write one new renderer that only generates a buffer, and register it with the engine. No new routes, no schema changes, no Ledger code needed — those are generic across all renderer types. This applies even to plain-text "draft" artifacts (e.g. communication drafts) that have no real file format — just persist the text as the buffer with a text/markdown mime type.

**Gotcha:** version numbering for an artifact type must be computed via `MAX(version)+1` inside the same insert transaction, with retry-on-unique-violation. Computing it from a row count in a separate read is wrong after deletions and races under concurrent generation.

**Gotcha:** any renderer that generates content via an LLM call should go through a shared "generate + validate against zod schema" helper (one call site), not ad hoc JSON parsing per renderer — catches malformed LLM output before it reaches file-building code.

**Gotcha:** `pdfkit` (via its `fontkit` dependency) resolves font/data files using paths relative to its own package directory at runtime. If the server is bundled with esbuild, this breaks (`ENOENT ... Helvetica.afm`) because the bundle output lives in `dist/`, not `node_modules/pdfkit/`. Fix: add `pdfkit` and `fontkit` to the esbuild `external` list so they're `require`d normally instead of bundled. Any future renderer library that loads assets via relative-to-package-dir paths (fonts, templates, native data files) needs the same treatment — externalize, don't bundle.

**Gotcha:** for visual renderer types (diagrams/charts), prefer generating plain text/SVG output over anything needing a canvas or headless browser (mermaid-cli, chartjs-node-canvas, puppeteer). SVG is hand-rollable, bundles cleanly with esbuild, previews natively in any browser, and needs no native deps — used for both the Mermaid renderer (raw `.mmd` source, rendered client-side) and the chart renderer (hand-built bar/line/pie SVG).

**Gotcha:** the generic `POST /deliverables/:type/generate` route only forwarded `context/title/docType` to renderers. Any renderer needing extra input fields (e.g. `diagramType`, `chartType`) requires the route to spread through unrecognized body fields (`...rendererOptions`) into the renderer input — check this route whenever a new renderer needs a field beyond the DOCX-era shape.

**Gotcha:** not every renderer generates new content from an LLM. A "repackaging" renderer (e.g. bundling other artifacts into a zip) takes *other artifacts* as its input instead of conversation context, so it needs its own generate route rather than reusing the generic context-based one — the engine's persist/Ledger/download contract still applies unchanged.

**Gotcha:** the project has two artifact persistence shapes: engine-rendered types are file-backed (object storage + `metadata.objectPath`), while an older class of artifacts (decision intelligence: tradeoff matrix / decision tree / deviation log) are JSON-payload-only rows with no backing file. Anything that operates generically "over artifacts" (e.g. bundling) must check for both shapes and materialize a file on the fly for the JSON-only ones — don't assume every `project_artifacts` row is file-backed.

**Gotcha:** after adding a new route in a running dev workflow, changes are not live until the workflow restarts (the dev script only builds once at process start). Restart before curl-testing a newly added route, or a stale build can produce a confusing wrong-handler response instead of a clean 404.
