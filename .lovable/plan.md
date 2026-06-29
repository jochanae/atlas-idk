
# Launcher rebuild + Aura relocation + Arch audit

Three coordinated changes. Frontend only.

---

## 1. Arch audit & removal

The full-screen arch glow (screenshot 1) is the wrong implementation of the aura concept. It shows on some routes, not others.

- Grep the codebase for the arch component (likely a fixed-position SVG/gradient overlay).
- List every route/layout it currently renders in.
- Remove it entirely. Aura moves to the composer (see §2).
- Verify no route now has a broken empty wrapper where it sat.

---

## 2. Aura → composer border, color-coded by intent

The aura belongs *on* the PromptInput, as a soft animated border glow — not on the page.

**Color mapping (tied to WhisperGate intent):**

| Intent              | Vocabulary state     | Glow color (token)   |
| ------------------- | -------------------- | -------------------- |
| THINK               | In Motion            | cool blue / cyan     |
| DECIDE              | Under Consideration  | amber                |
| BUILD               | Committed            | green                |
| Conflict (Catch)    | In Tension           | red/orange pulse     |
| Idle / no signal    | —                    | neutral, very low α  |

**Behavior:**
- Glow lives on the composer's outer border via a layered `::after` or absolutely-positioned blurred element.
- Color updates as WhisperGate classifies the in-progress input (debounced).
- During streaming Atlas reply, glow reflects the response's mode, not the input.
- Animation is slow breathing (~3s), low opacity. No strobe.
- Define glow colors as semantic tokens in `index.css` (`--aura-think`, `--aura-decide`, `--aura-commit`, `--aura-tension`).

---

## 3. Radial launcher rebuild

Center button (the "A") on mobile footer. On desktop, surface via keyboard shortcut + a launcher trigger in the header (TBD which corner).

**Final 6 items — all overlays, none navigate:**

```text
          Search
   Capture        Decisions
          Atlas
  Conversations   Files
          Settings
```

**Item contracts:**

| Item          | Opens as            | Notes                                                  |
| ------------- | ------------------- | ------------------------------------------------------ |
| Search        | Overlay (cmd-K style) | Global search across conversations, decisions, files |
| Capture       | Modal               | Quick-add note → lands in Parking Lot                  |
| Decisions     | Drawer              | Same component as mobile footer Decisions tab + drawer |
| Conversations | Drawer              | Renamed from Projects; same drawer we just reorganized |
| Files         | Drawer              | Existing FileTreeDrawer                                |
| Settings      | Overlay             | Existing settings surface                              |

**Removed from launcher (with reason):**
- Home / Global Insights / Workspace — you're already there; launcher never navigates.
- Resume — Home's "Continue where you left off" covers it.
- Parking Lot as a separate item — merged into Capture (one verb, lands in the same place).
- Memory / Map / Code / Build — kept *contextual*, surfaced inside the conversation when relevant. Putting them in the launcher rebuilds the destination grid.

**Visual fixes (from screenshot 4 — partial implementation):**
- Complete the connecting orbit ring between satellites.
- Restore the inner particle field linking center to satellites.
- Each satellite gets a tap target ≥44px and a clear label.
- Closing the launcher animates back into the center button (reverse burst).

---

## Sequence

1. Arch audit + removal (smallest, unblocks the aura work).
2. Aura tokens + composer border glow (static colors first, then wire to WhisperGate).
3. Launcher rebuild: rename Projects→Conversations, swap item set, fix visuals, wire each to its overlay/drawer.

## Out of scope (call out now)

- WhisperGate classification logic itself — using existing classifier; only consuming its output.
- Desktop launcher trigger placement — needs a separate quick decision before step 3.
- Any backend changes — none required.

## Open question before I start

Desktop: where does the launcher trigger live? Options: (a) floating button bottom-right, (b) header icon, (c) keyboard shortcut only (no visible trigger). Pick one and I'll wire it.
