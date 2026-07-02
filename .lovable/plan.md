# Ask Atlas surface cleanup

Two files: `src/pages/home.tsx` and `src/components/home/AskAtlasSurface.tsx`.

## 1. Delete the empty-state hero on the Ask Atlas surface

In `AskAtlasSurface.tsx`, remove the entire `messages.length === 0` block (currently ~lines 466–560+). This kills:
- the "Ask across every project." headline
- the four intent pills: **Where were we**, **Think out loud**, **Untangle something**, **Weigh a decision**
- the surrounding wrapper

Also delete the now-unused `intents` array (lines 348–353) and `pickStarter` if only referenced by those intents (verify).

In `home.tsx` line 4058, drop the italic subtitle `"Ask across every thread."` when `askAtlasSurfaceOpen` is true.

Net effect: opening Ask Atlas shows only the "Ask Atlas." title, past messages, and the composer.

## 2. Move the download control into the header chip

Today `ASK ATLAS ↓` lives inside the scroll (`AskAtlasSurface.tsx` ~lines 400–464). The header chip (`focusChip` in `home.tsx` ~lines 5253–5299) renders `Globe + "Ask Atlas" + gold dot`.

- **Remove** the `ASK ATLAS` caption + download `<button>` block from `AskAtlasSurface.tsx` entirely.
- **Add** the download button inline in the `focusChip` in `home.tsx`, placed after the label. It should:
  - only render when `askAtlasChat.messages.length > 0`
  - reuse the same download SVG + blob logic (build `.txt` from `askAtlasChat.messages`, download, revoke URL)
  - `e.stopPropagation()` so tap doesn't trigger the chip's exit-Ask-Atlas handler

## 3. Swap the trailing gold dot for a purple pulsing dot on the LEFT

In the `focusChip` (`home.tsx` ~lines 5283–5297):
- **Remove** the trailing `<span>` gold dot after the label.
- **Remove** the `Globe` icon on the left.
- **Insert** a small pulsing purple dot on the LEFT of "Ask Atlas" (before the label), same size as the previous gold dot (5px), color `#A78BFA` / `rgb(167,139,250)` with matching purple glow, and a subtle CSS `@keyframes` pulse (opacity + box-shadow) — inline `<style>` scoped via a class on the chip is fine.

Final chip layout: `[purple pulsing dot] Ask Atlas [download icon, only when messages exist]`.

## Out of scope

- No routing, sessions, composer, or workspace changes.
- Utility buttons next to the composer (e.g. "Where were we" clock) untouched.
- No other visual redesign of the chip.
