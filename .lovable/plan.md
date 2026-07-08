## Turn D — Gut home.tsx of dead Ask Atlas state

Goal: remove all Ask Atlas remnants from `src/pages/home.tsx` (~90 references) and delete the inline shims added in Turn C. Home stays functional; sends route through `nexusChat` only.

### What gets deleted

1. **Component & shim declarations (top of file)**
   - `AskAtlasSurface` null-render const (line 32)
   - `CrystallizeSheet` null-render const (line 33)
   - `hasBuildIntent`, `triggerNexusHandoff`, `askAtlasSession` inline shims (lines 72–84)
   - `AskAtlasTitleCarousel` component (lines 114–165) — only used inside the dead surface

2. **State, refs, and streams**
   - `askAtlasConversationId` + setter + `rememberAskAtlasConversationId`
   - `askAtlasCrystallized` + setter
   - `askAtlasChat = useNexusChatStream(...)` and derived `askAtlasConversationActive`, `askAtlasBusy`
   - `askAtlasSurfaceOpen` + setter, `isAskAtlasRestoring` + setter, `askAtlasSurfaceVisible`
   - `askAtlasComposerHeight` + setter
   - `askAtlasTitleSlot` + setter, `askAtlasRestoreAttemptRef`
   - `crystallizeSheetOpen` + setter

3. **Effects & callbacks**
   - `axiom:ask-atlas` window-event listener
   - `data-axiom-ask-atlas` body-attribute effect
   - `nexusChat.clearMessages()` gate on `askAtlasSurfaceOpen`
   - `askAtlasSession.setSurfaceOpen(false)` mirror effect
   - Thread-restore effect for `askAtlasChat`
   - Composer-height measure effect (Ask Atlas branch)
   - Title-slot portal effect
   - `callAskAtlasMode` callback + all its call sites
   - `handleAskAtlasCreateProject` callback
   - Any `useCallback` deps referencing removed identifiers get pruned

4. **JSX blocks**
   - `<AskAtlasSurface ... />` (lines ~5573–5710)
   - `<CrystallizeSheet ... />` (lines ~5824–5831)
   - Header carousel wrapper (lines ~4019–4045) rendering `AskAtlasTitleCarousel` + Ask-Atlas download button

5. **Send-path simplification**
   - Drop the `askAtlasSurfaceOpen && hasAskAtlasContent` branch in the send handler; all sends go through `nexusChat`
   - Remove `if (shouldStayOnHome && !askAtlasSurfaceOpen ...) setAskAtlasSurfaceOpen(true)` branch
   - Drop `askAtlasSurfaceOpen` from opacity/pointer-events conditions on the composer chrome
   - Remove `surface !== "ask-atlas"` early return + associated open call

6. **Storage cleanup**
   - Direct `localStorage.removeItem("atlas-ask-atlas-*")` calls stay where they were inlined in Turn C; no `askAtlasSession` calls remain
   - CSS class names `.ask-atlas-inline-*` (lines ~5911–5912) removed — not referenced after JSX deletion

### What stays

- `nexusChat` stream (the surviving conversation)
- Home composer, focus states, portfolio focus, plan detection, project state
- All non-Ask-Atlas handlers and JSX

### Execution order

1. Delete top-level shims + `AskAtlasTitleCarousel`
2. Delete `askAtlasChat` stream + all Ask-Atlas state/refs/effects (biggest hunk)
3. Delete `<AskAtlasSurface>` and `<CrystallizeSheet>` JSX blocks + header carousel
4. Simplify send handler + composer condition expressions
5. Delete orphan callbacks (`callAskAtlasMode`, `handleAskAtlasCreateProject`)
6. Delete `.ask-atlas-inline-*` CSS
7. `bunx tsgo --noEmit` — fix any surfaced errors (missing deps, dangling references)

### Verification

- Typecheck clean on `home.tsx` (pre-existing unrelated errors in other files stay)
- `rg "askAtlas|AskAtlas|ask-atlas" src/pages/home.tsx` returns nothing
- Preview: home renders, composer works, sends route to workspace (existing behavior after Turn A)

### Risk & fallback

Risk is in step 4 (send handler) and useCallback dep arrays. If a regression surfaces, the fallback is to keep the `askAtlasSession` no-op shim only (~10 lines) and leave `askAtlasSurfaceOpen = false as const` — behavior is already dead, so a residual `const` is harmless.

### Technical notes

- File: `artifacts/atlas-frontend/src/pages/home.tsx` only
- No backend calls, no API contracts touched
- No other frontend files edited (UnifiedShell was cleaned in Turn C)
