# Milestone 2.1 — Artifact Generation & Delivery Audit

**Phase:** Read-only audit → **partial remediation landed** → remaining fixes in progress  
**Date:** 2026-07-22  
**Repo HEAD at audit:** `95e6f309` (`main`)  
**Partial remediation on main:** `56eae70c` (2026-07-22) — see §Partial remediation  
**Status:** Findings accepted; fix wave started (persistence when unfocused + Open deep-link)  
**Board:** [`milestone-2-restore-intelligence.md`](./milestone-2-restore-intelligence.md)

### Incident under audit

Atlas offered a spreadsheet from Ask Atlas. The user was sent toward a project / Outputs destination. Observed: Outputs section collapsed and/or empty; opening the project ran the full Workspace opening/hydration pipeline rather than focusing the requested output.

### Governing requirements

> When Atlas generates an artifact in Ask Atlas, the artifact must appear in that conversation first. Storage in Global Files or a related Workspace is additional persistence—not a substitute for delivery.

> A link to a Workspace output must open the actual output or its destination state, not initiate a generic full-conversation handoff.

---

## Partial remediation — `56eae70c` (main, 2026-07-22)

**Commit:** `56eae70c` — *Enable users to generate files directly in conversations* (Replit Agent)

| Change | Audit impact |
|--------|----------------|
| `generate_deliverable` added to `SHARED_HOME_TOOL_NAMES` | **Supersedes** “home tool list omits generate_deliverable” (A.1) |
| `allowToolAccess = !justTalk && !conversationModeActive` | **Supersedes** “tools only on BUILD/DECIDE” (A.1) |
| Tool description + capability / BUILD prompts emphasize **inline card** in the current conversation; Ask Atlas must not say “put it in workspace / Outputs” | Softens Outputs-first prose steering (A.2 / B) |
| Handoff contract EXCEPTION: call `generate_deliverable` this turn; do **not** emit `PROJECT_READY` for deliverable requests | Softens forced-handoff pressure for deliverables (D.3) — **prompt-only**, not server-enforced |

**Still open after `56eae70c` (fix targets):**

1. **Hard `projectId` gate** — tool still returns “No active project…” when `focusProjectId` is missing (`generate-deliverable.ts`); unfocused Ask Atlas can *call* the tool and still fail.  
2. **No prose↔tool consistency check** — model can still claim success without `generatedArtifacts`.  
3. **Open / project link routing** — Ask Atlas → project still seeds generic handoff continuation; `axiom:open-output` is a no-op until Workspace is mounted.  
4. **Presentation** — Outputs default collapsed; XLSX in All Outputs only (`includedInArtifacts: false`).  
5. **Handoff contract conflict** — same block still says “MUST emit PROJECT_READY” alongside the deliverable EXCEPTION.

`56eae70c` is a **prompt + tool-schema partial remediation**, not a complete generation/delivery fix.

---

## Executive summary

Spreadsheet generation is a **real** server capability (`generate_deliverable` → Artifact Engine → object storage + `project_artifacts`). As of `56eae70c`, the tool is on the **home** tool list and WhisperGate no longer limits tools to BUILD/DECIDE — but success still requires a positive `projectId`, and success prose is **not** gated on a successful tool result.

The most likely failure chain for the observed spreadsheet incident remains a **delivery / routing / presentation gap**, with generation access only partially repaired:

1. **Prose can claim success without a successful tool call** (capability prompt always present; no prose↔artifact consistency check). ~~Tools absent on home / CHAT~~ — **partially addressed by `56eae70c`**.  
2. **Without `focusProjectId`, the tool hard-fails** — “No active project” — so nothing lands anywhere. (**Still open.**)  
3. **Ask Atlas → project navigation always seeds a full handoff continuation** (`seedHandoffContinuation`) and lands on Chat with Outputs collapsed — it never seeds `atlas-open-output-*`. (**Still open.**)  
4. **`axiom:open-output` only works while Workspace is mounted** — Open from an Ask Atlas card is effectively a no-op for navigation. (**Still open.**)  
5. **XLSX lives in All Outputs, not the Artifacts sub-tab** (`includedInArtifacts: false`) — easy to look in the wrong place even when the file exists.

True tool success writes bytes **before** the DB row and before the model continues, so empty Outputs after a *real* success usually means wrong project, wrong sub-tab, or panel never opened.

---

## A. Generation

### A.1 Did Atlas call an actual XLSX-generation tool?

