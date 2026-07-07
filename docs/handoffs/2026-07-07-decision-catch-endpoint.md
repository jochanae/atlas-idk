# Handoff — Decision Catch Detection Endpoint

**Date:** 2026-07-07
**Repo:** `Axiom-Atlas` (Cloud Run)
**Frontend PR (already landed):** DecisionCatchCard + `catchPayload` message field
**Owner (backend):** Cursor / Replit

---

## Context

The MVP spine (mem://features/positioning) requires a **Decision Catch**
interrupt: when the user (or Atlas) signals a forward-looking BUILD/DECIDE
intent that semantically overlaps a committed Decision Ledger entry, we surface
a "Before you do —" card with three named checks (Alignment / Conflict /
Pattern) and two buttons (Adjust / Proceed anyway).

Frontend is done. The card renders whenever an assistant message arrives with
a `catchPayload` field. **The backend does not currently populate it.** This
handoff describes what to build.

Existing scaffolding already in place:
- `entries` table has `deviationReason` (text) and `catchAgainstId` (fk → entries.id) columns — see `api-server/src/routes/entries.ts` POST body schema.
- WhisperGate already classifies intent (THINK / BUILD / DECIDE) in `artifacts/api-server/src/lib/whisper-gate.ts`.
- `nexus.ts:515` currently instructs the LLM to say "This conflicts with a committed decision" inline — that prose instruction should stay, but is not a substitute for a structured card.

---

## Contract — what the frontend expects

The assistant message payload returned by `POST /api/chat` (and by
`nexus.ts` for cross-project turns) may include an optional field:

```ts
catchPayload?: {
  v: 1;
  intent: string;                 // "we're switching to Postgres for auth"
  checks: Array<{
    kind: "alignment" | "conflict" | "pattern";
    entryId?: number;             // ledger entry this check references
    entryTitle?: string;
    note: string;                 // one-line explanation
  }>;
  primaryConflictEntryId?: number; // used as catchAgainstId on Proceed anyway
  deviationTitle?: string;         // suggested title for the deviation entry
};
```

TypeScript source of truth: `artifacts/atlas-frontend/src/lib/DecisionCatchTypes.ts`.

When present, the frontend renders `DecisionCatchCard`. On **Proceed anyway**
it POSTs to `/api/projects/:id/entries` with:

```json
{
  "title": "<deviationTitle or fallback>",
  "summary": "<intent>",
  "status": "committed",
  "severity": "neutral",
  "verb": "override",
  "mode": "decide",
  "deviationReason": "<optional user text>",
  "catchAgainstId": <primaryConflictEntryId>,
  "sessionId": <sid>,
  "sourceMessageId": <msg id>,
  "cardSchemaVersion": 1
}
```

No new entries route required — existing POST already accepts those fields.

---

## What to build (backend)

### 1. Detection module: `artifacts/api-server/src/lib/decisionCatch.ts`

Exports:

```ts
export async function detectDecisionCatch(input: {
  projectId: number;
  userId: number;
  userText: string;
  assistantText: string;
  intent: "think" | "build" | "decide";  // from whisper-gate
  confidence: number;                    // 0..1
}): Promise<CatchPayload | null>;
```

Trigger conditions (all must be true):
- `intent === "build" || intent === "decide"`
- `confidence >= 0.6`
- At least one committed ledger entry has semantic overlap with `userText + assistantText` above a threshold

Detection strategy:
1. Fetch all `entriesTable` rows for `projectId` where `status = 'committed'`.
2. Compute embedding for the concatenated turn text (`userText + "\n" + assistantText`) via the existing `embeddings.ts` helper.
3. Cosine-similarity against the pre-indexed entry embeddings (`entity_type = 'entry'`).
4. For each committed entry with similarity ≥ 0.72, classify:
   - **conflict** — turn text contains negation / replacement verbs relative to entry (`switch`, `instead`, `replace`, `drop`, `move away from`, `use X now`). Cheap heuristic OK for v1.
   - **alignment** — high similarity, no negation.
   - **pattern** — for entries with `verb = 'override'` or `deviation = true`, add a "you've overridden this kind of decision before" check regardless.
5. Return `null` if no conflict checks fire. Alignment-only turns should **not** produce a catch card (would be noise); log them internally but don't surface.
6. If ≥1 conflict, build the payload:
   - `intent` = one-sentence summary of what user is about to do (reuse assistant's own restatement if present, else first sentence of `userText`).
   - `checks` = ordered: conflicts first, then patterns, then alignments (max 3 total).
   - `primaryConflictEntryId` = highest-similarity conflict entry.
   - `deviationTitle` = `"Overrode: <conflict entry title>"` truncated to 140 chars.

### 2. Wire into `chat.ts` and `nexus.ts`

In `artifacts/api-server/src/routes/chat.ts`, after the LLM response is finalized and **after** WhisperGate + Output Guard have run, call `detectDecisionCatch(...)` and attach the result to the response payload as `catchPayload` (same JSON shape sent alongside `alertPayload` today — grep for `alertPayload` in `chat.ts` for the exact emission point).

In `artifacts/api-server/src/routes/nexus.ts`, do the same inside the branch that emits an assistant message (not the `mode === "conversation"` early return added last session).

### 3. Suppression rules

Do **not** emit a catch when:
- The message is a summary/observation (WhisperGate output_guard already handles the summary-suppressor list; reuse the same signal).
- The turn already contains a `CommitCardPayload` (avoid stacking two cards on one message — commit takes priority).
- `catchAgainstId` would point at an entry created in the same session (avoid catching against something the user just committed).

### 4. Metrics / logs

Log every detection attempt with: `projectId`, `intent`, `confidence`, `topEntryId`, `topSimilarity`, `emitted: bool`, `suppressReason?`. Same logger as WhisperGate.

---

## Test cases

1. **Fresh project, no committed entries** → no catch, no error.
2. **Committed entry: "Use Supabase Postgres"** + user says "let's move to Neon" → catch emitted, `primaryConflictEntryId` = that entry, conflict note mentions the switch.
3. **Committed entry: "Ship mobile-first"** + user says "let's polish the mobile view" → alignment only, no card.
4. **User has previously used Proceed anyway on entry X** + new turn touches entry X → catch payload includes a pattern check referencing the prior deviation.
5. **Assistant self-corrects mid-turn** (`intent = "think"`) → no catch even if overlap is high.

## Ordering / lane

Frontend done, safe to merge independently — until backend ships, `catchPayload` is always undefined and the card never renders.

No DB migration required. No new routes required.
