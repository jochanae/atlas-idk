# Handoff: Bridge Builder Capabilities into `/api/nexus/chat`

**Date:** 2026-07-08
**Repo:** `Axiom-Atlas` (Cloud Run backend) — NOT Lovable frontend
**Route to modify:** `artifacts/api-server/src/routes/nexus.ts`
**Reference:** `artifacts/api-server/src/routes/chat.ts` (source of truth for emitters)
**Related:** `CAPABILITY_MATRIX.md` §1b, Route split preamble

---

## Problem (one sentence)

WhisperGate classifies `BUILD` intent inside a workspace turn, but `/api/nexus/chat` has no `FILE_EDIT`, `GITHUB_PUSH`, `MEMORY_CHIPS`, or `linePatches` emitters — so Atlas silently degrades to prose when a user asks it to build, push, or reference memory. Builder capabilities only work via the home-page build-intent handoff (`workspace.tsx:5466`), never from a live workspace conversation.

## Goal

A workspace turn classified `BUILD` should produce the same shipped-quality output as a home-page build-intent handoff — file edits, GitHub pushes, memory chips, diff patches — without leaving `/api/nexus/chat`.

## Decision required from user before implementation

**Option A — Port emitters into nexus (recommended).**
Copy the four token protocols (`FILE_EDIT_START/END`, `GITHUB_PUSH`, `MEMORY_CHIPS`, `linePatches`) and their agentic tool loop from `chat.ts` into `nexus.ts`, gated by `intent === "BUILD"` from WhisperGate. One route, one prompt assembly, one done-event schema.

- Pro: workspace surface stays on one route; single vocabulary; no cross-route state.
- Con: `nexus.ts` grows; some duplication with `chat.ts` until `chat.ts` is retired.

**Option B — Route BUILD turns from nexus → chat mid-conversation.**
When WhisperGate returns `BUILD`, `nexus.ts` proxies (or the frontend re-POSTs) to `/api/chat` with the same conversation context, then merges the stream back into the workspace UI.

- Pro: no duplication; `chat.ts` stays authoritative for build tokens.
- Con: two routes, two prompt assemblies, cross-route session/state sync, harder to reason about. Higher regression risk.

**Recommend Option A.** Below assumes Option A.

---

## Scope (Option A)

### Emitters to port from `chat.ts` → `nexus.ts`

| Token | chat.ts references | Purpose | Frontend consumer |
|---|---|---|---|
| `FILE_EDIT_START` / `FILE_EDIT_END` | 86 | Full-file writes | `useChatStream`, LiveGenerationCard |
| `linePatches` (on `done` event) | 34 | Targeted line edits | DiffViewer |
| `GITHUB_PUSH` | 21 | Git Tree API push → Ledger release entry | Ledger + release toast |
| `MEMORY_CHIPS` | 2 (marker) / 6 (payload) | Relevant memory surfacing | MemoryChips above assistant bubble |
| Agentic tool loop | — | Multi-step build execution | Streaming status updates |

### Prompt assembly changes

- Add a `BUILD`-branch system prompt segment to `atlasIdentity.ts` (or wherever nexus assembles its prompt) that mirrors chat.ts's builder instructions, including the four token protocols.
- Keep `CLARIFY`, `NEXT_SUGGESTIONS`, and `catchPayload` intact — they must still fire on BUILD turns when relevant (Decision Catch on a build intent is the point).

### Emission gating

- `FILE_EDIT`, `GITHUB_PUSH`, `linePatches`: only when `intent === "BUILD"`.
- `MEMORY_CHIPS`: emit on all intents (currently missing from nexus entirely — this is a P0 gap independent of BUILD).

### Done-event schema additions

Extend the `done` event payload in `nexus.ts`:

```ts
{
  // existing
  catchPayload?: DecisionCatchPayload,
  clarify?: ClarifyPayload,
  nextSuggestions?: string[],
  // new (port from chat.ts)
  memoryChips?: MemoryChip[],
  linePatches?: LinePatch[],
  githubPush?: { commitSha: string; ledgerEntryId: string } | null,
  fileEdits?: FileEditSummary[],
}
```

Match the exact field names `chat.ts` already emits so the frontend needs zero changes to consume them from nexus.

### Output Guard (separate but blocking)

Per `CAPABILITY_MATRIX.md`, Output Guard is not visible in `nexus.ts`. Before porting builder emitters, confirm guard status. If guard runs only on `/api/chat`, port it to nexus in the same PR. Shipping FILE_EDIT without guard validation is a regression risk.

---

## Frontend implications (Lovable side)

Should be **zero code changes** if the done-event field names match `chat.ts` exactly. `useChatStream` already handles `memoryChips`, `linePatches`, `FILE_EDIT` blocks, and `GITHUB_PUSH` from the `/api/chat` transport path. Once nexus emits the same schema, the workspace surface consumes them without a diff.

Verification checklist post-deploy:
- [ ] Workspace turn: "write a hello-world component" → LiveGenerationCard renders, file lands in sandbox.
- [ ] Workspace turn: "push this to GitHub" → commit lands, Ledger release entry appears.
- [ ] Workspace turn on a topic with prior committed intent → MemoryChips appear above assistant bubble.
- [ ] Workspace turn on a code edit → DiffViewer renders linePatches.
- [ ] Decision Catch still fires on BUILD intents with semantic overlap to a committed entry.
- [ ] Clarification cards + suggestion pills still fire per current discipline.

---

## Testing plan (Cursor side)

1. **Unit:** each new emitter tested against a golden model output containing the token.
2. **Integration:** curl `/api/nexus/chat` with a BUILD-classified prompt; assert all four field names appear on the `done` event.
3. **Regression:** curl with CHAT and DECIDE prompts; assert `fileEdits`/`githubPush` do NOT appear, `memoryChips` still does.
4. **End-to-end (in Lovable preview):** run the verification checklist above.

---

## Non-goals

- Retiring `chat.ts` (do that later, only after nexus proves stable at parity).
- Changing the home-page build-intent handoff routing (still valid, still uses `/api/chat`).
- Bridging Option B — reject unless Option A proves untenable.

---

## Priority

**P0.** Until this ships, the `CAPABILITY_MATRIX.md` "Atlas as builder" claim is only true from the home handoff, and the workspace's active surface is a thinking partner with a disconnected builder. The matrix's #1 leverage move.

## Next exact step for you (user)

Paste this file into the `Axiom-Atlas` repo in Cursor. Choose Option A vs B. If A, implement the emitter ports in `nexus.ts` and confirm Output Guard is either present or ported in the same PR. Redeploy Cloud Run. Then run the verification checklist in the Lovable preview.