**Capability exists.** Tool: `generate_deliverable` with `type: "xlsx"` (also `pptx | docx | html-app | pdf | mermaid | chart`).

| Claim | Evidence |
|-------|----------|
| Tool definition + seven types | `artifacts/api-server/src/lib/agent-tools/generate-deliverable.ts:21–37` |
| Registered in shared agent tools | `artifacts/api-server/src/lib/agent-tools/index.ts` (via `generateDeliverableTool`) |
| In workspace tool name list | `anthropic-adapter.ts` (`SHARED_WORKSPACE_TOOL_NAMES` includes `generate_deliverable`) |
| In home tool name list | **`56eae70c`** — also in `SHARED_HOME_TOOL_NAMES` |
| Nexus selects tools by focus | `nexus.ts:7749` — `focusProjectId ? NEXUS_WORKSPACE_TOOLS : NEXUS_AGENT_TOOLS` (both lists now include `generate_deliverable`) |
| WhisperGate: tools when not justTalk/conversationMode | **`56eae70c`** — no longer BUILD/DECIDE-only |

**Ask Atlas vs Workspace:** Same tool implementation. After `56eae70c`, Ask Atlas can *invoke* the tool without BUILD/DECIDE. **Unfocused Ask Atlas still fails at execute** until a project (or deliverable-bucket shim) supplies `projectId > 0`.

**Runtime answer for a specific turn** requires logs: `nexus: tool executed` with `tool: "generate_deliverable"` and result `ok`.

### A.2 Did it only produce prose claiming the spreadsheet was generated?

**Possible — and under-constrained.**

| Risk | Evidence |
|------|----------|
| Unconditional capability block tells the model it CAN generate files and to call the tool | `nexus.ts:3327–3355` |
| Same block can fire on turns where tools are disabled (CHAT / justTalk) | Conflict with CHAT “no tools” guidance (~4239–4252) |
| No server check that Outputs claims require `generatedArtifacts.length > 0` | Absent in nexus done/persist path |
| Tool failure returns `{ ok: false }` but prose honesty is prompt-only | `generate-deliverable.ts:85–88`, `227–237`; prompt `3354` |

**Stale memory note:** `.agents/memory/deliverable-reachability-gaps.md` still claims the chat tool only exposes pptx/docx/xlsx — **contradicted** by the live enum (seven types). Prefer code over that memory file.

### A.3 Was an artifact record created?

Only on successful `generateArtifact` inside the tool:

1. Renderer produces `Buffer`  
2. Upload to object storage  
3. Insert `project_artifacts`  
4. Push `ctx.sideEffects.generatedArtifacts`  
5. Fire-and-forget library capture  
6. SSE `artifact_created` + timeline step  

Evidence: `generate-deliverable.ts:144–226`; engine upload-before-insert in `artifactEngine.ts` (~148–175).

Failures before engine (`projectId <= 0`, empty context, missing renderer) return errors and **do not** create rows.

### A.4 Did generation fail silently?

**Not silent at the tool layer** — failures return `{ ok: false, error }`.  
**Can look silent to the user** if the model ignores the error and still claims success, or never calls the tool and narrates from the capability prompt.

Hard fail without project:

```text
"No active project — open a project workspace before generating Outputs."
```

(`generate-deliverable.ts:85–88`)

---

## B. Delivery

### B.1 Was the spreadsheet supposed to render inline in Ask Atlas?

**No full spreadsheet viewport in Ask Atlas.** Delivery contract for success:

| Surface | Inline receipt | Full Outputs gallery |
|---------|----------------|----------------------|
| Ask Atlas | `ArtifactCreatedCard` when `generatedArtifacts` on the message (`AskAtlasSurface.tsx` ~675–684) | N/A on home |
| Workspace | Same card (`ChatStream.tsx` ~1074–1079; suppressed in conversationMode) | Outputs panel |

XLSX destination resolution: download-oriented — `resolveItemDestination.ts:47` → `destination: "download"`, `viewport: "spreadsheet"`, `autoRender: false`.

### B.2 Was a downloadable file card created?

**Only if** `generatedArtifacts` was populated (successful tool) and the client rendered the card after stream `done`. Download uses `href={downloadUrl}` on the card — that path works cross-surface when the artifact exists.

Card **Open** dispatches `axiom:open-output` — see §D/E: useless for navigation while still on Ask Atlas/home.

### B.3 Was the assistant response given before the file was actually available?

