# CAPABILITY_MATRIX.md

**Purpose:** This is an audit document and product contract, not a marketing checklist. It exists to stop the "holes" problem — where a capability appears to exist in code but silently fails in the hands of a user. Every row must answer three questions honestly: **Does it exist? Does it work? Is it actually good enough?**

Companion to `POSITIONING.md` (why Atlas exists) and `PROJECT_TRUTH.md` (what is wired). This document answers **what Atlas can actually deliver**.

---

## The Three-State Principle

Every capability has three meaningful states. Atlas must not mark a capability as complete until it reaches **Shipped-quality**.

| State | Definition | Test |
|---|---|---|
| **Exists** | Code path, edge function, or concept exists in the repo. | `grep` finds it. |
| **Works** | It runs end-to-end in a controlled test with a known-good input. | Author can demo it without caveats. |
| **Shipped-quality** | A competent operator in that field (designer, PM, engineer, analyst, writer) would accept the output without redoing it. | Blind review by a domain expert: "Would you send this?" → yes. |

An "Exists" row is a liability, not an asset. A "Works" row is a demo, not a product. Only **Shipped-quality** rows count toward Atlas's promise.

---

## Column Definitions

| Column | Meaning |
|---|---|
| **Capability** | The specific, narrow output type. Never a category. |
| **Category** | Which section it belongs to. |
| **Current state** | Not started / Exists / Works / Shipped-quality. |
| **Supported today** | Y / N / Partial — is a user able to invoke this right now? |
| **Validated** | Y / N / Partial — has a domain-expert reviewed a real output? |
| **Verified how** | The specific method used to verify. "Code review" is not sufficient for visual/document output — must include visual QA or roundtrip test. |
| **Output location** | Where the artifact lands (Ledger entry, `/build` sandbox, download, storage bucket, chat inline, etc.). If a user cannot find the output, the capability does not ship. |
| **Ledger link required** | Y / N — every build-class output must resolve from a committed Ledger intent per the think→decide→build discipline. |
| **Editable after generation** | One-shot / Iterative / Roundtrip. Users assume iterable; most tools deliver one-shot. |
| **Roundtrip fidelity** | Y / N / Partial / N/A — does import → edit → export preserve formatting, formulas, layout? |
| **Known gaps** | The specific way this capability currently fails or falls short of shipped-quality. |
| **Next validation step** | The single next action that would move this row's state forward. |
| **Priority** | P0 (blocks product promise) / P1 (leverage) / P2 (nice-to-have) / P3 (park). |

---

## Route split (2026-07-08 audit)

Atlas is not one surface. Capabilities are wired across two backend routes with different token vocabularies:

- **`/api/nexus/chat`** — the workspace's active route. Thinking partner, WhisperGate, CLARIFY, NEXT_SUGGESTIONS, Decision Catch (`catchPayload` on `done`). On BUILD turns: `FILE_EDIT`, `GITHUB_PUSH`, `linePatches`, agentic-adjacent auto-apply. On all intents: `MEMORY_CHIPS`. Output Guard (CHAT scrub + critical-path gate) runs before emitters.
- **`/api/chat`** — the legacy builder route. Same token vocabulary; still used by the home-page build-intent handoff. Not retired.

The workspace only reaches `/api/chat` via the home-page **build-intent handoff** (`workspace.tsx:5466`). Builder emitters are now also live on `/api/nexus/chat` for WhisperGate BUILD turns (Option A). Home handoff routing is unchanged.

---

## 1. Core Intelligence

