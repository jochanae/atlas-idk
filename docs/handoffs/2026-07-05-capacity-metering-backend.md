# Handoff: Capacity Metering Backend

**Date:** 2026-07-05
**Repo:** `Axiom-Atlas` (Cloud Run)
**DB:** Supabase `osuasytymbzurjvklhde`
**Scope:** Backend only. Frontend ships against mocked responses in parallel; no execution gating enforced until these endpoints are live.

---

## Philosophy (non-negotiable)

1. **Thinking never meters.** Chat, plan, decide, ledger, memory, flow map, decision catch — always free, always unlimited on paid plans.
2. **Only AI execution meters.** Forge codegen runs, sketch generation, image edits, agent execution.
3. **Not metered:** GitHub push, save, thumbnail regen, sketch cancel, small maintenance.
4. **A credit is not a fixed unit.** It represents execution effort. The estimator is the source of truth. Never hardcode "1 credit = 1 Forge run."
5. **Zero remaining pauses execution only.** Chat/plan/decide continue.

---

## Data Model

New table `capacity_pools`:

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK, FK → auth.users | one row per user (or per workspace for Teams — Phase 2) |
| `tier` | text | `explorer` \| `pro` \| `studio` \| `teams` |
| `monthly_allotment` | int | e.g. 150 for Pro |
| `daily_allotment` | int | e.g. 5 for Pro |
| `used_this_period` | int | monthly counter |
| `used_today` | int | daily counter |
| `topup_balance` | int | purchased packs; drained after monthly |
| `period_start` | timestamptz | |
| `period_end` | timestamptz | |
| `day_start` | timestamptz | |
| `updated_at` | timestamptz | trigger |

Standard RLS: user reads/writes own row via `auth.uid()`. Service role full access for consume writes from Forge runner.

**GRANTs required** — public schema tables get no default grants:
```sql
GRANT SELECT ON public.capacity_pools TO authenticated;
GRANT ALL ON public.capacity_pools TO service_role;
```

Ledger integration: every consume also inserts an `entries` row with `verb: 'capacity_consumed'`, `severity: 'info'`, `summary: 'Executed · <kind> · <N> credits'`, `details: { estimate, actual, filesTouched, componentsAdded, model }`. This preserves the "every action flows through the Ledger" rule.

---

## Endpoints

### `GET /api/capacity`
Auth: Bearer.
Returns current pool state.

```json
{
  "tier": "pro",
  "remaining": 128,
  "total": 150,
  "usedThisPeriod": 22,
  "topupBalance": 0,
  "dailyRemaining": 4,
  "dailyTotal": 5,
  "periodStart": "2026-07-01T00:00:00Z",
  "periodEnd": "2026-08-01T00:00:00Z",
  "resetsAt": "2026-08-01T00:00:00Z"
}
```

### `POST /api/capacity/estimate`
Called before any execution to preview cost. Idempotent, side-effect-free.

Body:
```json
{
  "kind": "forge_codegen" | "sketch_generation" | "image_edit" | "agent_execution",
  "payload": { "prompt": "...", "context": {...} }
}
```

Response:
```json
{
  "credits": 3,
  "confidence": "high" | "medium" | "low",
  "breakdown": {
    "estimatedTokens": 45000,
    "estimatedFilesTouched": 18,
    "estimatedComponentsAdded": 2,
    "model": "claude-sonnet-4"
  },
  "translation": "Modifies ~18 files, generates 2 new components",
  "sufficient": true,
  "wouldRemainAfter": 125
}
```

Effort model (v1):
```
credits = ceil(
  (estimatedTokens / 15000)
  + (estimatedFilesTouched / 20)
  + (modelTierMultiplier)   // sonnet=1, opus=2
)
```
Tune later. This is a heuristic — do not expose the formula to users.

### `POST /api/capacity/consume`
Called by Forge runner **after** execution completes, with actual measured cost.

Body:
```json
{
  "kind": "forge_codegen",
  "estimateId": "est_...",
  "actualCredits": 3,
  "actualTokens": 47230,
  "filesTouched": 19,
  "componentsAdded": 2,
  "runId": "run_...",
  "ledgerEntryId": "entry_..."
}
```

Response: fresh capacity snapshot (same shape as `GET /api/capacity`).

Decrement order: `used_today` and `used_this_period` first; overflow drains `topup_balance`. If pool would go negative → return `402 Payment Required` with current state (but by then the work is done; log as `debt` and surface a "we covered this one for you" toast — do NOT retroactively block).

### `POST /api/capacity/topup` (Phase 2)
Stripe wiring — out of scope for this handoff. Placeholder stub returning 501 is fine.

---

## Tier Defaults (working values — not final)

| Tier | Monthly | Daily |
|---|---|---|
| explorer | 30 | 5 |
| pro | 150 | 5 |
| studio | 600 | — |
| teams | shared pool | — |

Seed via a small `bootstrap_capacity_pool(user_id, tier)` server function called on signup and on tier change.

---

## Reset Logic

Cron / edge-triggered:
- Daily 00:00 UTC → reset `used_today = 0`, `day_start = now()`
- Monthly on user's `period_end` → reset `used_this_period = 0`, roll `period_start`/`period_end`. Do NOT zero `topup_balance`.

---

## What NOT to build (out of scope)

- Stripe checkout / webhooks (separate handoff)
- Team seat management / shared pools (Phase 2)
- Admin dashboards
- Auto-topup rules
- Any UI (frontend team owns)

---

## Frontend contract (what I'm building against)

Mocked `useCapacity()` in the frontend expects exactly the response shapes above. When these endpoints land, the mock swaps to `fetch('/api/capacity')` and gating turns on. Until then, all frontend surfaces render but never actually block execution.

**Signal when live:**
- `GET /api/capacity` returns 200 for an authed user
- `POST /api/capacity/estimate` returns a valid estimate
- Then I flip `CAPACITY_ENFORCEMENT_ENABLED` in the frontend and ship.

---

## Verification (backend side)

```
curl -H "Authorization: Bearer $TOKEN" https://axiom-atlas-.../api/capacity
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"kind":"forge_codegen","payload":{"prompt":"add a button"}}' \
  https://axiom-atlas-.../api/capacity/estimate
```

Both should return the shapes above. Ping when live.
