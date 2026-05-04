# Atlas — Strategic Thinking Partner

## What It Is

Atlas is a decision enforcement system and strategic thinking partner. It is NOT a code builder — it is a system that helps founders, builders, and idea-rich people make decisions they won't regret.

**Core concept:** Atlas turns bought lessons into standard operating procedure, so you never pay for the same mistake twice. It also shows up when you don't — refusing to let potential drift.

**Original codebase:** `jochanae/atlas` on GitHub (built with Lovable + Supabase). This version is a rebuilt-and-improved implementation on Replit's stack.

## Architecture

### Stack
- **Frontend:** React + Vite (`artifacts/atlas/`) at `/` 
- **Backend:** Express 5 API server (`artifacts/api-server/`) at `/api`
- **Database:** Replit PostgreSQL via Drizzle ORM (`lib/db/`)
- **AI:** OpenAI via Replit AI Integrations (`lib/integrations-openai-ai-server/`)
- **API Contract:** OpenAPI spec + Orval codegen (`lib/api-spec/`, `lib/api-client-react/`, `lib/api-zod/`)

### Key Directories
```
artifacts/atlas/src/pages/
  home.tsx          — Front Door (mode selector, input, recent sessions)
  projects.tsx      — Project Gallery (card grid)
  workspace.tsx     — Chat + Decision Ledger split view
  ledger.tsx        — Full ledger for a project

artifacts/api-server/src/routes/
  projects.ts       — CRUD + summary stats
  sessions.ts       — Session management + message history
  entries.ts        — Decision Ledger entries
  chat.ts           — AI chat with Decision Catch Engine

lib/db/src/schema/
  projects.ts
  sessions.ts
  chat_messages.ts
  entries.ts
  conversations.ts  (OpenAI integration)
  messages.ts       (OpenAI integration)
```

## Core Features

### Decision Catch Engine
The brain of Atlas. Detects commitment language ("I'm going to...", "I'll just...", "Let's do...") and intercepts with a structured card before the user commits. Three checks:
1. **Reversibility** — Is this a one-way door?
2. **Alignment** — Does this serve the stated goal?
3. **Cost of being wrong** — What does it cost if this is the wrong call?

Implemented in `artifacts/api-server/src/routes/chat.ts` — AI detects the catch and returns `DECISION_CATCH:{...}` JSON in its response, parsed by the frontend into a Decision Catch card.

### Decision Ledger
Every committed and parked decision is stored as an Entry. Entries are grouped as:
- **Committed** — locked decisions
- **Parked** — ideas on hold
- **In Tension** — decisions with unresolved catches against them

### Modes
Think / Plan / Build / Explore / Decide / Audit — each mode changes the AI's behavior and prompt framing.

## Design Identity
- Dark mode only — volcanic theme (obsidian background, ember orange, gold accents, phosphor green)
- Geist sans-serif
- Tight radius (2-4px), high information density
- No light mode

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection (auto-provisioned)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — OpenAI proxy (Replit AI Integrations)
- `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI key (Replit AI Integrations)

## Development
```bash
# Run codegen after OpenAPI spec changes
pnpm --filter @workspace/api-spec run codegen

# Push DB schema changes
pnpm --filter @workspace/db run push

# Rebuild API server
pnpm --filter @workspace/api-server run build
```

## GitHub Reference
Original Atlas codebase: `jochanae/atlas` — built on Lovable (TanStack Start, Supabase, Supabase Edge Functions). This rebuild uses the same product vision but on Replit's native stack.

Key source files to reference for extending features:
- `ATLAS_CONSTITUTION.md` — philosophical foundation
- `POSITIONING.md` — product spec and decision rules
- `src/components/atlas/` — all original UI components
