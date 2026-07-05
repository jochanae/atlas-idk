# Handoff: Structured Plan Output (Backend)

**Date:** 2026-07-05
**Repo:** `Axiom-Atlas` (Cloud Run)
**DB:** Supabase `osuasytymbzurjvklhde`
**Scope:** Backend only. Frontend renderer for the new artifact shape is a separate small FE task; this handoff defines the contract so FE can build against it without waiting.
**Depends on:** `2026-07-05-agent-loop-refactor-backend.md` (uses the same tool-calling loop). Ship after or alongside the agent loop; do not ship before.

---

## Why

Today Atlas "plans" by writing prose and the frontend parses it with regex/heuristics to render a plan artifact. That's why:
- plans render inconsistently (missing steps, wrong ordering, dropped rationale)
- Atlas sometimes says "here's the plan" with no artifact at all
- edits to a step require re-parsing the entire message
- there's no stable id per step, so progress state can't attach to steps

Fix: make the plan a first-class **tool call** with a Zod-validated shape. No more prose parsing. Frontend renders directly from the tool result payload.

---

## Non-negotiables

1. **Plans are emitted via a `propose_plan` tool call. Never parsed from prose.**
2. **Schema is small and constraint-free** per AI SDK guidance — no `.min()`/`.max()`/enums-from-runtime. Limits go in the prompt, clamped in code post-parse.
3. **Every step has a stable `id`** (server-issued UUID) so downstream events (`step_started`, `step_completed`, `step_failed`) can reference it.
4. **A plan is always tied to one assistant message** (`chat_messages.id`) and one project.
5. **Plans are versioned** — editing a plan creates a new version, never mutates the prior row. Frontend can diff.
6. **Backward compatible with existing plan artifact rendering during rollout.** Emit both the new structured payload AND the current prose-plan format behind a flag until FE switches.

---

## Data Model

New table `plan_artifacts`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `message_id` | uuid FK → chat_messages | one plan per assistant message (nullable if edited later out-of-band) |
| `project_id` | int FK → projects | |
| `user_id` | uuid FK → auth.users | |
| `version` | int | starts at 1; increments on `revise_plan` |
| `parent_id` | uuid FK → plan_artifacts.id | prior version, null for v1 |
| `title` | text | 1-line plan title |
| `intent` | text | one sentence: what committing this plan achieves |
| `steps` | jsonb | array of PlanStep (see below) |
| `open_questions` | jsonb | array of `{ id, text }` — nullable |
| `estimated_effort` | text | free-form: "small", "medium", "large" (validated in code) |
| `status` | text | `proposed` \| `committed` \| `superseded` \| `abandoned` |
| `created_at` | timestamptz | |
| `committed_at` | timestamptz | null until user commits |

**PlanStep shape (jsonb element):**

```ts
{
  id: string;                    // uuid, server-issued
  order: number;                 // 1..N
  title: string;                 // <= 80 chars, clamped in code
  detail: string;                // <= 400 chars, clamped in code
  layer: string;                 // free text: "frontend" | "backend" | "db" | "infra" | "docs" — validated in code, unknown coerced to "other"
  touches: string[];             // file paths or route names, optional
  depends_on: string[];          // other step ids
  verification: string | null;   // how Atlas will verify this step (typecheck, screenshot, test name)
  risk: string | null;           // one sentence risk callout
}
```

GRANTs + RLS:

```sql
GRANT SELECT, INSERT, UPDATE ON public.plan_artifacts TO authenticated;
GRANT ALL ON public.plan_artifacts TO service_role;

ALTER TABLE public.plan_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own plans" ON public.plan_artifacts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users update own plans" ON public.plan_artifacts
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Inserts are done by the service role from the agent loop, not the client.
```

---

## Tools (added to the Phase 1 catalog from the agent-loop handoff)

**`propose_plan({ title, intent, steps, open_questions?, estimated_effort })`**
- Description: "Emit a structured plan for the user to review before any build action. Use whenever the user's intent implies multiple coordinated changes."
- `execute`: writes a `plan_artifacts` row (v1), returns `{ planId, version }`.
- Emits SSE `event: plan_proposed` with the full payload.

**`revise_plan({ planId, steps, open_questions?, note })`**
- Description: "Revise an existing plan in response to user feedback. Creates a new version; do not use for tiny wording tweaks."
- `execute`: inserts a new row with `parent_id = planId`, `version = prior+1`, `status = proposed`. Old row → `status = superseded`.
- Emits SSE `event: plan_revised`.

**`commit_plan({ planId })`**
- `needsApproval: true` — the human must click Commit in the UI. The tool result is written when approval resolves.
- `execute` on approval: sets `status = committed`, `committed_at = now()`. Creates a corresponding **ledger entry** (`verb = "plan_committed"`, `am_field` populated from `intent`) using the existing `write_ledger_entry` tool internally — this is how plans feed the Decision Ledger per the North Star.
- Emits SSE `event: plan_committed`.

**Rule enforced in `composeAtlasPrompt`:**
> Before any `edit_file` / `line_patch` call that affects more than one file OR touches backend + frontend together, you MUST call `propose_plan` and wait for the user to commit it. Single-file cosmetic edits do not require a plan.

