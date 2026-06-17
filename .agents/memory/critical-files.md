---
name: Critical file protection
description: Files that must never be touched and why
---

## lib/db/src/index.ts — NEVER TOUCH

This file sets up the Drizzle DB connection and exports the `db` instance and all schema tables. It was historically broken once, causing a 3-day outage.

**What you CAN safely touch:** `lib/db/src/schema/*.ts` — the individual schema files. These are replaced wholesale with Axiom-Atlas schema files.

**Why:** The `index.ts` file wires database connection pooling and exports. Any modification risks breaking the connection for the entire app.

**How to apply:** When updating the DB schema, edit or replace files in `lib/db/src/schema/` only. Never open or edit `lib/db/src/index.ts`.

## artifacts/atlas-frontend/src/workspace.tsx — NEVER READ INTO CONTEXT

This file is 400KB+. Reading it with the `read` tool will consume most of the available context window and likely cause compression.

**Why:** It's a monolithic component with the entire workspace UI. Too large to safely handle.

**How to apply:** Use `bash cp` to copy it, or `sed -n 'X,Yp'` to read specific line ranges. Never use the `read` tool on it.
