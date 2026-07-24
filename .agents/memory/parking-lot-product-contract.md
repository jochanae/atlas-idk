---
name: Parking Lot product contract
description: Product contract for Atlas Parking Lot — unresolved cognitive work, intake tiers, actions, resolve rules, card metadata. Companion to the product audit.
---

# Parking Lot product contract (pointer)

**Canonical doc:** [`docs/PARKING_LOT_CONTRACT.md`](../../docs/PARKING_LOT_CONTRACT.md)  
**Audit:** [`docs/audits/parking-lot-product-audit.md`](../../docs/audits/parking-lot-product-audit.md)  
**Enrichment mechanics:** [`parking-lot-enrichment.md`](./parking-lot-enrichment.md)

## Rule for agents

Treat the Parking Lot as Joy's working memory with the user's permission — not a scratchpad or dump.

Before changing park intake, CaptureBar intents, promote/clarify/resume, or auto-extract → parked paths:

1. Read `docs/PARKING_LOT_CONTRACT.md`
2. Pass the five-question gate at the bottom of that doc
3. Do not add silent over-capture (especially home-handoff style) without updating the contract
4. Do not use "Dump" as Parking Lot category language

## Locked architecture

Ledger and Parking Lot are the same `entries` object, rendered by status. Moving between them is a status change, not duplication. Keep two-tier enrichment (lite on park, full on open).
