# Handoff — Tier 1 conversational fill (backend)

**Date:** 2026-07-05
**Repo:** `Axiom-Atlas` (Cloud Run)
**Consumer:** `artifacts/atlas-frontend` — already wired.
**Goal:** Let Atlas gather Tier 1 answers naturally in chat when the user skipped the intake sheet (or when fields are still empty), instead of forcing the stepper.

Frontend is already:
- Auto-opening `Tier1IntakeSheet` when Tier 1 is missing
- Persisting a Skip (`localStorage["atlas-tier1-skipped-<id>"]`) so the sheet never auto-reopens
- Reading via `GET /api/memory/tier1/:projectId`

Everything below is server-side.

---

## 1. Inject Tier 1 status into the atlas-chat system prompt

In whatever composes the system prompt for the atlas-chat route (should be `composeAtlasPrompt` in `_shared/atlas-core.ts` or the equivalent server module), load Tier 1 for the active project on every turn and inject a compact status block.

Pseudocode:

```ts
const tier1 = await db.query.projectTier1MemoryTable.findFirst({
  where: eq(projectTier1MemoryTable.projectId, projectId),
});

const fields = [
  ["building",       "What are you building?"],
  ["audience",       "Who is it for?"],
  ["problem",        "What problem does it solve?"],
  ["outOfScope",     "What's explicitly out of scope?"],
  ["successSignal",  "How will you know it's working?"],
  ["constraints",    "What constraints are you working within?"],
] as const;

const missing = fields.filter(([k]) => !tier1 || !tier1[k]?.trim());
const filled  = fields.filter(([k]) =>  tier1 &&  tier1[k]?.trim());

const tier1Block = `
<tier1_status>
${missing.length === 0
  ? "COMPLETE. Do not re-ask Tier 1 questions."
  : `INCOMPLETE (${missing.length}/6 missing).
Filled: ${filled.map(([k]) => k).join(", ") || "none"}.
Missing: ${missing.map(([k]) => k).join(", ")}.

Rule: when the conversation naturally surfaces one of the missing fields,
capture the answer with the tier1_upsert_field tool. Never interrogate —
ask at most ONE Tier 1 question per turn, only when it fits the flow, and
only if the user hasn't already implicitly answered it. Do not mention
"Tier 1" by name. If the user says something like "I already told you" or
"stop asking", stop and call tier1_mark_skipped.`}
</tier1_status>`;
```

Concatenate `tier1Block` into the system prompt (the "voice/discipline" block from atlas-core comes first, this comes after project context).

---

## 2. New tool: `tier1_upsert_field`

Registered on the atlas-chat agent loop (same registry as existing tools like ledger writes / forge nodes).

**Tool definition (OpenAI / Responses API shape):**

```json
{
  "type": "function",
  "name": "tier1_upsert_field",
  "description": "Save one Tier 1 project memory field. Use when the user has clearly answered one of the six foundational questions in conversation. Never guess — only call with the user's actual words (lightly cleaned).",
  "parameters": {
    "type": "object",
    "properties": {
      "field": {
        "type": "string",
        "enum": ["building", "audience", "problem", "outOfScope", "successSignal", "constraints"]
      },
      "value": { "type": "string", "minLength": 2, "maxLength": 2000 },
      "confidence": {
        "type": "string",
        "enum": ["explicit", "inferred"],
        "description": "explicit = user stated it directly; inferred = you paraphrased from context"
      }
    },
    "required": ["field", "value", "confidence"]
  }
}
```

**Handler behavior:**

1. Verify the active `projectId` from the chat session belongs to `authUser.id` (reuse `assertProjectOwner`).
2. Reject `confidence === "inferred"` unless the user has confirmed the paraphrase in the immediately prior turn — if in doubt, return an error string like `"needs_confirmation"` back to the model so it asks the user before persisting.
3. Upsert into `project_tier1_memory`:
   - If no row exists → INSERT with just that field (other columns default to `""`).
   - If a row exists → UPDATE only the specified column.
   - Same append-Ledger side effect as the existing `POST /memory/tier1` route (`type=Decision, title="Tier 1 memory set"` — or `"Tier 1 field updated: <field>"` for finer trail).
4. Return `{ ok: true, field, remaining: string[] }` so the model knows what's still missing.

Reuse `answersToColumns` and `appendTier1LedgerEntry` from `routes/memory.ts` — move them into a shared `services/tier1.ts` module so both the REST route and the tool handler share one code path. Do NOT duplicate the write logic.

---

## 3. New tool: `tier1_mark_skipped`

```json
{
  "type": "function",
  "name": "tier1_mark_skipped",
  "description": "Call ONLY when the user has clearly told you to stop asking Tier 1 questions (e.g. 'skip', 'stop asking that', 'I don't want to answer'). Prevents Atlas from asking again this project.",
  "parameters": { "type": "object", "properties": {}, "required": [] }
}
```

**Handler:**
- Upsert a new column `tier1_skipped_at TIMESTAMPTZ` on `project_tier1_memory` (nullable). Add via migration.
- When present, the system-prompt composer treats all missing fields as "do not ask" — Atlas only gathers a field if the user volunteers it unprompted.

Migration snippet:

```sql
ALTER TABLE project_tier1_memory
  ADD COLUMN tier1_skipped_at TIMESTAMPTZ NULL;
```

Also: if no `project_tier1_memory` row exists yet when this tool fires, INSERT an otherwise-empty row with `tier1_skipped_at = now()`.

---

## 4. Extend the REST serializer (small FE contract change)

`serializeTier1Memory` (in `lib/db/src/schema/project_tier1_memory.ts`) should also return:

```ts
{
  answers: { ... },
  updatedAt: "...",
  skippedAt: row.tier1_skipped_at?.toISOString() ?? null,
  missing: string[]   // list of empty field keys
}
```

Frontend will use `missing` to render the progress card you described (the six chips filling in as Atlas discovers them) and `skippedAt` to reflect the user's choice back into the UI.

---

## 5. Guardrails for the model

Add to the atlas-core voice rules (or the tier1 block itself):

- Never batch-ask multiple Tier 1 questions in one turn.
- Never prefix answers with "Let me ask a quick onboarding question" — that violates rule "structure is earned, not imposed".
- If the user pushes back on a question, call `tier1_mark_skipped` immediately and continue the actual conversation.
- Tier 1 gathering is opportunistic, not the goal of any turn.

---

## 6. Acceptance

- `GET /api/memory/tier1/:projectId` returns the new `skippedAt` + `missing` fields (existing shape preserved).
- New tool calls appear in agent-run traces and successfully upsert single fields.
- With Tier 1 empty, chatting "I'm building a decision-led builder for solo founders" should result in Atlas naturally acknowledging + a `tier1_upsert_field` call for `building` (and likely `audience`) — verify in edge function logs.
- Saying "stop asking me setup questions" triggers `tier1_mark_skipped`; subsequent turns must not ask Tier 1 questions.
- Ledger has one entry per field write (or one per commit — your call, but pick one and document).

---

## Files likely touched

- `supabase/functions/_shared/atlas-core.ts` (or Cloud Run equivalent) — system prompt composition
- `services/tier1.ts` (new) — shared upsert + ledger append
- `routes/memory.ts` — refactor to import from `services/tier1.ts`
- Agent loop tool registry — register the two new tools
- New Drizzle migration — `tier1_skipped_at` column
- `lib/db/src/schema/project_tier1_memory.ts` — serializer update
