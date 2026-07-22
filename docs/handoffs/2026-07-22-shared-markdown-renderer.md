# Shared Markdown Renderer — 2026-07-22

## Problem

Ask Atlas and Workspace rendered assistant markdown through **two separate
component trees** with different plugins, typography, and streaming behavior.

Observable symptoms:

- Workspace streamed as **plain text** and only swapped to `MarkdownProse`
  after the message completed. Users saw a visible typography jump on the
  final tick and a wall of unformatted prose during streaming.
- Tables never rendered in Workspace (no `remark-gfm`).
- Task lists, strikethrough, autolinks: Workspace-broken.
- Inline styling for paragraphs, lists, tables, links diverged between
  surfaces; strong/em rules differed; horizontal rules and blockquotes were
  ad-hoc.

## Old render paths

| Surface   | Component                                | Plugins                | Streaming render                              |
| --------- | ---------------------------------------- | ---------------------- | --------------------------------------------- |
| Ask Atlas | `components/home/AskAtlasRenderer.tsx`   | `remark-gfm`           | Same component (progressive markdown)         |
| Workspace | `components/MessageRenderer.tsx#MarkdownProse` | `remark-breaks`  | **Plain `<span>` while streaming, then swap** |

Fenced code was also handled twice: `MessageRenderer` used a `CodeBlockCard`;
`AskAtlasRenderer` intercepted `atlas-*` fences to render conversation cards
and left the rest to raw `<pre>`.

## New shared path

Single primitive: **`components/AtlasMarkdown.tsx`**.

```
                    ┌───────────────────────────────┐
                    │      <AtlasMarkdown/>         │
                    │  • remark-gfm + remark-breaks │
                    │  • shared component map       │
                    │  • CodeBlockCard              │
                    │  • theme obsidian | parchment │
                    └───────────────┬───────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              │                                           │
   ┌──────────▼──────────┐                    ┌───────────▼──────────┐
   │  <MarkdownProse/>   │                    │ <AskAtlasRenderer/>  │
   │  MessageRenderer.tsx│                    │ home/AskAtlasRenderer│
   │  tokenize:          │                    │ tokenize:            │
   │   • file pills      │                    │  • project links     │
   │   • CitationChip    │                    │  • folder CTA        │
   │  (Workspace only)   │                    │  • file paths        │
   │                     │                    │ renderPre:           │
   │                     │                    │  • atlas-choice      │
   │                     │                    │  • atlas-clarify     │
   │                     │                    │  • atlas-action      │
   └─────────────────────┘                    └──────────────────────┘
```

`AtlasMarkdown` accepts two extension points:

- `tokenize?: (text, keyBase) => ReactNode` — transform bare string nodes.
- `renderPre?: ({ language, code, children }) => ReactNode | undefined` —
  intercept fenced code before the default `CodeBlockCard`. Returning
  `undefined` falls through.

Everything else — paragraphs, headings, lists, tables, horizontal rules,
inline code, links, task lists, strikethrough — is rendered by the shared
component map. Typography lives in `.atlas-md` rules in `index.css`.

## Retained surface-specific tokenizers

**Workspace** (`MessageRenderer.tsx`):

- File pill regex (`\b[\w-]+\.(?:tsx|ts|js|jsx|css|json|md|sql)\b`)
- `CitationChip` for `path/with/slashes.ext[:L12[-L24]]`

**Ask Atlas** (`AskAtlasRenderer.tsx`):

- Project name → dotted-underline link, dispatches `onNavigate(projectId)`
- Folder CTA phrase → solid-underline link, dispatches `onCreateProject`
- File path (`src/…`, `artifacts/…`, `packages/…`, `apps/…`) → mono chip
- `atlas-choice`, `atlas-clarify`, `atlas-action` fences → interactive cards
- Markdown `[Name](/project/123)` links → routed through `onNavigate`

## Streaming parity

`AssistantBubble.tsx` previously rendered a raw `<span className="atlas-live-stream-text">`
while `message.streaming === true` and swapped to `MarkdownProse` only after
completion.