| Capability | State | Today | Validated | Verified how | Output | Ledger | Editable | Roundtrip | Known gaps | Next validation | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Conversational thinking partner (Level 0) | Works | Y | Partial | Manual session scoring | Chat stream | N | Iterative | N/A | Listening quality still ~6.5/10; premature clarification | 20-session blind scoring rubric | P0 |
| Intent classification (WhisperGate) | Works | Y | Partial | Regression tests on labeled prompts | Internal routing | N | N/A | N/A | THINK/BUILD/DECIDE boundary still leaks INTENT_TYPE tokens in some paths | Labeled test set with target ≥95% | P0 |
| Output validation (Output Guard) | Works (nexus + chat) | Y | Partial | WhisperGate CHAT scrub + critical-path gate ported into `nexus.ts` via `builderProtocols.ts` (`scrubOperationalMarkersForChat`, `canProceedWithFileChanges`) | Internal | N | N/A | N/A | Per-mode retry still chat-only; nexus now has the same CHAT scrub + critical-path gate before FILE_EDIT | Extend guard with mode-specific retry if chat gains it | P1 |
| Decision Catch Engine | Works (nexus) | Y | Partial | `detectDecisionCatch` fires in nexus, `catchPayload` on `done`, DecisionCatchCard renders with Proceed Anyway → Ledger deviation path | Inline card | Y | N/A | N/A | Trigger threshold not tuned — fires too rarely or on wrong overlaps | Labeled corpus of decision moments; measure precision/recall | P0 |
| Clarification cards (earned) | Works | Y | Partial | Manual prompt tests | Inline `CLARIFY` block → card | N | One-shot | N/A | Fires too often; reason line just wired | 10 conversation audit: card fired ≤2× per session | P0 |
| Suggestion pills (earned) | Works | Y | N | Code review only | `nextSuggestions` on done event | N | One-shot | N/A | Just re-added; discipline unverified in prod | 10 conversation audit: pills only on discrete forks | P1 |
| Memory surfacing (MemoryChips) | Works (nexus + chat) | Y | Partial | Nexus emits `memoryChips` on done (all intents); auto-match against committed ledger titles | Inline above assistant message | N | N/A | N/A | Prompt discipline for when chips fire still unvalidated in prod | 10-turn audit: chips only when memory is genuinely referenced | P1 |
| Ledger commit flow | Works | Y | Y | End-to-end user test | `/ledger` grouped view | Y | Iterative | N/A | Overridden state UI incomplete | Deviation → override → visual state change test | P0 |

---

## 2. Documents

| Capability | State | Today | Validated | Verified how | Output | Ledger | Editable | Roundtrip | Known gaps | Next validation | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Markdown generation | Works | Y | Partial | Rendered preview | Chat inline / `/build` | Partial | Iterative | Y | No style consistency across sessions | Style-guide-locked output test | P1 |
| Structured brief / PRD | Exists | Partial | N | Code review | Chat inline | Y | One-shot | N | No template lock; no domain-expert review | PM review of 5 generated PRDs | P0 |
| Meeting notes / summary | Not started | N | N | — | — | N | — | — | No transcript ingestion path | Wire transcript upload → summary | P2 |
| Long-form report | Exists | Partial | N | Code review | Chat inline | Y | One-shot | N | Structure drifts past ~2k words; no citations | 5-report length + coherence test | P1 |

---

## 3. Office & Deliverables

### 3a. DOCX

| Capability | State | Today | Validated | Verified how | Output | Ledger | Editable | Roundtrip | Known gaps | Next validation | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DOCX generate | Not started | N | N | — | — | Y | — | N | No generator wired | Choose lib (docx / officegen), scaffold route | P1 |
| DOCX edit (targeted mutation) | Not started | N | N | — | — | Y | — | N | — | Requires generate first | P2 |
| DOCX import (parse) | Not started | N | N | — | — | N | — | N | — | mammoth.js spike | P2 |
| DOCX roundtrip (import → edit → export) | Not started | N | N | — | — | Y | — | N | Industry-standard failure point | Roundtrip fidelity test on real Word docs with track changes | P1 |

### 3b. PPTX

| Capability | State | Today | Validated | Verified how | Output | Ledger | Editable | Roundtrip | Known gaps | Next validation | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PPTX generate | Not started | N | N | — | — | Y | — | N | — | pptxgenjs spike | P1 |
| PPTX edit | Not started | N | N | — | — | Y | — | N | — | Requires generate first | P2 |
| PPTX import | Not started | N | N | — | — | N | — | N | — | Parser spike | P3 |
| PPTX roundtrip | Not started | N | N | — | — | Y | — | N | — | Post-generate | P2 |
| PPTX visual QA | Not started | N | N | — | — | N | N/A | N/A | **Critical**: code-review passes while rendered slides have overlapping text, unicode boxes, off-canvas elements. Must render and screenshot every slide before shipping. | Headless LibreOffice render → screenshot diff pipeline | P0 |

### 3c. XLSX / Spreadsheets

