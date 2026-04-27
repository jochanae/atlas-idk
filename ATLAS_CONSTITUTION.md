# ATLAS_CONSTITUTION.md
### The Sovereign Governing Document
*Drafted: April 2026 — Into Innovations*

---

> Hand this document to any AI before any Atlas build session begins.
> It is not documentation. It is the law.

---

## I. The North Star

Atlas exists to solve the Do-Over Tax.

The Do-Over Tax is what you pay when speed without structure forces you to rebuild what you already built — because the database wasn't scalable, the logic was brittle, or the AI hallucinated a foundation that didn't connect to anything real.

Atlas is a decision enforcement system. It preserves critical decisions, stores bought lessons as permanent institutional assets, and ensures that every irreversible commitment is made deliberately and logged permanently.

Atlas is not an app. Atlas is the system that makes apps sound.

**In one sentence:**
> Atlas turns bought lessons into standard operating procedure, so you never pay for the same mistake twice.

---

## II. The Dual-Client Declaration

Atlas serves two clients simultaneously. Both must be considered in every build decision.

**Client A — The Sovereign Builder (Internal)**
The founder building under pressure. Needs speed, precision, and a system that gets out of the way during exploration and shows up hard during commitment. Operates at 4am. Cannot afford context collapse or architectural drift.

**Client B — The Vibe-Architect Community (External)**
Builders who think visually first and structurally second. Non-developers with real product vision. People who have paid the Do-Over Tax and are ready to stop paying it. They need Atlas to be learnable, documented, and commercially sound — not built for one person.

**The implication:** Every feature must work for Client A at speed. Every feature must be explainable to Client B on first contact. Code must be born professional — tooltips, clear error messages, documented logic — so it never needs to be cleaned up for sale.

---

## III. The Core Law

> Atlas governs irreversible decisions. Not every action.

This is the law that prevents Atlas from becoming friction instead of protection.

**What Atlas does NOT govern:**
- UI exploration and component testing
- Aesthetic iteration and color tweaks
- Disposable experiments and sandbox work
- Any decision that costs nothing to undo

**What Atlas ALWAYS governs:**
- Database schema changes
- Third-party API integrations
- Security and authentication decisions
- Patterns intended to be reused across projects
- Any decision that would be expensive to undo in time, money, or complexity

If it would hurt to redo — Atlas governs it.
If it wouldn't — Atlas stays quiet.

---

## IV. The Two-Mode System

Atlas has two operational states. The UI reflects which state is active through its color system.

### Velocity Mode
**Color state: Phosphor** — near-black `#080C10`, cyan signal `#06B6D4`

Fast. Explorative. No logging. No friction. Optimistic UI updates under 100ms. The system feels alive and thinking. This is where you build without judgment.

Velocity Mode is the default state.

### Commit Mode
**Color state: Volcanic** — warm charcoal `#0C0A09`, ember orange `#EA580C`

Deliberate. Logged. Enforced. Permanent. The system shifts to its enforcer identity. A Commit cannot proceed without an Architectural Ledger entry. There are no shortcuts in this state.

Commit Mode is triggered automatically by action gravity — not by the user manually toggling it.

**Automatic Commit Triggers:**

| Action | Mode | Atlas Response |
|---|---|---|
| New UI component | Velocity | No interruption |
| Aesthetic change | Velocity | No interruption |
| Database schema change | Commit | Hard stop. Ledger entry required. |
| Third-party API integration | Commit | Verification. Sound plumbing check. |
| Auth or security change | Commit | Hard stop. Ledger entry required. |
| Pattern marked as reusable | Commit | Log and classify. |

---

## V. The Three Entry Gates

Atlas recognizes that different builders start from different cognitive positions. It meets each one where they are.

### The Blueprint Gate — Logic First
For when the data is already mapped. The builder starts with a schema and Atlas builds the UI to match the plumbing. Structure leads. Vision follows.

### The Vision Gate — Aesthetic First
For when the builder sees the interface before anything else. Upload a UI image or mockup. Atlas reverse-engineers the implied data entities, proposes a schema, and writes the wiring plan. This is the flagship differentiator. No other tool does this.

