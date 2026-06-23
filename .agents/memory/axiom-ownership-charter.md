---
name: Axiom Ownership Charter
description: Frozen architecture map defining surface owners, what gets deleted/merged/pruned, and the governing rules for new surfaces. Frozen June 23 2026.
---

## Governing Rules

- Every feature gets exactly one owner.
- Before creating a page: "Can this be a section inside something that already exists?"
- Only Atlas writes to `project.memory`. MemoryTab presents it. Nothing else touches it.

## Surface Ownership (summary)

**Global ecosystem:**
- Home → Activation (chat, portfolio view, project creation)
- Projects → Project management (archive, delete, link repos)
- Portfolio Health → Cross-project intelligence; absorbed Compass
- Connectors → Account-level OAuth integrations
- Map → Portfolio visualization (3D, cross-project)
- Workshop → Cross-project utilities: Decision Editor, Diff Review, Session Exporter, Bulk Import ONLY

**Workspace ecosystem (never become pages):**
- Ledger → Decisions; absorbs Vault as "Snapshots" tab (Activity | Snapshots)
- Composer → Temporary holding; absorbs Parking as 🅿️ N badge → drawer
- Memory → Project intelligence; Atlas writes, MemoryTab presents

## What Gets Retired

- /compass → delete (superseded by Portfolio Health)
- /vault → delete page; route redirects to project Ledger
- /parking → delete page; route redirects to home
- Ghost redirects (/onboarding, /sessions, /dashboard, /nexus, /guard-report) → redirect /home
- Workbench panel → delete (orphaned, in RightTab union but no render block)
- Workshop: Context Builder → delete (plain-text writer, breaks tiered JSON memory model)
- Workshop: Connections → delete (duplicate of /connectors)
- Workshop: Selfmap → move to Admin (developer operation)

## The Historical Pattern

The app accumulated layers, not chaos. Every retired surface followed: idea built → app evolved → old surface never retired. Fix is retiring, not rebuilding.

## Execution Sequence

1. Immediate deletes: Compass, ghost redirects, Workbench panel
2. Immediate removals: Workshop Context Builder + Connections
3. Immediate moves: Selfmap → Admin
4. Merges: Vault → Ledger Snapshots; Parking → Composer badge
5. Reorganize: GitHub panel → Repository | Activity | Settings

## Full Document

See `.local/axiom-ownership-charter.md` for complete charter.

**Why:** Prevents future surfaces from being created without a clear owner, and gives a single reference for "who owns what" before any deletion/merge is executed.

**How to apply:** Before creating any new route or panel, check this document. If a natural owner already exists, it's a section problem not a page problem.
