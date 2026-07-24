# Axiom / Joy Subscription Model — Locked Plan (2026-07-24)

## Philosophy (never violate)
**Thinking is unlimited. Execution uses credits.**

Free forever: Ask Joy, Parking Lot, Ledger, Master Map, Axiom Flow, Requested Artifacts, project memory, planning, decision support.
Metered: Forge codegen, sketch generation, image edits, agent execution.

## Public tiers (marketed)
- **Free** — $0. Unlimited thinking. Enough execution to reach a real Forge outcome.
- **Pro** — $29/mo. Unlimited thinking + generous execution + top-ups + auto-reload.
- **Teams** — contact-only card. No price. No feature list. Just: shared billing, seats, org permissions, admin controls — when they exist.

Legacy DB slugs (`founder`, `studio`, `teams`) stay; `subscriptionTierToPlanTier` already collapses them. No data migration.

## Pricing page copy structure (outcome-first, never raw credits)

Two cards side by side + Teams strip below.

**Free**
- Think without limits
  - Unlimited Ask Joy conversations
  - Unlimited project memory
  - Unlimited planning and decision support
- Execute when you're ready
  - Enough monthly execution for approximately:
    - ~7 small edits · ~2 medium builds · ~1 image generation
- CTA: Start free

**Pro — $29/mo**
- Everything in Free
- Execute when you're ready
  - Enough monthly execution for approximately:
    - ~100 small edits · ~33 medium builds · ~12 image generations
  - GitHub push · Forge · agents · image generation
  - Top-ups and auto-reload
- CTA: Go Pro

**Teams** — one-line strip
- "Shared billing, seats, and admin controls — talk to us." → Contact.

Raw credit numbers appear only inside the estimator card and the account/capacity sheet. Never on the landing page.

## Free tier defaults
- 20 credits/month (start low, easier to raise than lower).
- 5/day soft cap.
- 1 active project (already enforced).
- No top-ups. No auto-reload.

## Pro tier defaults
- 300 credits/month, no daily cap.
- Top-ups available: 100 / $10, 500 / $40, 2000 / $140. Never expire.
- Auto-reload: **default OFF**. Never offered at onboarding. Surfaced only after first top-up purchase.
- Priority model routing (Sonnet default, Haiku fallback for cheap work).

## No trial
Free gives enough execution to reach value. Paywall appears when the user hits the ceiling — not when a clock expires.

## Credit economics (internal)
- 1 credit ≈ $0.03–0.05 true model cost (Sonnet), less on Haiku.
- Charged ≈ $0.08–0.10/credit.
- Target gross margin: 50–65% on Pro base, 30–50% on top-ups.
- Estimator multiplier per model protects margin when user forces Opus/GPT-4o.

## Build sequence

**Slice 1 — Pricing page rewrite** ← ships this turn
- `pages/pricing.tsx` → outcome-first two-card + Teams strip. No credit numbers. Waitlist form removed.

**Slice 2 — Stripe products + subscription live**
- Create in Stripe: Free (implicit), Pro monthly, Pro annual, top-up SKUs (100/500/2000).
- Verify `useSubscription` checkout + portal round-trip.
- Wire `/account/plan` (backend exists). Flip `USE_MOCK_ACCOUNT = false`.

**Slice 2.5 — Billing Simulation (measure-only)** ← inserted per feedback
- Metering runs in shadow mode: estimate + consume write to DB and Ledger.
- Enforcement stays OFF. Users never blocked.
- Verify: estimate accuracy vs actual, decrement correctness, Ledger entries created, Stripe state matches, monthly reset behavior fires.
- Gate: 7 days of clean data across all four execution kinds before Slice 3.

**Slice 3 — Enforcement on**
- Flip `CAPACITY_ENFORCEMENT_ENABLED = true`.
- Pre-execution estimate card in Forge path.
- Threshold warnings (20% → toast, 0% → paywall modal).

**Slice 4 — Top-ups**
- Implement `POST /capacity/topup` (currently 501). Stripe checkout → webhook increments `topup_balance`.
- Top-up button in account sheet.

**Slice 5 — Auto-reload (surfaced after first top-up only)**
- Migration: `autoreload_enabled`, `autoreload_threshold`, `autoreload_pack_credits`, `autoreload_ceiling_usd nullable`, `autoreload_month_spent_usd`.
- Settings UI in account sheet, only revealed after first successful top-up.
- Server checks threshold on every consume; charges saved PM off-session under monthly ceiling; writes Ledger `verb: autoreload_charged`.

**Slice 6 — Admin billing hub**
- `GET /admin/billing/summary` — MRR, active Pro subs, top-up revenue, ARPU.
- `GET /admin/billing/users?sort=margin` — per-user revenue − model cost − infra allocation.
- Consumption trends by kind + model.
- Alerts: users near auto-reload ceiling, negative-margin users, failed charges.
- Cost math uses `entries.details.model_cost_usd` stored at write time (immune to price changes).

## Non-negotiables (from feedback)
- Never market four tiers.
- Never show raw credit counts on the marketing page.
- Auto-reload defaults OFF, revealed post-purchase only.
- No timed trial.
- Teams = contact-only, no card.
