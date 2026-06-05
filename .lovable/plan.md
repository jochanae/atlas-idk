# Global Decisions → Sovereign Git Log

Execute in 3 phases. Each phase is shippable on its own so we don't bet the whole rebuild on one big push.

---

## Phase 1 — Stop the bleed (dedupe)

**Backend (atlas-commit pipeline)**
- Add an idempotency guard in `supabase/functions/atlas-commit/index.ts`: before insert into `ledger_entries`, lookup by `(user_id, project_id, title)` within the last 60s. If hit → return existing row instead of inserting.
- Add `source_message_id` linkage so the same Atlas message can never spawn 2 ledger rows.
- Migration: add `source_message_id uuid` + unique partial index `(user_id, source_message_id) where source_message_id is not null` on `ledger_entries`.

**Backend (cleanup)**
- One-time backfill: collapse existing duplicates in `atlas-idk` and any other project — keep oldest row, archive the rest with `status='archived_duplicate'`.

**Frontend (`src/pages/ledger.tsx` + `DecisionLedgerGrouped`)**
- Group rows by normalized title within a 24h window. Render one row with a `×N` badge; expand on tap to see each occurrence.
- Hide `status='archived_duplicate'` from default view.

---

## Phase 2 — GitHub footprint on every entry

The piece Lovable missed. A decision without a diff is a journal entry.

**Schema**
Migration adds to `ledger_entries`:
- `github_commit_sha text`
- `github_repo text` (e.g. `owner/repo`)
- `github_branch text`
- `github_pr_number int`
- `github_diff_url text` (computed/stored)
- `github_event_type text` — `commit | pr_opened | pr_merged | push | manual_link`
- `github_event_at timestamptz`

**Wire-up points**
1. **Codegen path** (`atlas-codegen`): when a generation run produces files and pushes to GitHub via the Git Tree API, stamp the resulting commit SHA back onto the originating ledger entry.
2. **Push modal** (`src/components/workspace/GitHubPushModal.tsx`): after a successful push, if there's a current "in-motion" or just-committed entry, attach the SHA.
3. **Manual link**: small "Link commit" action on any ledger row — paste a SHA or PR URL, we parse via `src/lib/githubRepo.ts` and stamp it.
4. **Backfill (optional, later)**: scan `build_states` + `generated_files` per project, match to ledger entries by `session_id` + time window, fill SHAs where we already know them.

**Render on each entry card**
- Commit chip: `repo @ sha[0..7]` → links to `https://github.com/{repo}/commit/{sha}`
- PR chip if present: `PR #123` → links to PR
- Event glyph (commit / merge / push)
- Empty state: "No code footprint — link a commit" (only on entries inside projects that have a linked GitHub repo)

---

## Phase 3 — Redesign /ledger as 5 sections

Replace the current flat list in `src/pages/ledger.tsx`.

```text
┌──────────────────────────────────────────────────┐
│  1. Portfolio Pulse                              │
│  ── sparkline · commit/override ratio · TTC      │
├──────────────────────────────────────────────────┤
│  2. Cross-Project Tensions                       │
│  ── In Tension + Overridden, all projects        │
├──────────────────────────────────────────────────┤
│  3. Pattern Detection                            │
│  ── semantic clusters (doubles as dedupe view)   │
├──────────────────────────────────────────────────┤
│  4. Project Signal Cards                         │
│  ── last-decision age · tension count · override │
│     rate · last commit SHA per project           │
├──────────────────────────────────────────────────┤
│  5. Recent Stream                                │
│  ── grouped by title+24h, ×N badges, commit chip │
│     inline on every row                          │
└──────────────────────────────────────────────────┘
```

**Section 1 — Portfolio Pulse**
- Sparkline: decisions/week, last 8w. SVG, no chart lib.
- Two scalar tiles: commit-vs-override ratio, avg time `In Motion → Committed`.
- Query: aggregate over `ledger_entries` grouped by week.

**Section 2 — Cross-Project Tensions**
- Filter: `status='In Tension' OR is_violation=true OR has supersedes_id`.
- Sort by `created_at desc`, cap 10, "See all" → filtered ledger view.

**Section 3 — Pattern Detection**
- v1: title-similarity clustering (lowercase + token Jaccard ≥ 0.6).
- Cluster card shows: representative title, N entries, projects spanned, "Merge" / "Mark distinct" actions.
- v2 (later): embedding-based via Lovable AI Gateway.

**Section 4 — Project Signal Cards**
- One card per project with ≥1 ledger entry.
- Signals: last decision age, # in tension, override rate (last 30d), last commit SHA (chip), tap → project.

**Section 5 — Recent Stream**
- Dedup-grouped feed from Phase 1.
- Every row shows: title, severity glyph, project chip, GitHub chip (Phase 2), `×N` badge if grouped.

---

## Technical notes

- All new server work goes through existing `createServerFn` + `requireSupabaseAuth` patterns in `src/lib/*.functions.ts`. No new edge functions.
- GitHub stamping reuses the existing push pipeline (`useGithubPushToken`, Git Tree API path in `atlas-codegen`). No new GitHub auth surface.
- Pulse/cluster queries done server-side, returned as one aggregate payload `getGlobalDecisionsDashboard()` — single round trip on page load.
- No design-token violations: reuse existing severity/status glyphs and the parchment/dark token set already in `src/styles.css`.

---

## Order of operations

1. Phase 1 migration + atlas-commit guard + frontend grouping. (Ship.)
2. Phase 2 migration + codegen/push stamping + commit chip on existing rows. (Ship.)
3. Phase 3 page rebuild section by section, top to bottom. (Ship each section.)

Approve and I start with Phase 1.