| Capability | State | Today | Validated | Verified how | Output | Ledger | Editable | Roundtrip | Known gaps | Next validation | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CSV export | Exists | Partial | N | Code review | Download | N | One-shot | Y | Escaping edge cases unverified | RFC 4180 test suite | P2 |
| XLSX generate (values only) | Not started | N | N | — | — | Y | — | N | — | exceljs spike | P1 |
| XLSX with formulas | Not started | N | N | — | — | Y | — | N | **Market chasm**: most AI tools dump values, not live formulas | Generate P&L with SUM/IF/VLOOKUP that Excel actually evaluates | P0 |
| Pivot-ready structure | Not started | N | N | — | — | Y | — | N | Requires normalized long-form output | Generate → pivot in Excel without reshape | P1 |
| XLSX import | Not started | N | N | — | — | N | — | N | — | Parser spike | P2 |
| XLSX roundtrip | Not started | N | N | — | — | Y | — | N | Formulas typically destroyed on roundtrip | Formula preservation test | P1 |

### 3d. PDF

| Capability | State | Today | Validated | Verified how | Output | Ledger | Editable | Roundtrip | Known gaps | Next validation | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Report PDF (text-forward) | Not started | N | N | — | — | Y | — | N | — | Markdown → PDF pipeline | P1 |
| Form / fillable PDF | Not started | N | N | — | — | Y | — | N | Requires AcroForm authoring | Park until demand signal | P3 |
| Design-heavy PDF (marketing, decks) | Not started | N | N | — | — | Y | — | N | Layout fidelity is the whole product | Downstream of PPTX visual QA | P2 |
| Print-ready PDF (bleed, CMYK, ICC) | Not started | N | N | — | — | Y | — | N | Specialized; not on critical path | Park | P3 |

---

## 4. Visual Outputs

| Capability | State | Today | Validated | Verified how | Output | Ledger | Editable | Roundtrip | Known gaps | Next validation | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sketch (design synthesis, not drawing) | Works | Y | Partial | Manual review | Homepage Sketch inline | Partial | Iterative | N/A | Not yet conversation-driven; user selects category | Wire Atlas-inferred type from conversation | P1 |
| Image generation (concept / mood) | Exists | Partial | N | Code review | Chat inline | N | One-shot | N/A | No "Accept Direction → Forge handoff" wired | End-to-end Sketch → Forge test | P1 |
| Wireframes | Works | Y | N | Author demo | Blueprints drawer | Y | One-shot | N/A | 10 static blueprints; no generation-from-brief | Brief → wireframe test | P2 |
| Diagrams (flow, sequence, ERD) | Not started | N | N | — | — | Y | — | N | Mermaid render is a first step | Mermaid inline render + export | P1 |
| Charts (data viz) | Not started | N | N | — | — | Y | — | N | — | Recharts / Vega spike | P2 |

---

## 5. Development

| Capability | State | Today | Validated | Verified how | Output | Ledger | Editable | Roundtrip | Known gaps | Next validation | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Code generation (atlas-codegen) | Works (nexus BUILD + chat) | Y | Partial | FILE_EDIT auto-apply to workspace on nexus BUILD; same token protocol as chat | LiveGenerationCard → sandbox | Y | Iterative | N/A | Full agentic self-correct loop still chat-primary; nexus auto-applies + pushes | E2E: workspace BUILD turn writes hello-world component | P0 |
| Live preview sandbox | Works | Y | Y | Author demo | LivePreview iframe | Y | Iterative | N/A | Cold start latency | Warm sandbox pool | P1 |
| Extract-to-Forge | Works (`chat` route only) | Partial | Partial | Author demo | Forge run | Y | Iterative | N/A | Same route gap as codegen — no path from workspace turn | Same bridge fix as codegen | P2 |
| GitHub push (Git Tree API) | Works (nexus BUILD + chat) | Y | Partial | Nexus BUILD executes GITHUB_PUSH + Ledger release entry; same Contents API path as chat | Repo commit + Ledger release entry | Y | N/A | N/A | Tree API still Contents-API based; branch/PR flow present but lightly tested from nexus | E2E: workspace "push this to GitHub" → commit + Ledger | P0 |
| File tree drawer | Works | Y | Y | Author demo | Sidebar | N | Iterative | N/A | Drag-drop snippets unverified for large trees | Stress test | P3 |
| Diff viewer (LCS, code) | Works (nexus BUILD + chat) | Y | Partial | `linePatches` emitted on nexus BUILD done event | Inline | N | N/A | N/A | LINE_PATCH FIND exact-match failures still soft | E2E: workspace code-edit turn renders DiffViewer | P1 |
| Backend handoff spec | Exists | Partial | N | Manual authoring by AI | Chat inline | Y | One-shot | N/A | Not formalized as artifact type; no schema | Define schema (route/method/body/response/auth/consuming file) + render as card | P0 |

