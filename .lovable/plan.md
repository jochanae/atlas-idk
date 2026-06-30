# Run inspection surface — pass 1 (frontend-only)

Frontend-only. No backend persistence, no shell stream, no new retry API, no chrome/rail/top-bar changes. Existing builder pipeline and chat output stay untouched.

## What we're building

1. A `Run` type + in-memory adapter that derives a Run from existing builder output.
2. A compact **RunCard** rendered inline in chat *below* the existing builder output (additive).
3. A full **/runs/:id** inspection page: status header, counters, View diff, `CHAT | SHELL | FILES` tabs, per-file blocked cards.

## Explicitly out of scope (this pass)
- Backend persistence (separate handoff packet — user has it).
- Replacing the current builder output in chat.
- Persistent left icon rail, repo pill, top-bar redesign.
- Shell streaming.
- New retry endpoints. Reuse existing retry only; otherwise render Retry disabled with tooltip "Retry coming in next pass" + TODO log.

## Data shape

```ts
// src/features/runs/types.ts
export type RunStatus = "running" | "applied" | "partial" | "failed";

export interface RunFileError { line: number; col: number; message: string; }

export interface RunFile {
  path: string;
  state: "applied" | "blocked";
  reason?: string;          // "Typecheck failed · not written"
  errors?: RunFileError[];
}

export interface RunApplyError { code: number; message: string; }

export interface Run {
  id: string;               // client uuid until backend persists
  intent: string;
  createdAt: string;
  status: RunStatus;
  counts: { applied: number; blocked: number };
  files: RunFile[];
  applyError?: RunApplyError;
  diffRef?: string;         // pointer the existing diff viewer consumes
  sourceMessageId?: string; // originating chat message
}
```

## New files

```text
src/features/runs/
  types.ts
  adaptRun.ts              // builder result -> Run
  runStore.ts              // zustand: Map<id, Run>, addRun, getRun
  useRun.ts                // hook wrapper
  components/
    RunCard.tsx            // compact inline-in-chat card
    RunHeader.tsx          // status pill + intent + counters + View diff
    RunTabs.tsx            // CHAT | SHELL | FILES
    BlockedFileCard.tsx    // path · line:col errors · Retry (disabled unless existing API)
    AppliedFileRow.tsx     // compact applied row
    ApplyErrorCard.tsx     // 403 etc · Retry apply (disabled unless existing API)
src/pages/RunPage.tsx
```

## Files edited (minimal)

- Router file — add `<Route path="/runs/:id" element={<RunPage />} />`.
- Chat message renderer that shows builder output — append `<RunCard runId={…} />` below existing output. Existing output unchanged.
- Builder completion handler — `runStore.addRun(adaptRun(result, message))` once per build.

## Behavior

**RunCard (in chat)**
- One line: status dot · `Run #abcd · FAILED · 2 blocked · 1 applied` · `View →` → `/runs/:id`.
- No expansion in chat.

**/runs/:id**
- `getRun(id)` miss → small empty state ("Run not available in this session. Persistence coming in next pass."). No fetch, no spinner.
- Layout: `RunHeader` → optional `ApplyErrorCard` → `RunTabs`.
  - `CHAT`: read-only excerpt of originating user message + Atlas reply, keyed by `sourceMessageId`.
  - `FILES`: `AppliedFileRow` list for applied; `BlockedFileCard` list for blocked (path mono, `line:col error msg` rows mono, Retry button per spec above).
  - `SHELL`: placeholder ("No shell output captured for this run").
- `View diff` reuses existing diff viewer route/drawer — no new diff impl.

## State
- Zustand, in-memory, session-scoped. No localStorage (avoids stale records once backend lands).

## Visual
- Existing workspace tokens (obsidian + amber accent). Status pill: applied=emerald, partial=amber, failed=destructive, running=muted-foreground.
- Mono for path + error rows; sans elsewhere. Density matches existing chat cards.

## Verification before claiming done
1. Trigger a build → existing builder output unchanged + RunCard appears below.
2. Click RunCard → `/runs/:id` renders header, tabs, blocked cards with real `line:col` rows.
3. Failing build with 403 push → ApplyErrorCard renders above tabs, status=FAILED, counters correct.
4. Direct reload of `/runs/:id` → clean empty state, no crash.
5. `tsgo` clean.

## After this pass
User hands off the persistence packet to backend (Cursor). Once `/api/runs/:id` exists, swap `runStore.getRun` for a fetch and drop the empty-state copy — no other changes needed.