| Scenario | Verdict |
|----------|---------|
| Tool called and succeeded | Upload + DB complete **inside** tool execute before the model sees the tool result. Post-tool prose should refer to an existing file. |
| Streaming UI | Text may stream before/during tools; success card waits for `done` + not streaming. Mid-stream `artifact_created` can open Outputs **if Workspace is mounted**. |
| Tool never called / failed | Prose can claim success with **no** bytes and **no** card. |

---

## C. Storage

| Destination | Role for XLSX |
|-------------|----------------|
| **Workspace → Outputs (All Outputs)** | Canonical file-backed deliverable list (`includedInOutputs: true`) |
| **Workspace → Outputs → Artifacts sub-tab** | **Excludes** xlsx/pptx/docx/pdf (`includedInArtifacts: false`) — `outputsClassification.ts:196–205` |
| **Global Files / Library “Generated”** | Dual-write via `captureDeliverableToLibrary` (metadata/preview) — **additional** persistence, not Ask Atlas delivery |
| **Project Files / code tree** | Not where XLSX lands |

**DB:** `project_artifacts` with `metadata.objectPath`, size, mime, extension.  
**Bytes:** Object storage via `uploadRenderedFile` before insert.

### Can a DB record exist without bytes?

- Happy path: upload fails → insert never runs.  
- After insert: verification can mark missing file without deleting the row.  
- Legacy/JSON artifact types can exist without `objectPath` → download 404.  
- Library row can exist independently of a healthy download.

### Wrong project / conversation

- Artifact `projectId` = `focusProjectId` at generation time. Stale home focus → wrong project.  
- Outputs listing is **project-scoped**, not conversation-scoped.  
- Message metadata attach of `generatedArtifacts` is best-effort on latest assistant message (race under concurrent turns).

---

## D. Routing and promotion

### D.1 Was the Ask Atlas conversation already associated with a Workspace?

Ask Atlas and Workspace share `/api/nexus/chat`; association is via `focusProjectId` + handoff (`POST /api/nexus/handoff`) + navigation to `/workspace/{cid}` or `/project/{id}`. Artifact creation does **not** itself force a handoff (surface contract: Ask Atlas may produce lightweight deliverables — `.agents/memory/ask-atlas-workspace-surface-contract.md`).

### D.2 Did Atlas infer an existing project association?

Focus comes from client-supplied `focusProjectId` / home focus — not from inventing a project inside `generate_deliverable`. Without focus, generation fails (A.4).

### D.3 Did artifact creation incorrectly force a handoff?

**No.** Creating an artifact does not navigate. The opposite problem is more common: **user/project CTAs force a full handoff** even when the user wanted an output.

### D.4 Why did opening the project initiate full opening/hydration?

`navigateAfterAskAtlasHandoff` / `redirectAfterHandoff` always:

1. `seedHandoffContinuation(projectId)` — sets `atlas-opening-message`, `atlas-handoff-continuation=1`  
2. Navigate with `source=home-handoff` (or similar)  

Evidence: `askAtlasHelpers.ts:144–227`.

That seeds the **generic continuation kickoff**, not an Outputs deep-link. Workspace therefore runs history hydration + opening/continuation turn. Default UI: Chat tab; `subheaderOpen` defaults **false** (`workspace.tsx` ~4700).

**Missing:** no `atlas-open-output-${projectId}` seed; no `leftTab=artifacts`; no focus artifact id on handoff.

`axiom:open-output` handler (`workspace.tsx:7283–7300`) only runs when Workspace is already mounted — sets sessionStorage, opens subheader, switches to artifacts tab, then `axiom:focus-output`.

---

## E. Presentation

### E.1 Why was Outputs collapsed when the user was sent there?

Because “sent there” via project handoff **does not open Outputs**. Collapse is the default. Only `axiom:open-output` (or manual Outputs / composer `more:artifacts`) expands the subheader and switches tab.

### E.2 Why did the destination not focus or open the artifact?

1. Handoff path never requests focus.  
2. Ask Atlas card Open fires `axiom:open-output` with **no listener** on home.  
3. Even in Workspace, focus highlights via `OutputsGallery` sessionStorage / `axiom:focus-output` — **no scroll-into-view** found for the row.  
4. Race: `focus-output` at 80ms may fire before gallery mount; partially mitigated by sessionStorage re-read on mount — but only if `open-output` ran on Workspace first.

### E.3 Why was Outputs empty after Atlas said the file was placed there?

Most plausible, in order:

