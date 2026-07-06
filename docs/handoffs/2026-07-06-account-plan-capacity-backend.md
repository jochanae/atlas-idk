# Backend Handoff — Account Plan & Capacity Endpoints

**Date:** 2026-07-06
**Repo:** `Axiom-Atlas` (Cloud Run)
**Consumer (frontend):** `artifacts/atlas-frontend/src/lib/useAccountMock.ts` — swap mock hooks for real fetches once these endpoints land.

## Why

The project header sheet on the frontend now surfaces account-scoped plan tier + execution capacity (Burst Credits) at the top of the project menu. Data is currently mocked behind `USE_MOCK_ACCOUNT = true`. These two endpoints unblock the swap to real data.

Do NOT scope these to a single project. Both are **account-scoped** — same values regardless of which project the user is looking at. The sheet is launched from the project header but speaks as the account.

---

## Endpoints

Both are `GET`, both require the standard auth (`Authorization: Bearer <atlas-auth-token>` or the existing session cookie — whichever the identity middleware already accepts). Both return `200` on success and `401` on missing/invalid auth.

### `GET /api/account/plan`

Returns the authenticated user's current subscription plan.

**Response 200:**
```json
{
  "tier": "free" | "pro" | "studio" | "enterprise",
  "tier_label": "Pro",
  "cycle_reset_at": "2026-07-24T00:00:00.000Z",
  "manage_url": "/account/plan"
}
```

Field notes:
- `tier` — lowercase enum, used for logic branches on frontend.
- `tier_label` — display string, may include modifiers later ("Pro Annual", "Studio Team").
- `cycle_reset_at` — ISO 8601 UTC. Frontend renders as relative ("Resets in 18 days").
- `manage_url` — path (or absolute URL) the "Manage plan" button navigates to. Safe to hardcode `/account/plan` for now.

### `GET /api/account/capacity`

Returns the authenticated user's current execution capacity (Burst Credits) for the active billing cycle.

**Response 200:**
```json
{
  "included": 100,
  "used": 27,
  "remaining": 73,
  "cycle_reset_at": "2026-07-24T00:00:00.000Z",
  "auto_topup": null
}
```

Or when auto top-up is configured:
```json
{
  "included": 100,
  "used": 100,
  "remaining": 0,
  "cycle_reset_at": "2026-07-24T00:00:00.000Z",
  "auto_topup": {
    "enabled": true,
    "threshold": 0,
    "refill_amount_usd": 15,
    "monthly_ceiling_usd": 100
  }
}
```

Field notes:
- All credit fields are integers. `remaining = included - used` (server-authoritative; frontend does not recompute).
- `cycle_reset_at` should match the plan's cycle_reset_at.
- `auto_topup` is `null` when unset. `monthly_ceiling_usd` is nullable inside the object (user may opt out of the safety cap).

---

## Scope guardrails

- **Do NOT** add a purchase / Stripe flow in this handoff. Only the two read endpoints above.
- **Do NOT** deduct credits or wire metering in this handoff. Read-only.
- **Do NOT** scope to project — even if launched from a project URL, the data is account-wide.
- Frontend already handles loading state; returning realistic zeros for a Free-tier user with no capacity is fine.

## Frontend swap-in

Once both endpoints return 200 on staging, in `artifacts/atlas-frontend/src/lib/useAccountMock.ts`:

1. Flip `USE_MOCK_ACCOUNT` to `false`.
2. Replace the mock branches in `useAccountPlan` / `useAccountCapacity` with `fetch("/api/account/plan")` / `fetch("/api/account/capacity")` using the existing `getAuthHeaders()` helper (`@/lib/api`).
3. Consuming components (`AccountSummarySections.tsx`) do not change.

## Acceptance

- Unauthenticated request → `401`.
- Authenticated request → `200` with the exact response shape above (no extra top-level fields, no snake_case/camelCase drift).
- Same `cycle_reset_at` on both endpoints for a given user.
- Frontend can flip `USE_MOCK_ACCOUNT` to `false` and the sheet renders identical layout with live values.