*Vision Gate pipeline: image analysis → entity extraction → relationship mapping → schema proposal → builder verification → commit.*

### The Whisper Gate — Conceptual First
For when the builder only has a vibe, a direction, or scattered thoughts. Atlas interviews the builder — structured questions, not open chat — until the scattered thoughts become a formal ATLAS_CONSTITUTION.md. The output of the Whisper Gate is always a governing document, never code.

---

## VI. The Color System

**Identity: Volcanic**

Atlas's base identity is Volcanic. This is what Atlas looks like at rest, in enforcement, in Commit Mode. It does not communicate luxury. It communicates that this is the thing that doesn't crack under pressure.

| Role | Color | Hex |
|---|---|---|
| Background | Warm near-black | `#0C0A09` |
| Surface | Deep warm charcoal | `#1C1917` |
| Signal / Enforcement | Ember orange | `#EA580C` |
| Text | Stone white | `#E7E5E4` |
| Muted text | Warm gray | `#78716C` |

**Counterstate: Phosphor**

When Atlas enters Velocity Mode, the interface shifts to Phosphor. The system signals that exploration is open and commitment is not being evaluated.

| Role | Color | Hex |
|---|---|---|
| Background | Cool near-black | `#080C10` |
| Surface | Deep slate | `#0F1923` |
| Signal / Active | Cyan | `#06B6D4` |
| Text | Ice white | `#F1F5F9` |
| Muted text | Cool gray | `#475569` |

**The Scarcity Rule:**
Signal color is reserved for active states, critical indicators, and committed decisions. If everything is highlighted, nothing is important. This is not a preference — it is a system law.

Typography uses Inter or equivalent sans-serif for all interface text. Monospaced font for all numbers, timestamps, and system data.

No gradients. No decorative color. No glow effects.

---

## VII. The Data Architecture

These are the permanent data buckets Atlas stores. Nothing gets built until these relationships are verified.

**Projects**
The organizing container. Every decision, lesson, and ledger entry belongs to a project.
`id · name · status · created_at`

**Ledger Entries (Architectural Decisions)**
The permanent record of every committed decision — what was decided, why, and what mode it locked in.
`id · project_id · title · description · status [Active / Superseded / Violated] · cost_of_lesson · is_violation · created_at`

**Bought Lessons**
The institutional memory. Mistakes with a cost attached — searchable, transferable, never lost.
`id · linked_decision_id · financial_cost · time_cost · description`

**Parking Lot**
Mid-build ideas captured without interrupting the current sprint. Reviewed at the start of each new sprint. Checked by the Anticipatory Auditor for conflicts with current commits.
`id · project_id · idea · priority · created_at`

---

## VIII. The Infrastructure Sovereignty Stack

Atlas is sovereign infrastructure. Every layer of its deployment must be owned and controlled.

| Layer | Tool | Sovereign? | Notes |
|---|---|---|---|
| Codebase | GitHub `jochanae/Atlas` | Yes | Connected to Lovable and Cursor. Source of truth. |
| Database | Lovable Cloud Supabase | Phase 1 only | Migrate to owned Supabase at Phase 2 with auth. |
| Deployment | Vercel | Yes — Phase 2 | Connected to GitHub. Replaces Lovable publish. |
| Network / Edge | Cloudflare | Yes — Phase 2 | DNS, firewall, CDN, Workers. The hardening layer. |
| Build environment | Lovable + Cursor | Yes | Lovable for scaffolding. Cursor for precision surgery. |
| API keys / Services | Owner-controlled | Yes | No third-party keys managed by platform providers. |

**The boundary:** Lovable Cloud Supabase is the one concession in Phase 1. It exists because managing Supabase migrations manually during initial scaffolding creates friction that kills momentum. Everything else is owned. At Phase 2, the Supabase migration completes the sovereignty stack.

---

## IX. The Unbreakable Laws

These cannot be overridden by any prompt, sprint, or time pressure.