---

## Zod schema (server-side, keep it constraint-free)

```ts
// server/lib/agent-tools/schemas/plan.ts
import { z } from "zod";

export const PlanStepSchema = z.object({
  id: z.string(),                        // server assigns if missing
  order: z.number(),
  title: z.string(),
  detail: z.string(),
  layer: z.string(),
  touches: z.array(z.string()).optional().default([]),
  depends_on: z.array(z.string()).optional().default([]),
  verification: z.string().nullable().optional(),
  risk: z.string().nullable().optional(),
});

export const ProposePlanInput = z.object({
  title: z.string(),
  intent: z.string(),
  steps: z.array(PlanStepSchema),
  open_questions: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  estimated_effort: z.string(),          // clamped in code to small|medium|large|other
});
```

**Do NOT add `.min(1)`, `.max(80)`, `.enum([...])`, or `format:` to any of the above.** Enforce limits with post-parse clamping helpers and state the caps in the prompt. This avoids the Gemini "too many states" rejection and post-hoc `AI_NoObjectGeneratedError` crashes documented in `ai-sdk-agent-patterns`.

Wrap the tool `execute` in the `NoObjectGeneratedError.isInstance(error)` guard and fall back to parsing `error.text` so a malformed plan degrades to raw JSON in the artifact instead of crashing the run.

---

## SSE Additions (additive, backward compatible)

```
event: plan_proposed
data: { "planId":"...", "version":1, "title":"...", "intent":"...", "steps":[...], "open_questions":[...], "estimated_effort":"..." }

event: plan_revised
data: { "planId":"...", "version":2, "parentId":"...", "note":"..." }

event: plan_committed
data: { "planId":"...", "committedAt":"..." }
```

Frontend today ignores unknown events, so shipping these before the FE renderer is safe. Keep the current prose-plan emission active behind `USE_STRUCTURED_PLAN` env flag so both formats stream until FE cuts over.

---

## Prompt Additions (composeAtlasPrompt → roleSpecific.planning)

```
Planning discipline:
- Multi-file or cross-layer work REQUIRES propose_plan before any write tool.
- Step titles must be actionable ("Add /agent_runs table", not "database work").
- Each step should name what would prove it done in the `verification` field.
- Never describe the plan in prose after calling propose_plan — the artifact IS the plan.
- After user commits (commit_plan approved), execute steps in order. Skip a step only by revising the plan.
- Limits: step title ≤ 80 chars, detail ≤ 400 chars, ≤ 12 steps. Split into multiple plans if larger.
```

---

## Loop Interaction

- Agent loop treats `commit_plan` as a soft barrier: after `propose_plan`, the model may only call read tools until it observes a `commit_plan` approval result in the tool stream. This is enforced by `stopWhen` custom predicate wrapping `stepCountIs(50)`:

```ts
stopWhen: (state) =>
  stepCountIs(50)(state) ||
  (state.lastToolCall?.name === "propose_plan" && !state.hasApprovedCommitPlan)
```

The loop resumes when the client sends `plan_committed` back (same channel as any `needsApproval` resolution — reuse the existing approval transport from the agent-loop handoff).

---

## Rollout

1. Flag `USE_STRUCTURED_PLAN` (default off). When off, current prose-plan path unchanged.
2. Ship backend: table, tools, SSE events, prompt additions.
3. Turn on for allowlisted user. Frontend still renders old artifact; new events are recorded but not shown.
4. FE handoff (separate): replace prose parser with subscription to `plan_proposed` / `plan_revised` / `plan_committed`.
5. Turn on globally, remove prose-plan emission after 1 week of clean telemetry.

---

## Explicit Non-Goals

- No plan-diff UI (FE concern, separate).
- No auto-execution of committed plans without per-step confirmation — steps still route through existing write tools with their own approval gates.
- No plan templates / reusable plans (later).
- No cross-project plans.

---

## Files Touched (expected)

- `server/lib/agent-tools/propose-plan.ts`, `revise-plan.ts`, `commit-plan.ts`
- `server/lib/agent-tools/schemas/plan.ts`
- `server/lib/agent-tools/index.ts` — register in catalog
- `server/lib/atlas-core.ts` — planning discipline section
- `server/routes/chat.ts` — `stopWhen` predicate wrapping, SSE emitters
- `lib/db/src/schema/plan_artifacts.ts`
- `lib/db/drizzle/000X_plan_artifacts.sql` — raw SQL migration (per `drizzle-kit-tty` memory)

---

## Definition of Done

- [ ] `plan_artifacts` table live, RLS + GRANTs verified
- [ ] `propose_plan` / `revise_plan` / `commit_plan` tools registered and callable
- [ ] Multi-file request produces exactly one `plan_proposed` SSE event with valid payload
- [ ] `commit_plan` approval writes both the plan row (`status=committed`) and a ledger entry (`verb=plan_committed`)
- [ ] Revising a plan produces v2 with `parent_id` set and v1 marked `superseded`
- [ ] Malformed model output falls through the `NoObjectGeneratedError` guard without crashing the run
- [ ] `USE_STRUCTURED_PLAN=false` path unchanged (prose plan still renders)
