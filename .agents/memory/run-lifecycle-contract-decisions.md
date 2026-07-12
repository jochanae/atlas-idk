---
name: Run Lifecycle Contract
description: Key architectural decisions from the V1.2 run lifecycle contract; invariants both teams must preserve
---

## Invariant 1: One system, not two

Messages and runs share one canonical `runId` but are separate durable records.
The chat renderer reads from `ConversationMessage` records, not from `Run` objects.
A `ConversationMessage` links to its run via `runId`.

Do not allow a "messages system for CHAT" and a "runs system for BUILD" to re-emerge.
That split is where state fragmentation started.

**Why:** Every prior rebuild attempt recreated two competing state systems when CHAT and DECIDE were excluded from the run model. Any divergence here restarts the fragmentation.

**How to apply:** Every turn — CHAT, DECIDE, BUILD — gets a Run record. The Run.intent field distinguishes them. CHAT/DECIDE runs are lightweight (no execution card, no BUILD restriction).

---

## Invariant 2: activeBuildRun ≠ activeTurn

`RunContextValue` has two separate fields:
- `activeBuildRun: Run | null` — the non-terminal BUILD run; drives execution card, Changes, Terminal, Outputs
- `activeTurn: Run | null` — the current CHAT/DECIDE turn; drives thinking indicator only

Both may be non-null simultaneously (CHAT can stream while BUILD awaits confirmation).
`activeBuildRun` is never replaced by a CHAT or DECIDE turn.

**Why:** If a single `currentRun` field holds either type, a streaming CHAT response can overwrite the BUILD card state and cause the live card to disappear.

---

## Invariant 3: commit_update fires post-terminal

`run.commit` can change after `run.status` reaches a terminal state.
The SSE event `commit_update` (payload: `{ commit: RunCommit }`) handles this.
Surfaces showing the Commit button must subscribe to this event.
Never poll `run.commit` state independently.

---

## Types package

`lib/run-contract/src/index.ts` — 528 lines, zero typecheck errors.
Importable as `@workspace/run-contract`.
Version matches the contract document (currently 1.2.0).

Source of truth hierarchy:
1. `docs/RUN_LIFECYCLE_CONTRACT.md` — human authority
2. `lib/run-contract/src/index.ts` — executable types
3. Mock fixtures / backend payloads

To change a type: update the document first, bump the version, then update the types file.

---

## Lovable handoff rule

Lovable builds against the types package, not the prose document.
Production SSE wiring waits for Replit Phase 2 confirmation.
Lovable must not attempt to interpret existing `/api/nexus/chat` SSE tokens.

---

## Contract document

`docs/RUN_LIFECYCLE_CONTRACT.md` — frozen at V1.2, 607 lines, 15 sections + version history.