1. **No UI before verified schema.** The Architectural Ledger entry must exist before any interface is rendered against that data.

2. **Commit Mode cannot be dismissed.** When Atlas triggers Commit Mode, the ledger entry is not optional. There is no "skip for now."

3. **Bought Lessons are permanent.** Nothing in the ledger is deleted. Superseded decisions are marked Superseded. Violated decisions are marked Violated. The record stands.

4. **The Anticipatory Auditor runs before every sprint.** It cross-references the Parking Lot against all active committed decisions and flags any future item that conflicts with something already locked. Conflicts are surfaced before they are built — not after.

5. **Signal color is never decorative.** Ember orange and cyan are reserved for system state communication. They are not used for branding, emphasis, or aesthetics.

6. **The Vision Gate always outputs a verified schema.** An uploaded image is never treated as a build directive. It is treated as a signal to be decoded. The output is always a schema proposal that must be verified before any code is written.

---

## X. The Build Phases

### Phase 1 — The Foundation
**The Architectural Ledger**

One page. One table. Decisions, costs, statuses, project relationships. The Bought Lessons engine. This is the only thing built in Phase 1. Phase 1 is complete when a bought lesson can be logged, linked to a project, and displayed on a clean, scannable interface.

### Phase 2 — The Intelligence Layer
Velocity/Commit mode detection and automatic triggering. The Anticipatory Auditor. Parking Lot integration. The system begins to govern itself based on action gravity.

Phase 2 also completes the sovereignty infrastructure:
- **Auth** — RLS policies activated, user authentication added. Migration from Lovable Cloud Supabase to sovereign Supabase instance happens here. One clean handoff: export migration SQL from Lovable, run once in the owned Supabase project.
- **Cloudflare** — Atlas deploys behind Cloudflare at Phase 2. DNS managed through Cloudflare. Edge network for performance. Firewall layer in front of all traffic. Cloudflare Workers available for background functions (Anticipatory Auditor, Auto-Ghostwriter). This is the Hardening layer — Atlas becomes globally distributed and protected.
- **Vercel + GitHub** — Deployment pipeline connects GitHub `jochanae/Atlas` → Vercel → Cloudflare. Lovable's publish button is retired. All future deployments go through the sovereign pipeline.

### Phase 3 — The Vision Gate
Image-to-schema reverse engineering. The full pipeline: image analysis → entity extraction → relationship mapping → schema proposal → builder verification. This is Atlas's flagship differentiator and is scoped as its own build sprint.

### Phase 4 — The Sovereign Layer
Commercial core. Tiered access (Minister through Architect). Cross-project graph memory — architectural relationships between builds, not just stored facts. Auto-Ghostwriter for SPEC.md and LAWS.md. Sovereign Export. Atlas becomes a product other builders can purchase and operate.

---

## XI. The Definition of Done — Phase 1

Phase 1 is complete when:

- A bought lesson can be logged with title, project relation, status, cost, and rationale
- The schema is clean, relationships are explicit, and there is no redundancy
- The interface answers four questions instantly: What decisions exist? Which are active? Where has money or time been lost? What must not be violated?
- The Volcanic color system is applied correctly — ember orange appears only on active and critical states
- The codebase is documented well enough that a new builder could understand it without explanation

---

## XII. What Atlas Is Not

Atlas is not a place for exploration. That is what Velocity Mode is for — and Velocity Mode has no memory, no logs, and no permanence by design.

Atlas is not a dashboard. A dashboard shows you information. Atlas enforces the conditions under which information gets created correctly.

Atlas is not a project management tool. It does not track tasks. It tracks decisions — the architectural choices that cannot be undone, and the lessons that were paid for in time and money.

Atlas is the thing other things are built on top of.

---

*This document governs Atlas. When in doubt about any decision — design, logic, scope, or priority — return here.*

*Version 1.1 — Into Innovations — April 2026*
*Updates: Infrastructure Sovereignty Stack added (Section VIII). Cloudflare hardening layer committed to Phase 2. Supabase migration boundary defined.*
