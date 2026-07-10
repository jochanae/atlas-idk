# MASTER_CAPABILITY_MATRIX.md

> **Verified against commit `20b3053c53f4fb6db217a84fb861e99f461d8646` on 2026-07-10.**
> This pass re-audited every row against actual code (routes, lib files, renderers, tests) — not against roadmap intent or prior chat claims. Statuses below reflect what exists in the repo today. See "Verification method" at the bottom for how each foundation was checked.

**Purpose.** The single, complete inventory of every user-facing capability Atlas is expected to have — across every surface, whether shipped or not. This document exists to solve a **visibility problem**, not a prioritization problem. If a capability is not on this list, Atlas has silently forgotten it exists.

**Rule of inclusion.** A capability appears here if Atlas has ever promised it (in POSITIONING.md, in a shipped feature, in a memory, in a handoff, in a matrix row, in a demo, or in the user's stated expectations). **Priority is not a reason to omit.** P3 rows sit next to P0 rows.

**Companion documents.**
- `POSITIONING.md` — why Atlas exists.
- `PROJECT_TRUTH.md` — what is wired at the URL/route/table level.
- `CAPABILITY_MATRIX.md` — the deep audit (with validation methods, known gaps, priorities).
- **This file** — the checklist. Every sprint updates it. Nothing gets removed for being unimportant.

---

## Status legend

Two independent axes: does it exist, and is it good enough to show a customer. A row can jump straight from ❌ to ★ for something trivial, or sit at ○ for months while the mechanism is real but the output is not trustworthy yet — that gap is the point of tracking both.

| Symbol | State | Definition |
|---|---|---|
| ❌ | **Not started** | Promised or implied but no code path, no design, no owner. (Replaces the old `✗`.) |
| △ | **Foundation shipped** | The underlying engine/plumbing exists and runs, but only for a narrow case, or only proven in one surface. Not yet safe to generalize from. |
| ○ | **Partial implementation** | Works end-to-end for the common case; wired into real routes and real UI; has real gaps (formats, edge cases, validation) a user will hit. |
| ✓ | **Complete** | Works end-to-end at shipped-quality; a domain expert would accept the output as correct. |
| ★ | **Production quality** | Complete *and* verified/polished enough to put in front of a customer or investor without caveats. This is the bar the older legend collapsed into "✓" — separated out because "it runs" and "you'd be proud to ship it" are different claims. |
| — | **Parked** | Consciously deferred (legal-adjacent, out of scope, or blocked). |

**Dependencies** column names the foundation(s) a capability sits on. If a foundation is not ✓/★, every capability that depends on it should read as at most △/○.

---

## Foundations

These are not user-facing capabilities. They are the substrates every other capability sits on. Every foundation not-yet-shipped cascades into partial/missing rows below. Read as: **Conversation Engine, Decision Engine, Memory Engine, Source Intelligence Engine, Artifact Engine, Presentation Director, Brand Identity Engine, Verification Engine, Delivery Engine, Ship Package Engine** — ten reusable engines, not ten one-off features.

| # | Foundation | Status | Description | Unlocks |
|---|---|---|---|---|
| F1 | Route parity (nexus ↔ chat) | △ | Workspace uses `/api/nexus/chat`; legacy `/api/chat` still used by home build-intent handoff. Emitter parity landed; agentic self-correct loop still chat-primary. | Every workspace-invoked capability |
| F2 | Source Intelligence Engine | △ | **Verified:** `routes/sources.ts` + `lib/sourceIngest.ts` + `lib/source-index/{walk,chunk,extract,language}.ts` are real and wired. `zip`/`generated`/`pasted` ingest works end-to-end. `github`/`replit` explicitly return `501` ("Phase 2 — use zip, generated, or pasted") — not silently broken, intentionally gated. Export/import extraction is regex-based (no tree-sitter/LSP), so symbol defs/refs and true dependency-graph traversal are not yet real. | §5b, code Q&A, impact analysis, safe edits, changelog |
| F3 | Artifact Engine | ○ | **Verified:** `artifactEngine.ts`, `artifactOrchestrator.ts`, `deliveryEngine.ts` exist; 9 real renderers in `lib/renderers/` (pptx, docx, pdf, xlsx, html, chart, mermaid, draft, bundle) with test coverage (`artifactEngine.test.ts`, `renderers.test.ts`, `generate-deliverable.test.ts`). One generator, many renderers — the architecture the matrix asked for is built. Ceiling is F6A/F6B (verification + visual QA), not the engine itself. | §3, §4 diagrams/charts, §7, §8 |
| F4 | Decision Engine | △ | One decision object → many views (card, tradeoff matrix, RACI, tree, deviation log). Ledger + Decision Catch exist; artifact views do not. | §6 all rows, §7 changelog, §8 Ship Package |
| F5 | Brand Identity Engine *(renamed from "Template / Voice profile")* | △ | Broader than voice: writing voice, visual language, typography, presentation style, illustration/icon language, color language — one identity every renderer consumes. **Verified:** `deliverable-theme/{inferTheme,projectSignals,themeSchema,tokens,icons}` and `presentation-director/{director,schema}` are real and infer theme from project signals. Writing-voice profile (tone learned from user samples) and an explicit brand-kit object (colors/fonts/icon set as a first-class entity) are confirmed absent — zero matches in server or DB schema. | §7 drafts, §3 docs, §8 bundles, §6 visual outputs |
| F6A | Artifact Verification Engine *(split out of old F6)* | ○ | Mechanical correctness, not visual judgment: did the renderer succeed, is the output file valid, did every requested slide/section/sheet get created, did the artifact save, can it reopen, is anything silently missing. **Verified:** `verificationEngine.ts` + per-type checkers in `lib/verifiers/*.ts` (pptx, docx, pdf, html, xlsx, chart, mermaid, draft, bundle); result persisted at `metadata.verification`; retryable-failure-class triggers one re-render in `artifactEngine.ts`. | §3 all deliverables, §5, §6, §8 |
| F6B | Visual QA Engine *(split out of old F6)* | △ | Render + judge quality: text overflow, orphan bullets, slide density, color contrast, spacing, empty slides, chart clipping, inconsistent typography. **Verified (PPTX + DOCX + PDF + XLSX):** `renderToImages.ts` (LibreOffice headless → PDF → `pdftoppm` → PNG, real headless render, not a stub; `RenderableFormat` now covers pptx/docx/pdf/xlsx) + `visualQAEngine.ts` (F6A-style plug-in registry) + `visualQACheckers/pptxVisualQA.ts` (pixel-level empty-slide/low-contrast/bottom-edge-overflow via `sharp`, plus structural dense-heading/orphan-bullet checks) + `visualQACheckers/docVisualQA.ts` (shared docx+pdf checker: blank-page, low-contrast, dense-heading, since both share one document-native preview shape) + `visualQACheckers/xlsxVisualQA.ts` (best-effort: blank-page pixel check + no-printable-data structural check; doc-commented that LibreOffice xlsx pagination doesn't map 1:1 to worksheets). Persisted as `metadata.verification.visualQA`, additive sibling of F6A's fields — not merged into them. Results now surfaced in the frontend: `ArtifactsPanel.tsx` shows a "N visual issues" badge (collapsed row) and per-issue detail (expanded view) whenever `status: "checked"` returns issues; `status: "skipped"/"unavailable"` renders no badge (not an error state). HTML has no checker registered yet. No auto-fixing; detect-only per scope. | §5 PPTX/DOCX/PDF/XLSX, §6 charts/diagrams, §10 video |
| F7 | Ingestion pipeline (URL / image / audio) | ❌ | Unified fetch + parse + embed for URL, image (OCR/vision), audio (STT). Only file-ingestion-as-drift-signal exists. `urlScreenshot.ts` + `ssrf.ts` cover URL *screenshotting*, not general URL ingestion. | §7 drafts, §9 audio, §11 templates |
| F8 | Memory tier integration | △ | 5-tier memory seeded by Forge; global narrative synthesized per-turn. Tier-3+ retrieval into artifact generation is not wired. | F5 identity, §6 reasoning artifacts, §7 comms drafts |
| F9 | Ship Package bundler | ○ | **Verified:** `bundleRenderer.ts` exists and is imported by `projectArtifacts.ts` — a real renderer, not a stub. No dedicated bundle-and-share route (zip, one-shot link) exists yet, so this is further along than "missing" but short of "wired." | §8 |
| F10 | Publish / share surface | △ | Bundle share links, view-only public URLs, collaboration drawer exists but not wired to artifacts. | §8, §11 investor update |

---

## 1. Conversation & Intelligence

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Level-0 pure conversation | ✓ | — | Listening quality ~6.5/10; premature clarification still a risk |
| Intent classification (WhisperGate) | ✓ | — | THINK / BUILD / DECIDE routing |
| Output Guard (per-mode validators + retry) | △ | F1 | CHAT scrub + critical-path gate on nexus; per-mode retry still chat-only |
| Global narrative memory (cross-thread) | ✓ | F8 | Synthesized per Ask Atlas turn |
| Memory chips (surface committed entries) | ✓ | — | Tap → `/ledger?focus=<id>` |
| Clarification cards (earned) | ✓ | — | Fires too often; reason line just wired |
| Suggestion pills (earned) | △ | — | Just re-added; discipline unverified in prod |
| Streaming with word cadence + multi-bubble chunking | ✓ | — | New messages only; history renders instantly |
| Conversation continuity across surface handoff | △ | F1 | Home → workspace bridge fixed this turn; needs regression test |
| Conversation recovery (resume after refresh / crash) | ❌ | — | Transcript survives; assistant in-flight state does not. **See #161/#162 runtime-stability work — this is the real near-term blocker, not a capability gap.** |
| Voice input | ✓ | — | Composer mic |
| Voice output (TTS on assistant messages) | ❌ | F7 | — |
| Live voice conversation | ❌ | F7 | Parked |

## 2. Project Intelligence

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Ledger (Committed / In Tension / Overridden) | ✓ | — | Grouped view; updates only on Commit or Proceed Anyway |
| Decision commit flow | ✓ | — | End-to-end tested |
| Decision Catch Engine (trigger + card) | ✓ | — | Infrastructure done; trigger precision/recall unproven |
| Proceed Anyway → deviation entry | △ | — | Wired; needs regression test |
| Decision tree artifact | ❌ | F3, F4 | — |
| Tradeoff matrix artifact | ❌ | F3, F4 | — |
| RACI chart | ❌ | F3, F4 | — |
| Alignment / conflict summary as persisted artifact | △ | F4 | Exists inside Decision Catch card only; not saved to Ledger |
| Deviation log (chronological view) | ❌ | F4 | — |
| Backend handoff spec (formal schema + card) | △ | F4 | AI drafts in chat; not typed / not rendered as card |
| Impact analysis (blast radius) before edit | ❌ | F2 | — |
| Safe edit plan (impact-shaped, not intent-shaped) | △ | F2 | `propose_plan` exists; plan lacks callers/routes/tests-affected list |

## 3. Codebase Intelligence (source-agnostic — §5b of CAPABILITY_MATRIX.md)

**Every row here is P0 and requires F2.** "Project source" = uploaded ZIP, connected GitHub, Replit workspace, generated Atlas project, pasted code, or a future Connected Source.

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Per-project source ingestion (unified) | ○ | F2 | zip/generated/pasted work end-to-end; github/replit explicitly `501`'d, not silently broken |
| File map / tree per project | △ | F2 | Atlas repo only via `atlas_self_map`; ZIP tree is flat, not queryable |
| Project-wide search / grep | △ | F2 | `search_codebase` scoped to Lovable dev workspace, not user project |
| Symbol search (defs / refs) | ❌ | F2 | Extraction today is regex-based export/import detection, not AST/LSP — no defs/refs/call hierarchy |
| Import / dependency graph | △ | F2 | Real export/import extraction exists (`lib/source-index/extract.ts`) for single-file parsing; no cross-file graph traversal API |
| Route / API discovery | △ | F2 | Atlas frontend only; no backend route discovery; no per-project scan |
| Component usage tracing | ❌ | F2 | — |
| Duplicate system detection | ❌ | F2 | — |
| Codebase Q&A with `path:L1-L20` citations | ❌ | F2 | Vector index is on Atlas memory, not project source |
| Large-project hierarchical summarization | △ | F2 | ZIP `fullContext` is one flat blob |
| Changed-file awareness per source | △ | F2 | Only reflects Lovable workspace `.git`, not ZIP/GitHub/Replit deltas |

## 4. Development

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Code generation (FILE_EDIT) | ✓ | F1 | Nexus BUILD + legacy chat |
| Live preview sandbox | ✓ | — | Cold-start latency open |
| GitHub push (Git Tree / Contents API) | ✓ | F1 | Nexus BUILD writes release entry |
| DiffViewer (LCS, code) | ✓ | F1 | LINE_PATCH FIND exact-match failures still soft |
| Extract-to-Forge | △ | F1 | Chat route only, not nexus |
| File tree drawer | ✓ | — | Drag-drop unverified for large trees |
| Agentic self-correct loop (SHELL_RUN retry iterations) | △ | F1 | Chat-primary; nexus auto-applies but does not iterate |
| Console / terminal surface | ✓ | — | Present in BUILD + SCENARIO lens |
| Secrets management (by-name reference) | ✓ | — | Values never exposed |
| Health checks (schedule + report) | ✓ | — | `/api/browser/schedule` daily |

## 5. Documents

Renderers are real (`lib/renderers/`, verified). Every row below is capped at ○ until F6A (verification) confirms output validity — a renderer that runs is not the same claim as "the file is always well-formed."

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Markdown generation | ✓ | — | No style-guide lock |
| Structured brief / PRD | △ | F3, F5 | Drifts past ~2k words; no template; no domain-review |
| Long-form report | △ | F3 | Structure drifts; no citations |
| Meeting notes / summary | ❌ | F7 | No transcript ingestion |
| DOCX generate | ○ | F3 | `docxRenderer.ts` real and tested; no verification pass |
| DOCX edit (targeted mutation) | ❌ | F3 | — |
| DOCX import (parse) | ❌ | F3 | — |
| DOCX roundtrip (import → edit → export) | ❌ | F3 | Industry-standard failure point |
| PPTX generate | ○ | F3, F6A, F6B | `pptxRenderer.ts` + `presentation-director/` + real vector icons; F6A mechanical + F6B visual QA both now run on every generate |
| PPTX edit | ❌ | F3 | — |
| PPTX import | ❌ | F3 | — |
| PPTX roundtrip | ❌ | F3 | — |
| PPTX visual QA (render + screenshot diff) | ○ | F6B | **Verified:** real render via LibreOffice→PDF→`pdftoppm` (not a stub), detect-only (empty-slide, low-contrast, bottom-edge-overflow, dense-heading, orphan-bullet); no auto-fix; confirmed against both a clean and a deliberately broken deck |
| Production-quality presentations (end-to-end bar) | △ | F3, F5, F6A, F6B | Renderer + Director + Theme + F6A + F6B all exist; F6B now spans PPTX/DOCX/PDF/XLSX and surfaces in the UI; remaining gap to ★ is breadth (more visual QA rules, HTML checker), not existence |
| XLSX generate (values only) | ○ | F3 | `xlsxRenderer.ts` exists and runs |
| XLSX with live formulas | ❌ | F3 | Confirmed absent — zero formula support in renderer. Market chasm |
| Pivot-ready structure | ❌ | F3 | — |
| XLSX import | ❌ | F3 | — |
| XLSX roundtrip (formulas preserved) | ❌ | F3 | — |
| CSV export | △ | — | Escaping edge cases unverified |
| PDF report (text-forward) | ○ | F3 | `pdfRenderer.ts` real, themed; no verification pass |
| PDF (design-heavy, marketing) | △ | F3, F6B | F6B now runs `docVisualQA.ts` (shared with DOCX) against PDF renders — blank-page, low-contrast, dense-heading checks |
| PDF (form / fillable) | ❌ | F3 | Parked until demand signal |
| PDF (print-ready: bleed / CMYK / ICC) | — | — | Parked |

## 6. Visual Outputs

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Sketch (design synthesis) | ✓ | — | Homepage inline; not yet conversation-driven |
| Image generation (concept / mood) | △ | — | No "Accept Direction → Forge handoff" wired |
| Wireframes (static library, 10 blueprints) | ✓ | — | No brief → wireframe generation |
| Wireframe generation from brief | ❌ | F3 | — |
| Diagrams (Mermaid: flow / sequence / ERD) | ○ | F3 | `mermaidRenderer.ts` exists and runs; no visual QA |
| Charts (data viz: Recharts / Vega) | ○ | F3 | `chartRenderer.ts` + `svgChartBuilder.ts` exist and run; no visual QA |

## 7. Communication Drafts

Small, high-frequency outputs. High leverage because they compound daily. **Verified:** `draftRenderer.ts` is real, with a `DraftType` union of exactly `draft_email | draft_slack | draft_pr | draft_changelog` — the four rows below marked ○ are genuinely wired end-to-end, not aspirational. The rest reuse the same pipeline and are cheap adds, not new infrastructure.

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Email draft | ○ | F3, F5 | Real, in `draftRenderer.ts`. No voice/tone lock (needs F5 writing-voice) |
| Slack / chat message | ○ | F3, F5 | Real, in `draftRenderer.ts` |
| PR description (auto from diff) | ○ | F3 | Real, in `draftRenderer.ts` |
| Changelog entry (auto from release entry) | ○ | F3, F4 | Real, in `draftRenderer.ts`; not yet auto-triggered from GitHub push Ledger entry |
| Investor update | ❌ | F3, F5 | Not in `DraftType` union yet — same pipeline, new prompt template |
| Release announcement | ❌ | F3, F5 | Not in `DraftType` union yet |
| LinkedIn post | ❌ | F3, F5 | Not in `DraftType` union yet |
| X / Twitter post | ❌ | F3, F5 | Not in `DraftType` union yet |
| Newsletter | ❌ | F3, F5 | Not in `DraftType` union yet |

## 8. Multi-artifact Bundles

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Ship Package (PRD + wireframes + handoff + summary) | ❌ | F9, F3, F4 | Requires components first |
| Bundle share link (view-only) | ❌ | F9, F10 | — |
| Bundle changelog on re-ship | ❌ | F9 | — |

## 9. Voice / Audio

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Transcription (STT, upload) | ❌ | F7 | Whisper spike open |
| Text-to-speech (TTS out) | ❌ | F7 | Provider selection open |
| Live voice conversation | ❌ | F7 | Parked |

## 10. Video

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Auto product walkthrough (LivePreview capture + TTS) | ❌ | F6B, F7 | — |
| Loom-style commentary from Ledger entry | ❌ | F9 | — |

## 11. Templates / Personalization

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| User-specific PRD scaffold | ❌ | F5, F8 | Tier-3 memory integration |
| Brand kit (colors, fonts, tone) for design output | ❌ | F5 | Theme *inference* exists (project-signal based); a persisted, user-owned brand-kit object does not |
| Voice profile (writing tone from 3 samples) | ❌ | F5 | — |
| Domain glossary | ❌ | F5, F8 | Injected into prompts |

## 12. Import / Roundtrip / Ingestion

"Connected Sources" replaces the old "Phase 2 = GitHub" framing — GitHub is one transport among several the same ingestion contract should eventually support.

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| File context ingestion (as drift/alignment signal) | △ | — | Framed as context, not file-summary responses |
| Image ingestion (OCR / vision) | ❌ | F7 | — |
| URL ingestion (fetch + parse) | ❌ | F7 | `urlScreenshot.ts` only screenshots; does not fetch+parse content |
| ZIP codebase ingestion | ✓ | — | Feeds §3 (with gaps) |
| Connected Sources — GitHub | ❌ | F2 | Explicit `501` in `sources.ts`; read-only push mode exists elsewhere, full-source ingest does not |
| Connected Sources — Replit workspace | ❌ | F2 | Explicit `501` in `sources.ts` |
| Connected Sources — Supabase / Postgres | ❌ | F2 | Not started — new transport, not on prior roadmap |
| Connected Sources — Google Drive / Dropbox | ❌ | F2 | Not started — new transport |
| Connected Sources — PDF / Word / Markdown docs | ❌ | F2 | Not started — new transport |
| Pasted code ingestion (session-scoped source) | ✓ | F2 | Shipped alongside zip/generated |

## 13. Diff sub-types

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Code diffs (line-level, LCS) | ✓ | — | DiffViewer |
| Document diffs (semantic, Word) | ❌ | §5 DOCX import | — |
| Slide visual diffs (PPTX) | △ | F6B | Absolute checks (empty-slide, low-contrast, bottom-edge-overflow, orphan-bullet) exist via `visualQACheckers/pptxVisualQA.ts`; no diff-against-baseline comparison yet |
| Behavioral diffs (code runtime, snapshot) | ❌ | — | Test-run + snapshot comparison |

## 14. Surfaces (workspace tabs, drawers, panels)

| Surface | Status | Notes |
|---|---|---|
| Home composer | ✓ | Conversation-first routing to workspace |
| Workspace chat | ✓ | Nexus route |
| Ledger tab | ✓ | Grouped view |
| Preview → Live URL | ✓ | Paste URL |
| Preview → Sandbox | ✓ | Renders artifacts |
| Preview → Local | ✓ | GitHub + dev server |
| Map (AxiomFlow) | △ | Nodes auto-add during conversation; NAVIGATE_TO regressions noted in data-spine audit |
| Changes tab (file diffs) | ✓ | — |
| Blueprints drawer | ✓ | 10-item library |
| Artifacts tab | △ | Renders per-type; engine now exists (F3), but no F6A verification surfaced in the UI yet |
| Console tab | ✓ | — |
| Connections tab (GitHub) | ✓ | — |
| Secrets tab | ✓ | — |
| Jobs tab (parallel agents) | △ | Present; usage patterns unproven |
| MCP tab (Slack / Notion / Linear) | △ | Connector infra present; provider coverage partial |
| Runtime tab (sandbox lifecycle) | ✓ | Phase 1 done |
| Build panel overlay | ✓ | SSE, event-triggered |
| Onboarding flow | ✓ | 4-step + quick starts |
| Collaboration drawer | △ | Share link + invite; comments tab not wired to data |

## 15. Cross-cutting (system-level)

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Auth / session (Bearer + cookie) | ✓ | — | PROJECT_TRUTH-tracked |
| Project switcher | ✓ | — | — |
| Global search across memory | ✓ | — | ILIKE + vector on Atlas memory (not project source) |
| Health of live app (Microlink + AI assessment) | ✓ | — | — |
| Analytics (project-level) | △ | — | — |
| Billing / capacity metering | ✓ | — | Stripe wired |
| Publish / custom domain | △ | F10 | Lovable-managed |
| Legal-adjacent outputs (contracts, NDAs, ToS) | — | — | Parked pending liability posture |
| **Runtime stability** (hard refresh, Timeline entry loss, output discoverability) | ❌ | — | **Flagged as the near-term blocker ahead of any new capability push — see #161/#162.** No new engine work should be scheduled ahead of this closing. |

---

## Foundation dependency graph

```text
F1 route parity ──────────────► §4 Development (nexus parity)
F2 Source Intelligence Engine ► §3 Codebase Intelligence (all rows)
                              ► §2 impact analysis, safe edit plan
                              ► §7 changelog (via diff)
F3 Artifact Engine ───────────► §5 Documents (all formats)
                              ► §6 diagrams / charts
                              ► §7 Communication drafts
F4 Decision Engine ───────────► §2 reasoning artifacts
                              ► §8 Ship Package
F5 Brand Identity Engine ─────► §7 drafts (tone lock)
                              ► §5 PRD scaffold
                              ► §6 visual outputs (icon/color/typography language)
                              ► §11 personalization
F6A Verification Engine ──────► §5, §6, §8 (every renderer's mechanical correctness)
F6B Visual QA Engine ─────────► §5 PPTX, PDF design-heavy
                              ► §6 charts / diagrams QA
                              ► §10 video walkthrough
F7 Ingestion pipeline ────────► §9 audio, §10 video
                              ► §7 meeting notes
                              ► §12 image / URL ingestion
F8 Memory tier integration ───► F5 identity
                              ► §2 reasoning artifacts
                              ► §7 comms drafts
F9 Ship Package bundler ──────► §8 all rows
F10 Publish / share ──────────► §8 bundle links
```

**Reading the graph:** if you build a §5 or §7 row before F3 exists, you build it in a way that cannot be reused. If you build §3 rows before F2 exists, you have to re-do the ingestion layer to make them work against the *user's* source instead of Atlas's own. F3 and F2 are now real (△/○), which is why the graph's leading edge has shifted: the next bottleneck is not "does the engine exist" but "is the engine's output verified" — F6A/F6B.

---

## Sequencing note (2026-07-10)

This matrix update does **not** imply F6A/F6B should start immediately. Runtime stability (#161/#162 — hard refresh recovery, Timeline entry loss, output discoverability) is the confirmed near-term blocker: a verified, production-quality Artifact Engine does not matter if users can't reliably find or keep what Atlas already generated. Recommended order:
1. Close remaining runtime-stability work.
2. ~~Land F6A (Artifact Verification Engine)~~ — done: mechanical correctness across all 9 renderers, reusable by every format.
3. ~~Land F6B (Visual QA Engine)~~ — done for PPTX (headless render + detect-only pixel/structural checks); DOCX/PDF/XLSX/HTML checkers still to come.

---

## Verification method

How each foundation's status above was confirmed, so future audits can repeat it without re-litigating:
- **F2 / §3 / §12**: grepped for `sources.ts`, `sourceIngest.ts`, `lib/source-index/*`; read the actual `github`/`replit` branch in `routes/sources.ts` to confirm the `501` response text; read `extract.ts` to confirm regex-based (not AST/LSP) symbol extraction.
- **F3 / §5 / §6**: listed `lib/renderers/` directory contents directly; confirmed presence of `artifactEngine.test.ts`, `renderers.test.ts`, `generate-deliverable.test.ts`; grepped `xlsxRenderer.ts` for `formula` (zero matches — confirmed absent).
- **F5**: listed `deliverable-theme/` and `presentation-director/` directory contents; grepped server + DB schema for `voiceProfile`/`brandKit` (zero matches — confirmed absent).
- **F6A/F6B**: `lib/verificationEngine.ts` + `lib/verifiers/*.ts` (F6A) and `lib/visualQAEngine.ts` + `lib/renderToImages.ts` + `lib/visualQACheckers/pptxVisualQA.ts` (F6B, PPTX only) confirmed present and tested; both persist under `metadata.verification` on generated artifacts.
- **F7**: read `urlScreenshot.ts` to confirm it screenshots (does not fetch+parse) URLs.
- **F9**: confirmed `bundleRenderer.ts` is imported by `routes/projectArtifacts.ts` (real, wired) but found no dedicated bundle/zip/share route.
- **§7**: read the `DraftType` union directly in `draftRenderer.ts`.

---

## Maintenance Rule

- Every PR that touches a capability updates its row here in the same commit — including status downgrades.
- Every sprint review reads this file end-to-end. If a row's status changed silently, the maintenance rule was violated.
- Nothing is removed from this file for being low priority. Parked rows stay visible with the `—` symbol.
- The Foundations table (F1–F10, F6A/F6B) is the leading indicator. When a foundation ships, sweep every dependent row and re-verify status.
- Every future audit of this file should re-verify at least the foundations table against actual code (grep/read, not memory) and stamp a fresh commit SHA + date in the header.