**Now:** `MarkdownProse` renders in both states. The blinking `.atlas-cursor`
is appended as a sibling while streaming. Partial markdown resolves
progressively — code fences render as `CodeBlockCard` the moment the closing
```
```
```
token arrives, tables render as rows land, lists render as bullets appear.

Ask Atlas already used its renderer during streaming; no change needed there.

## Preserved behavior (regression watch)

- `CodeBlockCard` (copy button + collapse ≥ 8 lines)
- `ArchiveSummaryCard` (Context Ingestion header + Uploaded/Touches/Drift/Question sections)
- Internal navigation via `axiom:navigate-internal` custom event (Workspace)
- Atlas conversation cards (choice, clarify, action)
- Parchment vs obsidian theming (Ask Atlas)
- Mobile wrapping: `overflow-wrap: anywhere`, `word-break: break-word`,
  tables in `overflow-x: auto` scroll containers
- Assistant bubble typography (`.atlas-prose` wrapper: `font-size: 16.5px`,
  `line-height: 1.75`, `letter-spacing: 0.015em`) still applies — the shared
  primitive inherits it.

## Intentional remaining differences

| Aspect                       | Ask Atlas | Workspace | Reason                                       |
| ---------------------------- | --------- | --------- | -------------------------------------------- |
| Theme                        | inherits from `isParchment` prop | obsidian only | Ask Atlas hosts light/dark; Workspace is dark |
| Project name tokenization    | yes       | no        | Ask Atlas is the project selector surface     |
| Codebase citation chips      | no        | yes       | Only Workspace has committed file context     |
| atlas-* fenced cards         | yes       | no        | Conversation cards are Ask-Atlas-only         |

Nothing else diverges. If a visual difference appears between the two
surfaces on the shared markdown fixture below, it is a bug, not a design.

## Acceptance fixture

Render this same string on both surfaces and compare:

```
# Heading 1

## Heading 2

Paragraph with **bold**, *italic*, ~~strikethrough~~ and an autolink to
https://example.com plus an internal [Workspace](/project/123) link and an
inline `code` token.

- Bullet one
- Bullet two
  - Nested
- [x] Task done
- [ ] Task open

1. First
2. Second

| Col A | Col B | Col C |
| ----- | ----- | ----- |
| 1     | 2     | 3     |
| foo   | bar   | baz   |

---

​```ts
export function greet(name: string) {
  const message = `hello, ${name}`;
  console.log(message);
  return message;
}
// enough lines to exercise the collapse threshold
// line 6
// line 7
// line 8
// line 9
​```

Long unbroken token: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

File path chip: `artifacts/atlas-frontend/src/pages/workspace.tsx`
Citation: artifacts/atlas-frontend/src/pages/workspace.tsx:L42-L58
```

Manual verification points:

1. Streaming a response gains formatting progressively — no wall of
   unformatted prose until completion. Confirm by pausing the SSE at a
   partial paragraph mid-list and watching bullets pop in as each line
   completes.
2. On completion, no visible typography swap — same font, size, weight,
   spacing.
3. Ask Atlas and Workspace produce equivalent list bullets, table borders,
   code cards, horizontal rules, and link styles on the fixture above.
4. Refresh a conversation containing the fixture — historical messages
   render identically to when they streamed.

## Files touched

- **New**: `artifacts/atlas-frontend/src/components/AtlasMarkdown.tsx`
- **Refactored**: `artifacts/atlas-frontend/src/components/MessageRenderer.tsx`
  (now a thin Workspace wrapper; re-exports `MarkdownProse`,
  `StreamingMarkdown`, `CodeBlockCard`, `ArchiveSummaryCard`)
- **Refactored**: `artifacts/atlas-frontend/src/components/home/AskAtlasRenderer.tsx`
  (thin Ask Atlas wrapper)
- **Streaming fix**: `artifacts/atlas-frontend/src/components/workspace/AssistantBubble.tsx`
  — the `message.streaming` branch now renders through `MarkdownProse`
  instead of a plain `<span>`.
- **Typography tokens**: `artifacts/atlas-frontend/src/index.css` — added
  `.atlas-md` spacing rules shared by both surfaces.

## Out of scope

The workspace scroll glitch between composer and mobile footer is tracked
separately. Streaming height reflows may expose a scroll-anchor issue that
this refactor could incidentally soften — but do not close the scroll ticket
unless it demonstrably resolves.
