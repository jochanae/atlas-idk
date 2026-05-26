# Shaping → Committed: One Object, Two States (+ Shell Mode)

**Doctrine:** *Shaping is real enough to preserve context, but not formal enough to pollute the system of record.*

- `status` — is the idea shaping or committed.
- `surface_mode` — is the project quietly available or operationally driving the workspace.
- `shell_mode` — what surface the user is standing in: ambient home, active home chat, or operational workspace.

## Core model

```text
projects
  status:       'shaping' | 'committed' | 'archived'
  surface_mode: 'ambient' | 'operational'
  shape:        jsonb         -- live extraction bucket (silent)
  working_title:text          -- AI-named, editable
  committed_at: timestamptz | null
```

Shell/session state (client, not on the project row):

```text
shell_mode: 'ambient' | 'active' | 'operational'
  ambient     = Nexus home, no active conversation yet
  active      = Nexus home chat has started, shaping happening
  operational = workspace / Forge / Map / build surfaces
```

Rules:
- First user message in a `shell_mode = 'ambient'` Nexus session with no active project context auto-creates a `shaping` project owned by `auth.uid()`. Shell flips to `active`. Never auto-create inside an already-committed workspace.
- Ledger / constellation queries filter to `status = 'committed'` — shaping projects never pollute the system of record.
- Master Map shows committed projects as nodes; an active shaping project appears as a soft "forming" halo, not a node.
- Commit flips `status` to `committed`, stamps `committed_at`, writes the first ledger entry from `shape`, lights up the constellation node.

## Silent extraction

- Cadence: every **3–5 meaningful message exchanges**, **OR** on-demand when the user opens Forge / Map / Commit. Forge never opens empty just because the cadence hasn't fired.
- Extractor updates `shape` with: intent, audience, constraints, tone, aesthetic, stack hints, open questions.
- No UI interruption. No "I noticed…" messages.
- Idempotent merge into `shape` — never overwrites user-edited fields.

## Footer dead-end fixes (ship in same pass)

- **Map tap, no committed project**: route to Master Map. If a shaping project is active, render "you are here, shaping [working title]" halo.
- **Forge tap, no committed project**: open Forge defaulted to **Project DNA** tab, pre-filled from `shape` (triggers on-demand extraction if stale). Demote Quick Prompt to secondary action.
- **Dock focus ring**: highlights the surface matching the active project's `surface_mode` and the current `shell_mode`.

## Commit moment

`CommitPrompt` and `DecisionCatch → Proceed` are the two entry points. On commit:
1. `status = 'committed'`, `committed_at = now()`.
2. Insert ledger entry seeded from `shape` (title, summary, severity).
3. Forge DNA auto-fills from `shape`.
4. Constellation node animates in.

## Build order

1. **Migration** — add `status`, `surface_mode`, `shape`, `working_title`, `committed_at` to `projects`. Backfill existing rows to `status = 'committed'`, `surface_mode = 'operational'`.
2. **Shell mode in shellStore** — add `shell_mode: 'ambient' | 'active' | 'operational'` to `useShellStore`; flip ambient → active on first home message, operational on workspace entry.
3. **Auto-create on first message** — `home.tsx` send handler creates a shaping project only when shell is ambient and no active project context exists. Store id in `shellStore.activeThread.projectId`.
4. **Ledger / constellation filters** — scope to `status = 'committed'`.
5. **Footer fallbacks + dock focus ring** — Map and Forge route correctly when only a shaping project exists.
6. **Forge default tab** — Project DNA first, Quick Prompt secondary; DNA reads from `shape` and triggers on-demand extraction if stale.
7. **Silent extractor** — extend `atlas-chat` to extract every 3–5 meaningful exchanges, plus on-demand from Forge/Map/Commit; merge into `shape`.
8. **Commit transition** — `CommitPrompt` + Decision Catch Proceed path writes ledger entry and flips status.
9. **Shaping halo on Master Map** — soft "forming" indicator for the active shaping project.

## Technical notes

- `status`, `surface_mode`, and `shell_mode` are three independent dimensions — never collapse.
- `shape` is jsonb with versioned schema (`shape.v = 1`) so the extractor evolves without migrations.
- RLS stays `auth.uid() = user_id` — no policy changes needed.
- Existing ledger/forge/codegen wiring keeps working — committed projects look identical to today's projects.

## Out of scope (defer)

- Dedicated "memory" UI surfacing `shape` contents — keep invisible per subtle-continuity instinct.
- Cross-project shape inheritance.
- Auto-archive of stale shaping projects after 30 days idle.
