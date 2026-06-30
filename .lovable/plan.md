## #6 — Ask Atlas handoff audit

Frontend-only. No backend changes. The current handoff (`home.tsx:4268`) always creates a new conversation with a generic seed and a backend-auto-named project. Fix the routing decision and the resulting project name.

### Files touched
- `artifacts/atlas-frontend/src/components/AskAtlasOverlay.tsx` — add two helpers: `matchRecommendedProject`, `deriveProjectTitle`.
- `artifacts/atlas-frontend/src/pages/home.tsx` — rewrite the `Continue in Workspace` `onClick` to use those helpers; add the multi-match picker UI; reuse existing `useListProjects` + `useUpdateProject`.

### Behavior

1. On tap of **Continue in Workspace**:
   - Run `matchRecommendedProject(askAtlasChat.messages, projects)`.
   - Scoring: tokenize each project name (drop stopwords, lowercase, strip punctuation). For each project, score = number of distinct name tokens (≥3 chars) that appear in the Ask Atlas thread text (last 8 messages). Bonus for full-name substring match (case-insensitive, word-boundary). Confident = score ≥ ceil(nameTokens × 0.6) **and** score ≥ 2, OR full-name substring hit.

2. **Exactly one confident match** → look up its most recent conversation via existing `useListSessions(projectId)` query (lazy fetch on tap) and navigate to `/workspace/{conversationId}`. No new project created, no rename. Header already surfaces the existing name via `activeProject`.

3. **Multiple confident matches** → render a small inline picker below the handoff button: "Atlas mentioned a few of your projects. Which one?" with up to 3 chips. Tap → routes to that project as in (2). No auto-decision.

4. **Zero matches** → derive title with `deriveProjectTitle(askAtlasChat.messages)`:
   - Concatenate all user + assistant text from the thread.
   - Lowercase, strip URLs/punctuation, tokenize.
   - Drop stopwords + Atlas filler ("atlas", "build", "help", "think", "want", "need", etc.).
   - Score remaining tokens by `tf × idf-lite` where idf-lite penalizes tokens that are also Atlas filler.
   - Pick top 3–5 distinct content tokens, preserve original casing from first occurrence, join with spaces.
   - Fallback if score is too thin: trim the first user message to ~6 words, strip leading "I think I should/Help me/Can you".
   - Hard cap 48 chars.
   - Then: POST `/api/conversations` as today, but after success run `useUpdateProject().mutate({ id: projectId, data: { name: derivedTitle } })` before navigating. Navigation waits for the rename to resolve (with a 1.5 s timeout fallback) so the workspace header renders the right name on first paint.

5. Existing seed text still flows as `initialMessage` so the workspace conversation opens with full Ask Atlas context.

### Edge cases
- Anonymous / empty projects list → skip matching, go straight to create-and-rename.
- Rename PATCH fails → log, still navigate (project keeps backend-auto name; non-blocking).
- Multi-match picker dismissable by tapping outside or toggling Ask Atlas off.
- Matching is case-insensitive and ignores accents via `.normalize("NFKD")`.

### Out of scope
- No LLM-powered title generation (would need backend route — out of lane).
- No alias table for projects (future).
- No changes to workspace chrome or header rendering.

### Verification
- Manual: create 2 fake projects ("Quinn Strategy", "Bloom Roadmap"). Ask Atlas thread mentions Quinn → tap handoff → lands in Quinn workspace, header shows "Quinn Strategy". Mentions both → picker appears. Mentions neither, topic "food donation app" → new project named e.g. "Food Donation App", header shows it on landing.
- Typecheck must pass.
