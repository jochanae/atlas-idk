# MASTER_CAPABILITY_MATRIX.md

**Purpose.** The single, complete inventory of every user-facing capability Atlas is expected to have — across every surface, whether shipped or not. This document exists to solve a **visibility problem**, not a prioritization problem. If a capability is not on this list, Atlas has silently forgotten it exists.

**Rule of inclusion.** A capability appears here if Atlas has ever promised it (in POSITIONING.md, in a shipped feature, in a memory, in a handoff, in a matrix row, in a demo, or in the user's stated expectations). **Priority is not a reason to omit.** P3 rows sit next to P0 rows.

**Companion documents.**
- `POSITIONING.md` — why Atlas exists.
- `PROJECT_TRUTH.md` — what is wired at the URL/route/table level.
- `CAPABILITY_MATRIX.md` — the deep audit (with validation methods, known gaps, priorities).
- **This file** — the checklist. Every sprint updates it. Nothing gets removed for being unimportant.

---

## Status legend

| Symbol | State | Definition |
|---|---|---|
| ✓ | **Shipped** | Works end-to-end at shipped-quality; a domain expert would accept the output. |
| △ | **Partial** | Wired but incomplete: works in one surface but not another, or missing validation, or output not shipped-quality. |
| ○ | **Planned** | Explicitly on the roadmap; design or spec exists; not yet wired. |
| ✗ | **Missing** | Promised or implied but no code path, no design, no owner. |
| — | **Parked** | Consciously deferred (legal-adjacent, out of scope, or blocked). |

**Dependencies** column names the foundation(s) a capability sits on. If a foundation is not ✓, every capability that depends on it should read as at most △.

---

## Foundations

These are not user-facing capabilities. They are the substrates every other capability sits on. Every foundation not-yet-shipped cascades into partial/missing rows below.

| # | Foundation | Status | Description | Unlocks |
|---|---|---|---|---|
| F1 | Route parity (nexus ↔ chat) | △ | Workspace uses `/api/nexus/chat`; legacy `/api/chat` still used by home build-intent handoff. Emitter parity landed; agentic self-correct loop still chat-primary. | Every workspace-invoked capability |
| F2 | Source Intelligence (per-project) | ✗ | Ingest, index, search, symbol, import-graph, embeddings for the **user's** project source (ZIP/GitHub/Replit/generated/pasted). Today all "codebase" tools point at Atlas's own repo or the Lovable dev workspace. | §5b, code Q&A, impact analysis, safe edits, changelog |
| F3 | Artifact Engine | ✗ | One generator with many renderers (MD → DOCX/PPTX/XLSX/PDF/Mermaid/Chart/Email/Slack). Today every artifact is bespoke. | §3, §4 diagrams/charts, §7, §8 |
| F4 | Decision Engine | △ | One decision object → many views (card, tradeoff matrix, RACI, tree, deviation log). Ledger + Decision Catch exist; artifact views do not. | §6 all rows, §7 changelog, §8 Ship Package |
| F5 | Template / Voice profile | ✗ | User-specific PRD scaffold, brand kit, voice profile, glossary — applied to every artifact. | §7 drafts, §3 docs, §8 bundles |
| F6 | Visual QA pipeline | ✗ | Headless render + screenshot diff for any visual output (PPTX slide, PDF page, chart, diagram). | §3b PPTX, §3d PDF, §4 charts/diagrams |
| F7 | Ingestion pipeline (URL / image / audio) | ✗ | Unified fetch + parse + embed for URL, image (OCR/vision), audio (STT). Only file-ingestion-as-drift-signal exists. | §7 drafts, §9 audio, §11 templates |
| F8 | Memory tier integration | △ | 5-tier memory seeded by Forge; global narrative synthesized per-turn. Tier-3+ retrieval into artifact generation is not wired. | F5 templates, §6 reasoning artifacts, §7 comms drafts |
| F9 | Ship Package bundler | ✗ | One committed intent → coherent bundle (PRD + wireframes + handoff + summary) → zipped + shareable. | §8 |
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
| Conversation recovery (resume after refresh / crash) | ✗ | — | Transcript survives; assistant in-flight state does not |
| Voice input | ✓ | — | Composer mic |
| Voice output (TTS on assistant messages) | ✗ | F7 | — |
| Live voice conversation | ✗ | F7 | Parked |

## 2. Project Intelligence

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Ledger (Committed / In Tension / Overridden) | ✓ | — | Grouped view; updates only on Commit or Proceed Anyway |
| Decision commit flow | ✓ | — | End-to-end tested |
| Decision Catch Engine (trigger + card) | ✓ | — | Infrastructure done; trigger precision/recall unproven |
| Proceed Anyway → deviation entry | △ | — | Wired; needs regression test |
| Decision tree artifact | ✗ | F3, F4 | — |
| Tradeoff matrix artifact | ✗ | F3, F4 | — |
| RACI chart | ✗ | F3, F4 | — |
| Alignment / conflict summary as persisted artifact | △ | F4 | Exists inside Decision Catch card only; not saved to Ledger |
| Deviation log (chronological view) | ✗ | F4 | — |
| Backend handoff spec (formal schema + card) | △ | F4 | AI drafts in chat; not typed / not rendered as card |
| Impact analysis (blast radius) before edit | ✗ | F2 | — |
| Safe edit plan (impact-shaped, not intent-shaped) | △ | F2 | `propose_plan` exists; plan lacks callers/routes/tests-affected list |

## 3. Codebase Intelligence (source-agnostic — §5b of CAPABILITY_MATRIX.md)

**Every row here is P0 and requires F2.** "Project source" = uploaded ZIP, connected GitHub, Replit workspace, generated Atlas project, pasted code, or future imported sources.

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Per-project source ingestion (unified) | △ | F2 | ZIP only; no GitHub / Replit / generated / pasted |
| File map / tree per project | △ | F2 | Atlas repo only via `atlas_self_map`; ZIP tree is flat, not queryable |
| Project-wide search / grep | △ | F2 | `search_codebase` scoped to Lovable dev workspace, not user project |
| Symbol search (defs / refs) | ✗ | F2 | Needs tree-sitter or LSP per language |
| Import / dependency graph | △ | F2 | Exists for Atlas repo only; no traversal API |
| Route / API discovery | △ | F2 | Atlas frontend only; no backend route discovery; no per-project scan |
| Component usage tracing | ✗ | F2 | — |
| Duplicate system detection | ✗ | F2 | — |
| Codebase Q&A with `path:L1-L20` citations | ✗ | F2 | Vector index is on Atlas memory, not project source |
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

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Markdown generation | ✓ | — | No style-guide lock |
| Structured brief / PRD | △ | F3, F5 | Drifts past ~2k words; no template; no domain-review |
| Long-form report | △ | F3 | Structure drifts; no citations |
| Meeting notes / summary | ✗ | F7 | No transcript ingestion |
| DOCX generate | ✗ | F3 | — |
| DOCX edit (targeted mutation) | ✗ | F3 | — |
| DOCX import (parse) | ✗ | F3 | — |
| DOCX roundtrip (import → edit → export) | ✗ | F3 | Industry-standard failure point |
| PPTX generate | ✗ | F3 | — |
| PPTX edit | ✗ | F3 | — |
| PPTX import | ✗ | F3 | — |
| PPTX roundtrip | ✗ | F3 | — |
| PPTX visual QA (render + screenshot diff) | ✗ | F6 | **Blocks PPTX generate from shipping** |
| XLSX generate (values only) | ✗ | F3 | — |
| XLSX with live formulas | ✗ | F3 | Market chasm |
| Pivot-ready structure | ✗ | F3 | — |
| XLSX import | ✗ | F3 | — |
| XLSX roundtrip (formulas preserved) | ✗ | F3 | — |
| CSV export | △ | — | Escaping edge cases unverified |
| PDF report (text-forward) | ✗ | F3 | — |
| PDF (design-heavy, marketing) | ✗ | F3, F6 | — |
| PDF (form / fillable) | ✗ | F3 | Parked until demand signal |
| PDF (print-ready: bleed / CMYK / ICC) | — | — | Parked |

## 6. Visual Outputs

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Sketch (design synthesis) | ✓ | — | Homepage inline; not yet conversation-driven |
| Image generation (concept / mood) | △ | — | No "Accept Direction → Forge handoff" wired |
| Wireframes (static library, 10 blueprints) | ✓ | — | No brief → wireframe generation |
| Wireframe generation from brief | ✗ | F3 | — |
| Diagrams (Mermaid: flow / sequence / ERD) | ✗ | F3 | — |
| Charts (data viz: Recharts / Vega) | ✗ | F3 | — |

## 7. Communication Drafts

Small, high-frequency outputs. High leverage because they compound daily.

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Email draft | ✗ | F3, F5 | No voice/tone lock |
| Slack / chat message | ✗ | F3, F5 | — |
| Changelog entry (auto from release entry) | ✗ | F3, F4 | Should auto-draft from GitHub push Ledger entry |
| PR description (auto from diff) | ✗ | F3 | — |
| Investor update | ✗ | F3, F5 | — |
| Tweet / short post | ✗ | F3, F5 | — |

## 8. Multi-artifact Bundles

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Ship Package (PRD + wireframes + handoff + summary) | ✗ | F9, F3, F4 | Requires components first |
| Bundle share link (view-only) | ✗ | F9, F10 | — |
| Bundle changelog on re-ship | ✗ | F9 | — |

## 9. Voice / Audio

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Transcription (STT, upload) | ✗ | F7 | Whisper spike open |
| Text-to-speech (TTS out) | ✗ | F7 | Provider selection open |
| Live voice conversation | ✗ | F7 | Parked |

## 10. Video

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Auto product walkthrough (LivePreview capture + TTS) | ✗ | F6, F7 | — |
| Loom-style commentary from Ledger entry | ✗ | F9 | — |

## 11. Templates / Personalization

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| User-specific PRD scaffold | ✗ | F5, F8 | Tier-3 memory integration |
| Brand kit (colors, fonts, tone) for design output | ✗ | F5 | — |
| Voice profile (writing tone from 3 samples) | ✗ | F5 | — |
| Domain glossary | ✗ | F5, F8 | Injected into prompts |

## 12. Import / Roundtrip / Ingestion

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| File context ingestion (as drift/alignment signal) | △ | — | Framed as context, not file-summary responses |
| Image ingestion (OCR / vision) | ✗ | F7 | — |
| URL ingestion (fetch + parse) | ✗ | F7 | Phase 5 in North Star |
| ZIP codebase ingestion | ✓ | — | Feeds §3 (with gaps) |
| GitHub source ingestion (source-of-truth, not just push) | ✗ | F2 | Read-only mode exists; no full-source ingest |
| Replit workspace ingestion | ✗ | F2 | — |
| Pasted code ingestion (session-scoped source) | ✗ | F2 | — |

## 13. Diff sub-types

| Capability | Status | Depends on | Notes |
|---|---|---|---|
| Code diffs (line-level, LCS) | ✓ | — | DiffViewer |
| Document diffs (semantic, Word) | ✗ | §5 DOCX import | — |
| Slide visual diffs (PPTX) | ✗ | F6 | — |
| Behavioral diffs (code runtime, snapshot) | ✗ | — | Test-run + snapshot comparison |

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
| Artifacts tab | △ | Renders per-type; no unified engine |
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

---

## Foundation dependency graph

```text
F1 route parity ──────────────► §4 Development (nexus parity)
F2 Source Intelligence ───────► §3 Codebase Intelligence (all rows)
                              ► §2 impact analysis, safe edit plan
                              ► §7 changelog (via diff)
F3 Artifact Engine ───────────► §5 Documents (all formats)
                              ► §6 diagrams / charts
                              ► §7 Communication drafts
F4 Decision Engine ───────────► §2 reasoning artifacts
                              ► §8 Ship Package
F5 Template / Voice profile ──► §7 drafts (tone lock)
                              ► §5 PRD scaffold
                              ► §11 personalization
F6 Visual QA pipeline ────────► §5 PPTX, PDF design-heavy
                              ► §6 charts / diagrams QA
                              ► §10 video walkthrough
F7 Ingestion pipeline ────────► §9 audio, §10 video
                              ► §7 meeting notes
                              ► §12 image / URL ingestion
F8 Memory tier integration ───► F5 templates
                              ► §2 reasoning artifacts
                              ► §7 comms drafts
F9 Ship Package bundler ──────► §8 all rows
F10 Publish / share ──────────► §8 bundle links
```

**Reading the graph:** if you build a §5 or §7 row before F3 exists, you build it in a way that cannot be reused. If you build §3 rows before F2 exists, you have to re-do the ingestion layer to make them work against the *user's* source instead of Atlas's own. The foundations are the difference between "one more bespoke feature" and "a family of features cheaply."

---

## Maintenance Rule

- Every PR that touches a capability updates its row here in the same commit — including status downgrades.
- Every sprint review reads this file end-to-end. If a row's status changed silently, the maintenance rule was violated.
- Nothing is removed from this file for being low priority. Parked rows stay visible with the `—` symbol.
- The Foundations table (F1–F10) is the leading indicator. When a foundation ships, sweep every dependent row and re-verify status.
