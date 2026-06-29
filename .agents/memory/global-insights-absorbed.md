---
name: Global Insights Absorbed Into Workspace
description: Product decision to dissolve Global Insights as a separate surface and inject portfolio intelligence into every workspace chat conversation.
---

## The Decision
Global Insights is no longer a separate page/surface. Portfolio awareness lives in Atlas's context injection inside the workspace (chat.ts).

**Why:** The conversation is the primary entity, not the project. The workspace is the application. Routing users to a different page for portfolio questions creates friction and contradicts the single-conversation model.

## What Was Injected Into chat.ts
Added a "Portfolio Intelligence" block that fires on every workspace request when `portfolioRows.length > 0` and `!isSelfContainedBuild`:

1. **Aggregated memory** — tiers 1-3 from each project's memory store, formatted per-project. Zero extra DB queries (uses already-fetched portfolioRows.memory).
2. **Portfolio health stats** — sessions this week, total committed decisions, violations, total projects. 4 DB queries in a single `Promise.all`.
3. **Recent activity** — sessions across all projects in the last 7 days, formatted narratively.

Cross-portfolio committed decisions (from the `isPortfolioQuestion` regex path) remain gated — they're larger and only fetched on explicit portfolio questions.

## System Prompt Update
`DEV_SYSTEM_PROMPT` updated: removed stale "Global" reference, added explicit statement that Atlas has portfolio-level awareness in every workspace conversation.

**How to apply:** When adding new context sources (e.g. GitHub commits across portfolio), add them to the same `Promise.all` block in the Portfolio Intelligence section of chat.ts (~line 3001). Keep it non-fatal (wrapped in try/catch).

## Next Steps Not Yet Built
- Homepage Send → workspace navigation (conversation-first routing). Homepage is entry point; workspace is the application.
- Conversation as root DB entity (currently project_id is root; conversation_id is conceptually primary but not yet restructured).
- Global Insights route redirect to workspace.