---

## 5b. Codebase Intelligence / Project Navigation

Understanding the **user's project** before changing it. Distinct from §5 Development (which mutates code).

**Source-agnostic by definition.** A "project source" is any of: uploaded ZIP, connected GitHub repo, Replit workspace, generated Atlas project, pasted code snippet, or a future imported source (GitLab, Bitbucket, local mount, etc.). Every capability below must operate against **whichever source is attached to the current project**, not against Atlas's own repo.

**The P0 gap:** Atlas today indexes *its own* codebase (`atlas_self_map` covers `artifacts/atlas/src` + `artifacts/api-server/src`) and treats agent-tools (`search_codebase`, `git_diff`, `read_file`) as scoped to the Lovable dev workspace. Neither indexes the user's project source. Until each project has its own file tree, search index, import graph, symbol table, and embedding index — with citations addressable by `path:lineStart-lineEnd` — real codebase Q&A is not possible. Every row below is **P0** for that reason.

| Capability | State | Today | Validated | Verified how | Output | Ledger | Editable | Roundtrip | Known gaps | Next validation | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Per-project source ingestion | Exists (ZIP only) | Partial | N | `project_zip_imports` stores `fileTree` + `fullContext` on upload; no equivalent for GitHub / Replit / generated / pasted | ZIP row per project | N | Re-import | N/A | Single-source, no incremental re-sync, no normalized "project source" abstraction across upload / GitHub / Replit / generated / pasted | Define `project_sources` table keyed by (projectId, sourceType) with unified ingest pipeline | P0 |
| Project-wide search / grep | Works (agent-tools only, wrong scope) | Partial | Partial | `search_codebase` ripgrep tool in `artifacts/api-server/src/lib/agent-tools/search-codebase.ts` runs against `ctx.workspaceDir` (Lovable dev workspace) | Tool result JSON | N | N/A | N/A | Not scoped to the user's project source; not exposed as user-facing capability in nexus | Route search through per-project ingested source; E2E: workspace turn "find every call to `useAuth`" returns file:line list from user's project | P0 |
| Symbol search (defs / refs) | Not started | N | N | — | — | N | N/A | N/A | No AST-aware indexer per project; ripgrep only matches text, not symbol semantics | Decide: tree-sitter per language vs LSP-in-a-box; must run on ingested project source | P0 |
| File map / tree generation | Works (Atlas repo only) | Partial | Partial | `/api/selfmap/refresh` (`artifacts/api-server/src/routes/selfmap.ts`) hard-codes roots to `artifacts/atlas/src` + `artifacts/api-server/src`; ZIP import stores a flat `fileTree` | `atlas_self_map` table / ZIP row | N | Regenerated | N/A | Self-map is Atlas-only; ZIP tree is not queryable as a graph; no path for GitHub / Replit / generated / pasted sources | Generalize map generation to run per project source; store as `project_file_map(projectId, sourceType, tree, edges)` | P0 |
| Dependency / import graph | Exists (Atlas self-map only) | Partial | N | Self-map stores `relationships: {from, to}` from import resolution — for Atlas source only | JSON graph | N | N/A | N/A | No traversal API ("what depends on X?"); no cycle detection; not computed for user projects | Run import-graph builder on ingested project source; add `trace_dependencies(path)` tool | P0 |
| Route / API discovery | Works (Atlas frontend only) | Partial | Y | `artifacts/atlas-frontend/src/lib/scanRoutes.ts` regex-scans `<Route path="">` from App source in the Lovable preview | Cached in localStorage | N | Regenerated | N/A | Only scans Atlas's own frontend; no backend route discovery; not run against user project source of any kind | Per-project route scanner (React Router / Next / Express / edge functions), reconciled against any project-provided OpenAPI | P0 |
| Component usage tracing | Not started | N | N | — | — | N | N/A | N/A | No "where is `<Foo>` rendered in the user's project?" — agent falls back to grep against wrong scope | Ship on top of per-project symbol search | P0 |
| Duplicate system detection | Not started | N | N | — | — | N | N/A | N/A | Cannot detect e.g. two auth stores / two composer implementations in the user's project | Heuristic: cluster ingested files by exports + import fan-in | P0 |
| Impact analysis before edits | Not started | N | N | — | — | N | N/A | N/A | Agent proposes edits with no "these N callers/routes/tests will break" preview | Reverse-edge query on per-project import graph; surface in `propose_plan` payload | P0 |
| Safe edit plan | Exists (propose_plan) | Partial | Partial | `propose_plan` agent tool exists; plan does not enumerate blast radius | Plan artifact | Y | Iterative | N/A | Plan is intent-shaped, not impact-shaped; no callers/tests/routes-affected list | Wire per-project impact analysis into plan payload | P0 |
| Codebase Q&A with file citations | Partial (Atlas memory only) | Partial | Partial | Agent has `read_file` / `search_codebase` / `list_dir` (scoped to Lovable workspace); `/api/search` blends ILIKE + vector search across Atlas memory (entries, sessions, messages, thoughts) — **not project source code** | Tool result / search response | N | N/A | N/A | No vector index on user project source; citations are prose refs, not addressable `path:lineStart-lineEnd` handles | Embed ingested project source per project; render citations as tappable `path:L1-L20` chips that open the file at that range | P0 |
| Large-project summarization | Exists (ZIP `fullContext` blob) | Partial | N | `project_zip_imports.fullContext` is a single text blob on import | Text blob | N | Regenerated on re-import | N/A | One blob per project; not hierarchical, not chunked for retrieval; not produced for non-ZIP sources | Hierarchical summary (repo → package → dir → file) per project source, refreshed on change | P0 |
| Changed-file awareness | Exists (git diff tool, wrong scope) | Partial | N | `git_diff` agent tool runs against Lovable workspace `.git` | Tool result | N | N/A | N/A | No diff for ZIP re-imports, GitHub sync deltas, Replit pulls, or generated-project regenerations | Per-source snapshot store: diff last-ingested vs current, regardless of transport | P0 |

