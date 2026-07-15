## Library IA rebuild — v2 (attach-chooser optimized)

Frontend-only. Backend `/api/library` already returns `kind`, `origin`, `project`, `title`, `preview`, `content` — we're rendering what's there. No schema work.

### Governing intent
This surface is a **retrieval chooser**, not a management center. The one job:
> Find something and bring it into this conversation.
Renaming, versioning, bulk ops, view toggles, and thumbnails belong to the future full Library route. Not here.

### What ships

**1. Rename Reference → Library**
- Tab label and any user-visible copy.
- Empty state (kind-neutral):
  > Nothing in your Library yet.
  > Bookmarked responses and generated work will appear here.

**2. Object-type identity on every row**
New pure module `components/library/kindMeta.ts` maps each `LibraryItemKind` → `{ icon, typeLabel, group }`.

Item type stays **specific** even when the group is broad:
- `prd` → "Product Requirements Document" (group: Documents)
- `strategy` → "Strategy" (group: Documents)
- `spec` → "Specification" (group: Documents)
- `plan` / `outline` / `brief` → own label, group Documents
- `bookmark` → "Conversation Bookmark" (group: Bookmarks)
- `sketch` → "Sketch" (group: Sketches)
- `document` / `other` → "Document" / "Reference" (group: Documents / Other)

Row layout:
```text
[icon]  CONVERSATION BOOKMARK · Family Reunion Planning
        Review existing files before implementation
        Saved from Ask Atlas · Jul 15
```
Origin phrase built from `item.origin.source` + `item.project?.name`.

**3. Stable structure — no layout that reshapes as content grows**
Always the same shape, top to bottom:
1. Search input (client-side filter over `title` + `preview`)
2. Compact type filter chips: `All · Bookmarks · Documents · Sketches` (+ `Other` only when items of that group exist)
3. Item list, grouped by kind-group with count headers; groups render only when they contain items but the overall structure never toggles between "flat" and "grouped" modes.

Above the list, a summary row:
```text
LIBRARY · 12 items
```

No list/grid view toggle. No thumbnails. Search + filter is the investment.

**4. Project-aware loading**
- Focus = All Projects → `fetchLibraryItems({})` (everything accessible).
- Focus = a specific project → `fetchLibraryItems({ projectId })`; show a subtle "Showing items in {projectName}" line with a `Show all Library items` link that re-fetches without the scope. Preserves current behavior but makes the scope visible.

**5. Attached state = persisted, not local**
- Gold border/chip and the `In conversation` label are driven by `attachedIds` (already fetched from `GET /api/conversations/:id/context` in `home.tsx`).
- Primary action toggles:
  - Not attached → `Bring into conversation` (calls `attachLibraryItem`, closes sheet).
  - Attached → `Remove from conversation` (calls `detachLibraryItem`, keeps sheet open, updates chip).
- `LibraryAttachmentsBar` chip swaps its generic tag for the kind icon + short type label so the two surfaces read the same.

**6. Detail view — real hierarchy, no raw JSON**
Consistent order:
```text
[TYPE label chip]
{Title (truncated, single line + tooltip if long)}
Saved from {origin} · {project} · {date}
{preview / content}
[Bring into conversation | Remove from conversation]  [Copy]  [Delete]
```

Title rule: use `item.title` if present and ≤ 80 chars; otherwise derive a short heading from the first sentence of `preview` (max 80 chars, ellipsis). Never render a whole response paragraph as an `<h1>`.

Content rule (kills the `{}` leak, no raw JSON exposed):
- Missing / empty string / `{}` / `[]` → render nothing.
- String → render as prose with preserved whitespace (no code frame).
- Parses as JSON → render only the `preview` snippet + `Preview unavailable for this item type`. No pretty-printed JSON, no monospace dump.
- Recognized kinds can get bespoke renderers later; not in this shipment.

**7. Mount flicker fix**
- Backdrop mounts at opacity 0 and fades in over 120ms with no `backdrop-filter` during the enter; blur re-applies on animation end.
- Sheet slide-up starts at `60ms` delay so the backdrop is already opaque when the sheet moves.
- `will-change: transform, opacity` on the sheet.

### Files touched
- `artifacts/atlas-frontend/src/components/library/kindMeta.ts` *(new)* — icons + labels + groups.
- `artifacts/atlas-frontend/src/components/AskAtlasFocusSheet.tsx` — tab rename, search + filter chips, grouped list with counts, project-scope banner, action swap, sanitized detail view, backdrop/sheet enter sequence.
- `artifacts/atlas-frontend/src/components/LibraryAttachmentsBar.tsx` — kind icon + type label on chips.

### Explicitly NOT in scope
- Backend / `LibraryItemKind` additions (Decision, File, Image) — separate handoff.
- Full Library route with management, versioning, bulk ops, thumbnail/gallery view.
- Turn D dead-state cleanup in `home.tsx`.
- Workspace Outputs surface — stays as-is; the two remain intentionally different (manage vs. recall).
