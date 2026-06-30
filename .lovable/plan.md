# Cohesion Pass — Workspace Gap + Atlas-First Language (v2)

Frontend-only. No backend, no payload changes. Three wording refinements applied from feedback: **"Send to"** instead of Scope, **"Capturing intent…"** preserved, Ask Atlas explicitly ephemeral with a **Continue in Workspace** handoff.

---

## 1. Workspace composer — fix the gap + actually collapse

**Workspace only (not home). Two bugs:**

- **Gap when quiet-updates footer collapses.** Composer doesn't grow into the freed space. Likely a fixed grid row or a hardcoded `bottom: <dock-height>` offset. Fix: make the chat/composer column `flex-1 min-h-0` and let the composer container grow. Use the dock's actual rendered height (or zero when collapsed), never a constant.
- **Chevron "collapse" doesn't visibly collapse.** Toggle flips `userComposerPreference` in `shellStore`, but `ChatComposer` compact mode only hides sub-controls — textarea + outer container keep the same height. Fix: in compact mode force textarea `rows=1` with no auto-grow, drop vertical padding, and shrink the outer min-height to ~44px. Verify by toggling and watching the composer actually shrink.

Files: `src/pages/workspace.tsx`, `src/components/workspace/ChatComposer.tsx`, the quiet-updates footer component.

---

## 2. Atlas thinking state — strip insider language, keep the voice

In `AtlasThinkingBlock.tsx` default visible state:
- Remove `MULTI` badge and `JUST NOW` timestamp.
- **Keep `Capturing intent…`** — do not rename to `Thinking…`.
- Default reads: `ATLAS` then `Capturing intent…` (or current phase label).
- Model count, multi-agent indicator, and timestamp move into the existing "tap to inspect" drawer.

---

## 3. Home — hide the resume line once composer is focused

Home renders `Continue "<project>" · 6m ago →` above the composer. Keep as-is by default. When the composer gains focus (or `shellMode === 'active'`), fade it (opacity 0, height 0, ~200ms). Restores on blur with empty draft.

---

## 4. Home composer — "Send to" pill (replaces Focus • All)

- Hide the current `Focus • All` control by default.
- When composer is focused, show a single pill on the composer header: **`Send to • Workspace ▾`**.
- Dropdown options:
  - **Workspace** (default — type and go, creates a project conversation as today)
  - **Ask Atlas** (opens lightweight overlay — see #5)
  - **Parking Lot**
- Default path is unchanged: type + send → workspace. The pill is an explicit override.

Naming locked: **Send to**, not Scope / Destination / Route.

---

## 5. Ask Atlas — ephemeral overlay with explicit workspace handoff

New component `AskAtlasOverlay.tsx`. Triggered from the Send to pill and from the radial menu (#6).

**Behavior:**
- Bottom sheet / centered overlay (mobile-first). Not a route. Not a workspace.
- Single composer + streamed reply. Reuses the existing chat stream hook against the existing portfolio/Atlas endpoint — no new endpoint.
- Top-right: clock icon → Conversation History (#7).
- Conversations from this overlay persist through existing conversation save path with `project_id = null` as the Atlas-portfolio marker. No schema change.

**Mental-model guardrail (locked):**
> Ask Atlas is intentionally **ephemeral**. It is for portfolio reasoning, exploration, and strategy — **not project building**. If the conversation evolves into implementation, Atlas surfaces a clear **"Continue in Workspace"** action that transfers context into a project conversation.

**Concrete implementation of the guardrail:**
- After each Atlas response in the overlay, if the assistant message contains build/implementation intent (reuse existing WhisperGate `BUILD` classification if exposed client-side; otherwise a simple keyword pass on phrases like "let's build", "implement", "scaffold", "create the…"), render a single inline action: **`→ Continue in Workspace`**.
- Tap → close overlay, create/open a project workspace, seed the new workspace's first message with the Ask Atlas thread context (last N messages serialized into the workspace's initial conversation). Uses existing project-create flow; no new endpoint.
- No file editing, no Builder actions, no Forge buttons inside the overlay — ever. This is the architectural boundary.

---

## 6. Radial menu — rename "Conversations" → "Ask Atlas"

Single label + icon swap. Icon: gold "A" mark (reuse existing Atlas glyph) instead of the generic chat bubble. Tap opens the Ask Atlas overlay from #5 — not the history list.

---

## 7. Conversation History — reorganize

Currently grouped by project, titles read `Session 1`. Rework the existing history screen (now reached via the clock icon **inside Ask Atlas**, not a top-level destination):

- **Group by recency:** `Today` / `Yesterday` / `Earlier`.
- **Pinned top section:** `⭐ Atlas Portfolio` — entries where `project_id === null` (Ask Atlas conversations).
- **Per-row project badge:** small colored dot + project name (or `Atlas` for portfolio entries).
- **Smart titles:** replace `Session N` with the first user message, truncated ~48 chars. Pure client-side derivation; fallback to `Session N` only if no messages.

---

## Architectural boundaries this pass reinforces

| Surface     | Intent              |
|-------------|---------------------|
| Workspace   | "I am building."    |
| Ask Atlas   | "I am thinking."    |
| Parking Lot | "I am saving for later." |

Every UI label in this pass must reinforce that separation. **Send to** names the routing decision. **Capturing intent** keeps Atlas's voice. **Continue in Workspace** protects Ask Atlas from drifting into a second workspace.

---

## Explicitly NOT in this pass

- Drawer filter rename (Recent/Active/Archived).
- Multi-repo reasoning, design-sketch flow.
- Dashboard portfolio status line.
- Any backend, schema, or endpoint change.
- Renaming Hydrate again, flow map colors, lens copy.
- Any Builder/Forge/file-edit affordance inside Ask Atlas.

---

## Suggested ship order

1, 2, 3 first (smallest, highest visible polish) → 4, 5, 6 together (Ask Atlas is one coherent surface) → 7 last (depends on #5's clock-icon entry point).

Exact file paths confirmed by reading at build time before editing.