---

## 6. Reasoning Artifacts

The visible form of Atlas's decision-support intelligence. Distinct from Timeline. These are the artifacts a strategic partner produces.

| Capability | State | Today | Validated | Verified how | Output | Ledger | Editable | Roundtrip | Known gaps | Next validation | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Decision tree | Not started | N | N | — | Ledger entry attachment | Y | Iterative | N/A | — | Render from committed intent | P0 |
| Tradeoff matrix | Not started | N | N | — | Ledger entry attachment | Y | Iterative | N/A | — | Auto-build from options in conversation | P0 |
| RACI chart | Not started | N | N | — | Ledger entry attachment | Y | Iterative | N/A | — | Post decision-tree | P2 |
| Alignment / conflict summary | Exists | Partial | N | Part of Decision Catch | Inline card | Y | N/A | N/A | Not persisted as artifact | Persist to Ledger | P1 |
| Deviation log | Not started | N | N | — | Ledger entry | Y | N/A | N/A | Proceed Anyway not yet logging | Wire Proceed Anyway → deviation entry | P0 |

---

## 7. Communication Drafts

Small, high-frequency outputs. High leverage because they compound daily.

| Capability | State | Today | Validated | Verified how | Output | Ledger | Editable | Roundtrip | Known gaps | Next validation | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Email draft | Not started | N | N | — | Chat inline / copy | N | Iterative | N/A | No voice/tone lock | Voice-locked draft test | P1 |
| Slack / chat message | Not started | N | N | — | Chat inline / copy | N | Iterative | N/A | — | Length + tone test | P2 |
| Changelog entry | Not started | N | N | — | Chat inline / copy | Y | Iterative | N/A | Should auto-draft from GitHub push Ledger entry | Wire release entry → changelog draft | P1 |
| Investor update | Not started | N | N | — | Chat inline / copy | Y | Iterative | N/A | — | Voice-locked | P2 |
| Tweet / short post | Not started | N | N | — | Chat inline / copy | N | Iterative | N/A | — | — | P3 |
| PR description | Not started | N | N | — | Chat inline / copy | Y | Iterative | N/A | Should auto-draft from diff | Wire diff → PR description | P1 |

---

## 8. Multi-artifact Bundles

"Ship Package" pattern — one committed intent produces a coherent set of artifacts as a single downloadable/linkable bundle.