1. **No successful `generate_deliverable`** — prose-only, CHAT/no-tools, or unfocused Ask Atlas.  
2. **Tool failed** (`projectId` missing / engine error) and model still claimed success.  
3. **Wrong project** opened vs `focusProjectId` at generation.  
4. **Wrong sub-tab** — Artifacts vs All Outputs (xlsx hidden from Artifacts).  
5. **User never opened Outputs** — still on Chat after handoff; list never inspected.  
6. **Stale list** — gallery refresh tied to mount / open-output events more than live polling on All Outputs.

---

## Failure-mode map (incident)

```
Ask Atlas turn
    │
    ├─ focusProjectId? ──no──► tool not in schema OR tool fails "No active project"
    │                              └─ model may still claim spreadsheet / Outputs   ← A/B
    │
    └─ yes + BUILD/DECIDE ──► generate_deliverable(xlsx)
                                  │
                                  ├─ ok ──► bytes + project_artifacts + card meta
                                  │            │
                                  │            ├─ Ask Atlas: card + download OK
                                  │            │     Open → axiom:open-output (no-op on home)  ← D/E
                                  │            │
                                  │            └─ “Open project” / handoff CTA
                                  │                  → seed continuation + full hydrate
                                  │                  → Chat, Outputs collapsed, no focus     ← D/E
                                  │
                                  └─ err ──► {ok:false} (model may still claim success)     ← A/B
```

---

## Requirements gap (audit conclusion)

| Requirement | Current state |
|-------------|----------------|
| Artifact must appear in Ask Atlas conversation first | Partially: card when tool succeeds; **no guarantee** tool runs; **no** inline spreadsheet; prose can lie |
| Global/Workspace storage is additional, not substitute | Library dual-write exists; prompt steers model to say “it’s in Outputs” as primary story — **risk of substitute framing** |
| Link to Workspace output opens actual output / destination state | **Fails** for Ask Atlas → project handoff: generic continuation hydration, Outputs collapsed, no artifact focus |

---

## Open questions (need runtime evidence for the specific spreadsheet turn)

1. Did `generate_deliverable` execute? Tool name + args in server logs.  
2. WhisperGate `meta.intent` — was the turn CHAT (tools off)?  
3. `focusProjectId` at call time — null/0?  
4. Tool result `ok` and `error` string if false.  
5. Artifact `projectId` vs project the user opened.  
6. Was Workspace mounted when `artifact_created` / card Open fired?  
7. Did the user look at **All Outputs** or **Artifacts**?  
8. Does `project_artifacts.metadata.objectPath` exist; does download 404?  
9. Did message metadata persist `generatedArtifacts`?  
10. Classifier inputs on the row (type/extension)?

---

## Related docs

| Doc | Note |
|-----|------|
| `.agents/memory/ask-atlas-workspace-surface-contract.md` | Ask Atlas may generate lightweight deliverables; no build side effects |
| `.agents/memory/deliverable-capability-denial.md` | Model denies capability without prompt assertion |
| `.agents/memory/deliverable-reachability-gaps.md` | **Stale** on exposed types |
| `.agents/memory/phantom-work-pattern.md` | CHAT + no tools → promised action, no result |
| `.agents/memory/artifact-engine-architecture.md` | Engine owns storage/persistence |
| `docs/handoffs/2026-07-09-deliverable-generation-visibility-backend.md` | Original Outputs visibility requirements |

---

## Recommended / in-progress fix order

1. ~~Tool availability on Ask Atlas (home list + WhisperGate)~~ — **done in `56eae70c`**.  
2. **Persistence when `projectId <= 0`** — idempotent per-user deliverable bucket (do not only delete the gate).  
3. **Open deep-link** — seed `atlas-open-output-*`, navigate with `source=open-output`, **no** `seedHandoffContinuation`; Workspace opens Outputs + focus.  
4. Deliverable vs handoff prompt conflict + suppress `PROJECT_READY` when `generatedArtifacts` non-empty.  
5. Prose honesty guard when claims succeed with empty `generatedArtifacts`.  
6. Clarify All Outputs vs Artifacts for file-backed types.

Then proceed to Milestone 2.2 (intelligence correctness).

---

## Phase constraints checklist

| Constraint | Status |
|------------|--------|
| Read-only audit initially | **Honored** at `95e6f309` |
| Trace A–E for spreadsheet offer | **Delivered** |
| Governing requirements recorded | **Delivered** |
| No debate on Ask Atlas existence | **Honored** |
| Stamp `56eae70c` as partial remediation | **Done** |
| Findings ready before fix work | **Accepted — fix wave started** |
