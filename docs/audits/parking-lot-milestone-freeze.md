# Parking Lot Milestone — Freeze

**Date:** 2026-07-24  
**Status:** COMPLETE — freeze redesign  
**Contract:** [`docs/PARKING_LOT_CONTRACT.md`](../PARKING_LOT_CONTRACT.md) v0.3  
**Audit:** [`docs/audits/parking-lot-product-audit.md`](./parking-lot-product-audit.md)

---

## What this milestone delivered

Parking Lot is no longer a scratchpad. It is a **decision queue** with rules:

- Membership litmus: intentionally deferred unfinished cognitive work  
- Six-month rule as north star  
- Intake tiers: User / Joy+consent / Auto (≥95 only)  
- Mid-band (80–94): **Park this?** consent card — create on confirm only  
- Exit paths: Promote / Delete / precision-first auto-resolve / consciously Kept  
- Categories + filters; Dump retired from Park (Forge only)  
- Clarify ≠ Resume; Promote asks “Promote to what?”

---

## Validation checklist (real use)

Run these in a live project before treating the freeze as verified:

1. **Handoff** — Home → Workspace does **not** flood the lot with recent messages.  
2. **Explicit park** — Capture Idea/Decision/Build/Later persists category; chips filter.  
3. **Mid-band consent** — Turn that says “we'll decide later” shows Park this? / Not now; Park creates one item; Not now creates none.  
4. **Auto-park rarity** — Only ≥95 Decision receipts silent-park (rare).  
5. **Promote** — Promote… → Decision/Goal/Build/Risk/Question writes type and leaves the lot.  
6. **Clarify** — Opens composer with clarify prefill, not plain Resume text.  
7. **Resolve precision** — Committing “Entrepreneurs are the primary audience” resolves a matching parked twin; does **not** resolve unrelated “Pricing” vs “Pricing tension…” style false positives.  
8. **Empty state** — Copy reads as decision queue, not inbox.

If all eight pass, declare the milestone frozen and move on.

---

## Freeze rule

Do **not** open another architecture audit or redesign pass.

Allowed after freeze:

- Bugfixes that break the contract  
- Small copy/UX tweaks from the validation checklist  
- Mid-band pattern additions that stay precision-biased  

Not allowed without a new product decision:

- New parking categories  
- New silent auto-park paths  
- Softening resolve matching toward recall over precision  
- Reintroducing Dump on Park  

---

## Governing test (unchanged)

> If someone returned to this project six months later, would the Parking Lot contain only the unresolved questions that genuinely deserve another conversation?
