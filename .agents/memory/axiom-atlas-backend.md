---
name: Axiom-Atlas backend migration
description: How the Axiom-Atlas Express backend is set up in the Replit monorepo and key runtime behavior
---

## Architecture

- Backend lives in `artifacts/api-server/src/` — 68 TypeScript files (45 routes, 15 lib files, middleware, etc.)
- Workspace libs: `@workspace/db` (schema), `@workspace/api-zod` (Zod schemas), `@workspace/integrations-openai-ai-server`
- DB schema: 28 tables in `lib/db/src/schema/` — these are Axiom-Atlas's schema (users, projects, sessions, entries, vault, thoughts, etc.)

## Startup behavior

- Schema is managed by `drizzle-kit push`, NOT migration files. Missing `_journal.json` is non-fatal and handled gracefully.
- `stripe-replit-sync` is externalized in build.mjs — it's a Replit system package not available in all environments. Non-fatal when missing.
- `GoogleGenAI` and `OpenAI` constructors throw at module load if API keys are undefined — fixed with `|| "not-configured"` fallback in `chat.ts` and `nexus.ts`

## API keys needed for full functionality

- `ANTHROPIC_API_KEY` — Claude AI in chat routes
- `GOOGLE_GEMINI_API_KEY` — Gemini AI in chat/nexus routes
- `OPENAI_API_KEY` — OpenAI in chat/imagine routes
- `GITHUB_TOKEN` — GitHub integration
- `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` — Stripe payments
- `RESEND_API_KEY` — Password reset emails
- `SUPER_ADMIN_EMAIL` — First user gets super_admin role if their email matches

## DB push without TTY

`drizzle-kit push` requires TTY for interactive prompts when the DB has existing tables. Use `drizzle-kit generate --name=X` to create SQL migrations, then apply directly via Node.js pg Pool.

**Why:** The Replit bash tool is non-interactive; drizzle-kit's table-conflict resolver needs a terminal.