| Capability | State | Today | Validated | Verified how | Output | Ledger | Editable | Roundtrip | Known gaps | Next validation | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Ship Package (PRD + wireframes + handoff + summary) | Not started | N | N | — | Ledger entry with zipped bundle + shareable link | Y | Iterative | N/A | Requires PRD, wireframes, handoff spec all at shipped-quality first | Once components are P0-clear, wire bundle emitter | P1 |
| Bundle share link (view-only) | Not started | N | N | — | Public URL | Y | N/A | N/A | Requires collaboration surface work | Post-bundle | P2 |

---

## 9. Voice / Audio

| Capability | State | Today | Validated | Verified how | Output | Ledger | Editable | Roundtrip | Known gaps | Next validation | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Transcription (STT, upload) | Not started | N | N | — | Chat inline / meeting notes | N | N/A | N/A | — | Whisper spike | P2 |
| Text-to-speech (TTS out) | Not started | N | N | — | Audio download | N | N/A | N/A | — | Provider selection | P3 |
| Live voice conversation | Not started | N | N | — | — | N | — | — | Not on critical path | Park | P3 |

---

## 10. Video Walkthroughs

| Capability | State | Today | Validated | Verified how | Output | Ledger | Editable | Roundtrip | Known gaps | Next validation | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Auto-generated product walkthrough | Not started | N | N | — | Video file / hosted link | Y | One-shot | N/A | Requires screen capture of LivePreview + TTS narration | Post-TTS | P2 |
| Loom-style commentary from Ledger entry | Not started | N | N | — | Video file | Y | One-shot | N/A | — | Post-walkthrough | P3 |

---

## 11. Templates

Atlas learns the user's voice/format instead of applying generic scaffolds.

| Capability | State | Today | Validated | Verified how | Output | Ledger | Editable | Roundtrip | Known gaps | Next validation | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| User-specific PRD scaffold | Not started | N | N | — | Reused across sessions | Y | Iterative | N/A | Requires memory-tier integration | Wire tier-3 memory → template store | P1 |
| Brand kit (colors, fonts, tone) for PPTX/design | Not started | N | N | — | Applied to every generated deliverable | Y | Iterative | N/A | — | Post-PPTX generate | P1 |
| Voice profile (writing tone) | Not started | N | N | — | Applied to every draft | Y | Iterative | N/A | — | 3-sample calibration flow | P1 |
| Domain glossary | Not started | N | N | — | Injected into prompts | N | Iterative | N/A | — | Post voice profile | P2 |

---

## 12. Import / Roundtrip Capabilities

Bar is import → edit → export **without breaking formatting**. Industry-standard failure. Most AI tools score ✅ on generate and quietly ❌ on roundtrip.

| Capability | State | Today | Validated | Verified how | Output | Ledger | Editable | Roundtrip | Known gaps | Next validation | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| File context ingestion (as drift/alignment signal) | Exists | Partial | N | Code review | Internal | N | N/A | N/A | Framed as context, not "here's what's in your file" — per positioning | Confirm ingestion never leaks file-summary responses | P1 |
| Image ingestion (OCR / vision) | Not started | N | N | — | Chat context | N | N/A | N/A | — | Vision model spike | P2 |
| URL ingestion (fetch + parse) | Not started | N | N | — | Chat context | N | N/A | N/A | Phase 5 in North Star | Post mobile / Forge / memory / audit | P1 |
| DOCX roundtrip | Not started | See §3a | | | | | | | | | |
| PPTX roundtrip | Not started | See §3b | | | | | | | | | |
| XLSX roundtrip (formulas preserved) | Not started | See §3c | | | | | | | | | |

### 11b. Diff sub-types (split from single "Diffs" row)

| Capability | State | Today | Validated | Verified how | Output | Priority | Notes |
|---|---|---|---|---|---|---|---|
| Code diffs (line-level, LCS) | Works | Y | Y | Author demo | Inline | P2 | Shipped in DiffViewer |
| Document diffs (semantic, Word) | Not started | N | N | — | — | P2 | Requires DOCX import first |
| Slide visual diffs (PPTX) | Not started | N | N | — | — | P2 | Requires PPTX visual QA pipeline |
| Behavioral diffs (code runtime) | Not started | N | N | — | — | P3 | Test-run + snapshot comparison |

---

## Parked (Future / Legal-adjacent)

Not on the matrix until "advisory only, not legal advice" framing and liability posture are designed.

- Contracts
- SOWs / MSAs
- NDAs
- Privacy policies / ToS
- Any output that could be relied on as legal advice

---

## Audit Summary

### 1. What is actually supported today in the workspace's active surface (nexus)

