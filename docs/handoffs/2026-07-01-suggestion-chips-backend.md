# Handoff: Backend-Driven Suggestion Chips

**Repo:** `Axiom-Atlas` (Cloud Run) · **Date:** 2026-07-01
**Frontend counterpart:** `artifacts/atlas-frontend/src/components/workspace/SuggestionChipRail.tsx`

## Why

`SuggestionChipRail` already renders under the last assistant message and supports tap (inject into composer) and long-press (park). Today it **regex-scrapes** bullets out of the assistant's markdown ("Next steps:" sections, trailing bullet runs). Result:

- Chips appear whenever the model happens to write a bullet list, even mid-explanation.
- Chips are missing when the model writes prose that clearly begs a decision ("I'm torn between A and B").
- The model has no way to say "kind = compare" vs "kind = decide" vs "kind = chips".

Goal: let the model decide **when** to emit chips, **what kind**, and **what the options are** — and stop scraping.

## Contract change

### Route
`POST /api/atlas/chat` (whichever atlas-chat streaming route the frontend hits — confirm and adjust).

### Response addition
Add an optional `suggestions` object to the final assistant message payload (either as a trailing SSE event `event: suggestions` before `done`, or as a field on the persisted `chat_messages` row read back by the frontend — pick whichever fits the existing stream shape and document it here).

```ts
type Suggestions = {
  kind: "chips" | "compare" | "decide";
  // For "chips": tappable next-turn prompts. 2–4 items. Each ≤ 64 chars.
  // For "compare": exactly 2 options; frontend renders side-by-side card.
  // For "decide": 2–3 options; frontend renders a commit prompt.
  options: Array<{
    label: string;      // shown on the chip/card
    prompt?: string;    // what to send as the next user turn if tapped
                        // (defaults to label when omitted)
    hint?: string;      // optional subtitle for compare/decide cards
  }>;
} | null;
```

Persist on `chat_messages.suggestions jsonb null` (new column) so reloads restore chips without recomputing.

### When to emit (prompt / output-guard rules)

Emit `suggestions` **only** when at least one is true:
1. User expressed ambiguity: "not sure", "torn", "don't know", "which", "either/or".
2. Assistant response ends by offering multiple viable directions.
3. Intent classifier (WhisperGate) returned THINK with confidence < 0.7 AND response length > 400 chars.
4. Assistant proposed a decision that has ≥2 clear alternatives (→ `kind: "compare"` or `"decide"`).

Do **not** emit when:
- Intent = BUILD and there's no Decision Catch conflict (just build).
- Assistant asked a single clarifying question (the question IS the prompt).
- Response is a direct factual answer.
- Follow-up within the same tight thread where chips were emitted in the prior turn (avoid chip spam).

Add these rules to `_shared/atlas-core.ts` voice rules and enforce in `output-guard.ts` — the guard should also **strip** any trailing "Next steps:" bullet blocks from the message body when `suggestions` is emitted, so the frontend doesn't double-render.

### Backward compat
- `suggestions: null` or missing → frontend falls back to current heuristic scrape. Safe to ship gradually.
- Once >90% of eligible turns emit `suggestions`, delete `extractSuggestions()` on the frontend.

## Files likely touched (backend)
- `supabase/functions/atlas-chat/index.ts` (or the Cloud Run equivalent) — add suggestions to response.
- `_shared/atlas-core.ts` — extend system prompt with emission rules + JSON shape.
- `_shared/output-guard.ts` — validate `suggestions` shape, strip duplicated bullets from body.
- Migration: `alter table chat_messages add column suggestions jsonb`.
- Handoff back with the migration SQL — I run it, not you.

## Frontend follow-up (my lane, after backend ships)
1. Read `message.suggestions` on `AssistantBubble`; pass to `SuggestionChipRail` as an override.
2. If `kind === "compare"` or `"decide"`, render a card (new small component) instead of the chip rail.
3. Delete `extractSuggestions()` once backend coverage is proven.
4. Keep long-press-to-park behavior — it works for all three kinds.

## Acceptance
- Ask Atlas "I'm torn between shipping the map or the ledger first" → response ends with 2–3 chips or a compare card, no scraped bullets.
- Ask Atlas "add a dark mode toggle" (BUILD, no conflict) → no chips.
- Reload the thread → chips still there (persisted).
