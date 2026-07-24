---
name: Parking Lot product contract
description: Settled product contract for Atlas Parking Lot — decision queue, six-month rule, confidence gates, promote graduation, resolve exits. Dump is Forge-only.
---

# Parking Lot product contract (pointer)

**Canonical doc:** [`docs/PARKING_LOT_CONTRACT.md`](../../docs/PARKING_LOT_CONTRACT.md) (v0.2 — architecture settled)  
**Audit:** [`docs/audits/parking-lot-product-audit.md`](../../docs/audits/parking-lot-product-audit.md)  
**Enrichment mechanics:** [`parking-lot-enrichment.md`](./parking-lot-enrichment.md)

## Rule for agents

Treat the Parking Lot as a **decision queue** (Joy's working memory with permission) — not storage, not a dump.

Before changing park intake, CaptureBar intents, promote/clarify/resume, or auto-extract → parked paths:

1. Read `docs/PARKING_LOT_CONTRACT.md`
2. Pass the five-question gate (+ six-month rule)
3. **Home handoff must not auto-park** recent messages
4. Confidence: ≥95 auto-park, 80–94 ask, <80 skip
5. Do not use "Dump" on Park destination — Dump is Forge Intake only; Park uses **Later**
6. Promote asks "Promote to what?" and persists the type
7. Prefer exit (resolve / promote / delete) over endless intake

## Locked architecture

Ledger and Parking Lot are the same `entries` object, rendered by status. Keep two-tier enrichment (lite on park, full on open).