- Conversational thinking partner (Level 0)
- Intent classification (WhisperGate)
- Clarification cards
- Suggestion pills (just re-added)
- Ledger commit flow
- Decision Catch Engine (infrastructure complete — trigger tuning open)
- Markdown generation
- Sketch (design synthesis)
- Wireframes (static library)
- Live preview sandbox
- File tree drawer
- Code diff renderer + `linePatches` data path (nexus BUILD)
- Code generation (`FILE_EDIT` on nexus BUILD)
- GitHub push (`GITHUB_PUSH` on nexus BUILD)
- Memory chips emission (`MEMORY_CHIPS` on all nexus intents)
- Output Guard (CHAT scrub + critical-path gate on nexus)
- CSV export

### 1b. Still chat-primary (not fully ported to nexus)

- Extract-to-Forge
- Full agentic self-correction loop (SHELL_RUN retry iterations) — nexus auto-applies FILE_EDIT + GITHUB_PUSH but does not yet run the multi-iteration self-correct loop

### 2. What is only aspirational (Not started / Exists but not Works)

- All DOCX, PPTX, XLSX, PDF generation
- All reasoning artifacts except alignment/conflict inline
- All communication drafts
- Ship Package bundles
- Voice / audio / video
- All templates (PRD scaffold, brand kit, voice profile)
- URL, image, DOCX/PPTX/XLSX import & roundtrip
- Backend handoff spec (drafted by AI in chat, not formalized as artifact)
- Structured brief / PRD (exists but no domain review)
- Long-form report (exists but drifts past ~2k words)

### 3. What needs validation next (highest-signal audits)

1. **E2E verification checklist** — workspace BUILD turn writes files, pushes to GitHub, surfaces MemoryChips, renders DiffViewer; Decision Catch + CLARIFY + NEXT_SUGGESTIONS still fire on BUILD.
2. **10-conversation audit** of clarification-card + suggestion-pill discipline. Confirm they fire only when earned.
3. **Decision Catch trigger tuning** — labeled corpus, precision/recall on real decision moments; verify Proceed Anyway writes a deviation entry.
4. **Backend handoff spec schema** — formalize as first-class artifact so we stop losing them in chat scrollback.
5. **PPTX visual QA pipeline** (headless render → screenshot diff) — must exist *before* PPTX generate ships.
6. **XLSX-with-formulas spike** — validate the market chasm and prove Atlas can cross it.
7. **PRD domain review** — 5 generated PRDs reviewed by a working PM.
8. **INTENT_TYPE token leak audit** — confirm no marker text escapes to user prose on any path.
9. **Port remaining chat-primary loops** (agentic self-correct, Extract-to-Forge) once BUILD emitters prove stable.

### 4. Highest-leverage capabilities for Atlas's product promise

Ranked by how much they reinforce the decision-led-builder positioning:

1. **Decision Catch Engine tuning (P0)** — infrastructure is done; the *only* capability that no competitor offers, and it's already Works. Trigger tuning turns it from "wired" into a moat.
2. **Backend handoff spec as first-class artifact (P0)** — Atlas already produces these; formalizing them turns a chat artifact into a shippable deliverable and reinforces the think→decide→build order.
3. **Reasoning artifacts: decision tree + tradeoff matrix + deviation log (P0)** — the visible proof that Atlas decides before it builds. Without these, positioning is invisible.
4. **XLSX with live formulas (P0)** — crosses a market chasm; PMs, ops, finance users have no good AI option here.
5. **PPTX generate + visual QA (P0/P1)** — the largest deliverable category by demand, and the one where competitors most visibly fail. Visual QA is what makes this shipped-quality instead of embarrassing.
6. **Templates: voice profile + brand kit + PRD scaffold (P1)** — turns Atlas from a generic generator into "*your* Atlas." Compounds retention.
7. **Ship Package bundles (P1)** — makes the Ledger entry the unit of delivery, not the message. Reinforces think→decide→build viscerally.
8. **Changelog + PR description auto-draft from Ledger release entries (P1)** — closes the loop between build and communication; every push becomes a comms artifact for free.
9. **Retire `/api/chat` after nexus BUILD parity is stable in prod (P1)** — home handoff can keep using chat until then.

---

## Maintenance Rule

Any PR that adds a capability MUST update this matrix in the same commit. Any capability that regresses below its stated state MUST be downgraded here before the next release. A row without a **Next validation step** is a bug in this document, not a placeholder.
