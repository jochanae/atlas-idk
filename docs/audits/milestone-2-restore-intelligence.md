# Milestone 2 — Restore Intelligence

**Status:** **OPEN** — 2.1 closed; **2.2 Round 1 closed out** → P1 Flow → P2 Classification → P3 Surface Integrity → Round 2  
**Prerequisite:** [Milestone 1 — Restore the Conversation](./milestone-1-unbroken-conversation.md) **CLOSED**  
**Principle:** Do **not** start by debating whether Ask Atlas should exist. Validate capabilities Atlas was designed to support — first delivery (2.1), then understanding (2.2).

---

## Sequence

| # | Track | Mode | Status |
|---|-------|------|--------|
| **2.1** | Artifact Generation and Delivery | Audit → contract fix | **CLOSED** — PR #208 merged (`d0b923d1`) — [`milestone-2-1-artifact-generation-delivery-audit.md`](./milestone-2-1-artifact-generation-delivery-audit.md) |
| **2.2** | Workspace intelligence correctness | Quality evaluation — *right* information, not mere population | **OPEN — Round 1 closed out** — next **P1→P2→P3→Round 2** — [`milestone-2-2-intelligence-correctness.md`](./milestone-2-2-intelligence-correctness.md) |
| **2.3** | Intelligence differentiation | Builder, Storyteller, Designer, and other lenses — meaningfully different thinking | After 2.2 accuracy bar |
| **2.4** | Natural conversation | Fewer unnecessary briefs, better intent recognition, appropriate follow-ups, less mechanical workspace behavior | After 2.3 |

---

## Mindset by track

| Track | Question |
|-------|----------|
| 2.1 | If Atlas says it generated something, did the user receive and open it? |
| **2.2** | **Did Atlas actually understand the conversation?** — and does it know **what kind** of knowledge it learned? |
| 2.3 | Do lenses provide unique, useful perspectives? |
| 2.4 | Does the conversation feel natural rather than mechanical? |

---

## 2.2 success metric

> Atlas reliably extracts knowledge from the conversation in a way that is accurate, useful, and meaningfully different across its intelligence surfaces.

**Knowledge Classification:**

> Atlas must distinguish between Ideas, Decisions, Insights, Questions, and Engineering Events. A product architect shouldn't have to mentally separate those after the fact—the system should do it automatically.

### Round 1 snapshot

| Surface | Result |
|---------|--------|
| Blueprint | **PASS** |
| Ledger | **PARTIAL** (architecture + engineering noise mixed) |
| Insights | **PARTIAL** (procedural; missing persistence-boundary insight) |
| Flow | **NOT VERIFIED** |
| Knowledge Classification | **FAIL** — primary finding |

### Round 1 Closeout path (do in order)

| Step | Mode | Status |
|------|------|--------|
| **P1** Verify Flow | Observation | NOT VERIFIED — reasoning graph vs conversation graph |
| **P2** Knowledge Classification | Correction | FAIL — highest priority |
| **P3** Surface Integrity | Correction | Blueprint / Ledger / Insights / Flow / Activity each own one job |
| **Round 2** | Validation | Lock principles → abandon → reversal → evolve without corruption |

Do **not** start Round 2 until P1–P3 complete.  
Full criteria: [2.2 board](./milestone-2-2-intelligence-correctness.md).

---

## Closed: 2.1 governing requirements

> When Atlas generates an artifact in Ask Atlas, the artifact must appear in that conversation first. Storage in Global Files or a related Workspace is additional persistence—not a substitute for delivery.

> A link to a Workspace output must open the actual output or its destination state, not initiate a generic full-conversation handoff.

---

## Explicit non-goals (2.2)

- No infrastructure rabbit holes (SSE survival, auth, scale).  
- No reopen of deliverable pipeline work unless a regression breaks the 2.1 contract.  
- No debate on retiring Ask Atlas.  
- Do not treat “panel populated” as success.  
- Do not skip ahead to Round 2 before classification and surface integrity.
