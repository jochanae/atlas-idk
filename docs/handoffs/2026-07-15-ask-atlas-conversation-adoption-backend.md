# Handoff — Ask Atlas → Workspace conversation adoption (backend)

**Date:** 2026-07-15
**Target:** `artifacts/api-server/` (Express, Replit)
**Reviewer intent:** Repair the broken ownership link between an Ask Atlas
conversation and the project created from it. The workspace must render the
same thread, not a synthesized greeting.

---

## Root cause

Ask Atlas persists messages with `nexus_messages.project_id = NULL` (scoped
only by `conversation_id + user_id`). When `runCreateProjectTool` creates the
project, it linked `projects.conversation_id` but left the messages orphaned.
The workspace loads history filtered by `project_id`, finds none, and
substitutes the greeting.

---

## Fix (already applied on Lovable side; mirror in the live backend repo)

### 1. `artifacts/api-server/src/routes/nexus.ts` — `runCreateProjectTool`

Replace the standalone `UPDATE projects SET conversation_id = …` block with a
single transaction that (a) links the conversation onto the project, and
(b) adopts every orphan Ask Atlas message from that exact conversation +
user into the new project.

Both statements are idempotent by design:
- `projects.conversation_id` update is scoped to `conversation_id IS NULL`.
- `nexus_messages` update is scoped to `project_id IS NULL`
  AND `conversation_id = :effectiveConversationId`
  AND `user_id = :userId`.

Retrying handoff or project creation cannot duplicate, detach, or reassign
messages. Transaction failure throws so we never leave a project created
without its thread attached.

```ts
if (effectiveConversationId) {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE projects
        SET conversation_id = ${effectiveConversationId}
        WHERE id = ${project.id}
          AND user_id = ${userId}
          AND conversation_id IS NULL
      `);
      await tx.execute(sql`
        UPDATE nexus_messages
        SET project_id = ${project.id}
        WHERE conversation_id = ${effectiveConversationId}
          AND user_id = ${userId}
          AND project_id IS NULL
      `);
    });
  } catch (adoptErr) {
    logger.error(
      { err: String(adoptErr), projectId: project.id, conversationId: effectiveConversationId, userId },
      "Ask Atlas conversation adoption failed — project created but thread not linked",
    );
    throw adoptErr;
  }
  await flushNexusTier1BufferToProject(effectiveConversationId, project.id, userId);
}
```

### 2. `artifacts/api-server/src/routes/nexus.ts` — SSE `navigateTo` route

Prefer `/workspace/<conversationId>` when we have one so the workspace mounts
with `initialConversationId` set. Eliminates the race between navigation and
the DB adoption UPDATE — the frontend hook reads the thread via the same
`conversationId` it was routed to.

```ts
...(pendingNavProjectId !== null
  ? {
      navigateTo: {
        route: effectiveConversationId
          ? `/workspace/${effectiveConversationId}`
          : `/project/${pendingNavProjectId}`,
        projectId: pendingNavProjectId,
        projectName: pendingNavProjectName,
      },
    }
  : {}),
```

### 3. `artifacts/api-server/src/routes/projects.ts` — `GET /projects/:projectId/latest-conversation`

Fall back to `projects.conversation_id` when no project-scoped messages exist
yet. Covers the race window right after adoption and any legacy project that
was never reparented. Log every fallback so the legacy gap is tracked, not
silently forgotten.

```ts
const [project] = await db
  .select({ id: projectsTable.id, conversationId: projectsTable.conversationId })
  .from(projectsTable)
  .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
  .limit(1);
if (!project) { res.status(404).json({ error: "Project not found" }); return; }

const [row] = await db
  .select({ conversationId: nexusMessagesTable.conversationId })
  .from(nexusMessagesTable)
  .where(and(
    eq(nexusMessagesTable.projectId, projectId),
    eq(nexusMessagesTable.userId, userId),
  ))
  .orderBy(desc(nexusMessagesTable.createdAt))
  .limit(1);

const resolved = row?.conversationId ?? project.conversationId ?? null;
if (!row?.conversationId && project.conversationId) {
  logger.info(
    { projectId, conversationId: project.conversationId, userId },
    "latest-conversation: resolved via projects.conversation_id fallback (legacy or race)",
  );
}
res.json({ conversationId: resolved });
```

Add `import { logger } from "../lib/logger";` to `projects.ts` if not already
present.

---

## What was deliberately NOT changed

- **`triggerNexusHandoff` (frontend `askAtlasHelpers.ts`)** was not removed.
  It is not on the create-project path — that path is server-driven through
  `runCreateProjectTool`. The summarize-and-seed dance is dead code for
  project creation regardless; it only fires on the "open existing project"
  handler and can be pruned separately.
- No schema migration. `projects.conversation_id` and
  `nexus_messages.project_id` already exist.

---

## Acceptance tests

1. Fresh Ask Atlas conversation. Exchange ≥3 messages. Promote to project.
   Open workspace. **Entire prior thread visible in order.** No synthetic
   greeting.
2. Send one new workspace message. **Appends to the same thread.**
3. Return to Ask Atlas. **Same conversation still appears** (messages now
   carry `project_id` but the Ask Atlas view scopes by `conversation_id`, so
   this must be verified — see note below).
4. Refresh both surfaces. Continuity persists.
5. Exactly one project exists. No duplicate or seed messages.
6. Retry: simulate double-fire of project creation for the same
   `conversation_id`. Second call's adoption UPDATE affects zero rows (verify
   in `pg_stat` / logs). No duplicates, no detachment.
7. Legacy project without reparented messages: `latest-conversation` returns
   the project's `conversation_id` and emits the "legacy or race" info log.

**Note on test 3:** confirm the Ask Atlas history query does not filter by
`project_id IS NULL`. If it does, adoption will "hide" the thread from Ask
Atlas after promotion. Expected read shape: filter by `conversation_id +
user_id` only. If Ask Atlas currently filters on `project_id IS NULL`, drop
that clause as part of this ship — otherwise test 3 fails.

---

## Risk / rollback

- **Risk:** low. Both UPDATEs are tightly scoped and idempotent. Transaction
  boundary guarantees atomicity of the link.
- **Rollback:** revert the three edits. No schema change to undo. Orphaned
  messages from any successful adoption remain adopted (correct state); no
  cleanup required.

---

## Legacy migration gap (tracked, not fixed here)

Projects created before this change may have `projects.conversation_id` set
but zero `nexus_messages` rows carrying that `project_id`. The
`latest-conversation` fallback covers reads, but the messages themselves are
not reparented. A one-shot backfill can run later:

```sql
UPDATE nexus_messages nm
SET project_id = p.id
FROM projects p
WHERE nm.conversation_id = p.conversation_id
  AND nm.user_id = p.user_id
  AND nm.project_id IS NULL
  AND p.conversation_id IS NOT NULL;
```

Do not run as part of this ship. File separately once the forward path is
verified in production.
