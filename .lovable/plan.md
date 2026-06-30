## Flat Send-to sheet, one tap to select

**Behavior**
- Pill: `Send to · <Selected>` (default: Workspace)
- Tap pill → one sheet, flat list, no sections
- Tap any row → check appears on that row, pill updates immediately, sheet dismisses ~150ms later

**List order**
1. Workspace
2. Ask Atlas
3. Parking Lot
4. — divider —
5. Each project by name

Selecting a project = "Workspace, scoped to that project" (same payload as the old ABOUT picker).

**File**
`artifacts/atlas-frontend/src/pages/home.tsx`
- Remove `showProjectSubPicker` state + the secondary `createPortal` sub-sheet.
- Remove WHERE / ABOUT / Context headers and the "Choose a project…" row.
- Replace sheet body with one `.map()` over `[Workspace, Ask Atlas, Parking Lot, divider, ...projects]`.
- Row layout: label left, `Check` icon right when selected.
- onClick: `setSendTo(id)` (pill updates same frame) → `setTimeout(() => setShowSendToPicker(false), 150)`.

**Out of scope:** no backend, no `ComposerActions` changes, no workspace changes.
