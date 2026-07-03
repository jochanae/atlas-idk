import { Router, type IRouter } from "express";
import { eq, sql, and, desc, isNotNull } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { upsertEmbedding } from "../lib/embeddings";
import { z } from "zod";
import { db, sessionsTable, chatMessagesTable, projectsTable, imageVersionsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import {
  CreateSessionBody,
  CreateSessionParams,
  GetSessionParams,
  DeleteSessionParams,
  ListSessionsParams,
  ListMessagesParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const UpdateSessionTitleBody = z.object({
  title: z.string(),
});

// ── Minimal memory types (mirrors chat.ts) ───────────────────────────────────
interface MemoryEntry {
  tier: 1 | 2 | 3 | 4 | 5;
  text: string;
  createdAt: string;
  retrievalCount: number;
  lastRetrievedAt: string | null;
}
interface MemoryStore { v: 2; entries: MemoryEntry[]; }

function parseMemoryStore(raw: string | null): MemoryStore {
  if (!raw) return { v: 2, entries: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.v === 2 && Array.isArray(parsed.entries)) return parsed as MemoryStore;
    return { v: 2, entries: [] };
  } catch { return { v: 2, entries: [] }; }
}

function appendSessionSummary(store: MemoryStore, text: string): MemoryStore {
  const entry: MemoryEntry = {
    tier: 3, text,
    createdAt: new Date().toISOString(),
    retrievalCount: 0,
    lastRetrievedAt: null,
  };
  return { ...store, entries: [...store.entries, entry] };
}

function serializeMessage(m: typeof chatMessagesTable.$inferSelect) {
  return {
    ...m,
    costUsd: m.costUsd == null ? null : Number(m.costUsd),
    createdAt: m.createdAt.toISOString(),
  };
}

// Verify that a project exists and is owned by the given userId.
async function projectBelongsToUser(projectId: number, userId: number): Promise<boolean> {
  const rows = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

// Resolve the projectId for a session and verify ownership.
async function sessionBelongsToUser(sessionId: number, userId: number): Promise<boolean> {
  const rows = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .innerJoin(projectsTable, eq(sessionsTable.projectId, projectsTable.id))
    .where(and(eq(sessionsTable.id, sessionId), eq(projectsTable.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

router.get("/projects/:projectId/sessions", async (req, res): Promise<void> => {
  const params = ListSessionsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const userId = (req as any).authUser.id as number;
  if (!(await projectBelongsToUser(params.data.projectId, userId))) {
    res.status(404).json({ error: "Project not found" }); return;
  }
  const allSessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.projectId, params.data.projectId))
    .orderBy(sessionsTable.updatedAt);

  // Temporary safeguard: hide legacy placeholder sessions that have no messages.
  // Preserve any session that carries a buildIntent (create-and-activate sessions
  // intentionally start blank and need to be visible so the workspace can find them).
  const LEGACY_NAMED_PLACEHOLDERS = new Set(["Session 1", "Session"]);
  const sessions = allSessions.filter(s => {
    const title = (s.title ?? "").trim();
    const msgCount = (s.messageCount ?? 0);
    const hasBuildIntent = Boolean((s as any).buildIntent);
    if (hasBuildIntent) return true;
    if (LEGACY_NAMED_PLACEHOLDERS.has(title) && msgCount === 0) return false;
    if (title === "" && msgCount === 0) return false;
    return true;
  });

  res.json(sessions.map(s => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  })));
});

router.post("/projects/:projectId/sessions", async (req, res): Promise<void> => {
  const params = CreateSessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const userId = (req as any).authUser.id as number;
  if (!(await projectBelongsToUser(params.data.projectId, userId))) {
    res.status(404).json({ error: "Project not found" }); return;
  }
  const { seedMessage, seedIntentType, ...sessionFields } = parsed.data;
  let session: typeof sessionsTable.$inferSelect | undefined;
  try {
    [session] = await db.insert(sessionsTable).values({
      projectId: params.data.projectId,
      ...sessionFields,
    }).returning();
  } catch (dbErr: any) {
    const errMsg = dbErr?.message ?? "";
    const isMissingColumn = errMsg.includes("column") && errMsg.includes("does not exist");
    if (isMissingColumn) {
      logger.warn({ dbErr: errMsg }, "DB schema behind on session insert — falling back to core insert");
      [session] = await db.insert(sessionsTable).values({
        projectId: params.data.projectId,
        title: (sessionFields as any).title ?? "Untitled",
      }).returning();
    } else {
      throw dbErr;
    }
  }
  if (seedMessage && seedMessage.trim().length > 0) {
    try {
      await db.insert(chatMessagesTable).values({
        sessionId: session.id,
        role: "assistant",
        content: seedMessage,
        intentType: seedIntentType ?? "handover_snapshot",
      });
    } catch (dbErr: any) {
      const errMsg = dbErr?.message ?? "";
      const isMissingColumn = errMsg.includes("column") && errMsg.includes("does not exist");
      if (isMissingColumn) {
        logger.warn({ dbErr: errMsg }, "DB schema behind on seed message insert — falling back to core insert");
        await db.insert(chatMessagesTable).values({
          sessionId: session.id,
          role: "assistant",
          content: seedMessage,
        });
      } else {
        throw dbErr;
      }
    }
    await db
      .update(sessionsTable)
      .set({ messageCount: sql`${sessionsTable.messageCount} + 1` })
      .where(eq(sessionsTable.id, session.id));
  }
  res.status(201).json({
    ...session,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  });

  // Fire-and-forget: index embedding for semantic search (V4)
  void upsertEmbedding({
    entityType: "session",
    entityId: session.id,
    userId,
    projectId: params.data.projectId,
    content: [session.title, (session as any).buildIntent].filter(Boolean).join("\n"),
  }).catch(() => { /* silent */ });
});

router.get("/sessions/:id", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const userId = (req as any).authUser.id as number;
  if (!(await sessionBelongsToUser(params.data.id, userId))) {
    res.status(404).json({ error: "Session not found" }); return;
  }
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.sessionId, params.data.id))
    .orderBy(chatMessagesTable.createdAt);
  res.json({
    session: {
      ...session,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    },
    messages: messages.map(serializeMessage),
  });
});

router.patch("/sessions/:id", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateSessionTitleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const userId = (req as any).authUser.id as number;
  const [session] = await db
    .update(sessionsTable)
    .set({ title: parsed.data.title })
    .where(and(
      eq(sessionsTable.id, params.data.id),
      sql`exists (
        select 1
        from ${projectsTable}
        where ${projectsTable.id} = ${sessionsTable.projectId}
          and ${projectsTable.userId} = ${userId}
      )`,
    ))
    .returning({ id: sessionsTable.id, title: sessionsTable.title });

  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  res.json(session);
});

router.delete("/sessions/:id", async (req, res): Promise<void> => {
  const params = DeleteSessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const userId = (req as any).authUser.id as number;
  if (!(await sessionBelongsToUser(params.data.id, userId))) {
    res.status(404).json({ error: "Session not found" }); return;
  }
  await db.delete(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/sessions/:id/reflection-mode", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const enabled = (req.body as { enabled?: unknown })?.enabled;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled boolean is required" });
    return;
  }

  const userId = (req as any).authUser.id as number;
  if (!(await sessionBelongsToUser(params.data.id, userId))) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [session] = await db
    .update(sessionsTable)
    .set({ reflectionMode: enabled })
    .where(eq(sessionsTable.id, params.data.id))
    .returning();

  res.json({
    ...session,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  });
});

router.post("/sessions/:id/idea-mode", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const enabled = (req.body as { enabled?: unknown })?.enabled;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled boolean is required" });
    return;
  }

  const userId = (req as any).authUser.id as number;
  if (!(await sessionBelongsToUser(params.data.id, userId))) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [session] = await db
    .update(sessionsTable)
    .set({ ideaMode: enabled })
    .where(eq(sessionsTable.id, params.data.id))
    .returning();

  res.json({
    ...session,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  });
});

router.get("/sessions/:sessionId/messages", async (req, res): Promise<void> => {
  const params = ListMessagesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const userId = (req as any).authUser.id as number;
  if (!(await sessionBelongsToUser(params.data.sessionId, userId))) {
    res.status(404).json({ error: "Session not found" }); return;
  }
  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.sessionId, params.data.sessionId))
    .orderBy(chatMessagesTable.createdAt);
  res.json(messages.map(serializeMessage));
});

// POST /sessions/:id/messages — persist a synthetic assistant trace message (Forge, Flow hydration, etc.)
// This is a lightweight path for system-initiated actions that must leave a conversation record.
router.post("/sessions/:id/messages", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const userId = (req as any).authUser.id as number;
  if (!(await sessionBelongsToUser(params.data.id, userId))) {
    res.status(404).json({ error: "Session not found" }); return;
  }
  const body = z.object({
    role: z.enum(["assistant", "system"]),
    content: z.string().min(1).max(2000),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [saved] = await db
    .insert(chatMessagesTable)
    .values({ sessionId: params.data.id, role: body.data.role, content: body.data.content })
    .returning();
  res.json(serializeMessage(saved));
});

// GET /sessions/:sessionId/image-versions — list all persisted image versions for a session
router.get("/sessions/:sessionId/image-versions", async (req, res): Promise<void> => {
  const params = ListMessagesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const userId = (req as any).authUser.id as number;
  if (!(await sessionBelongsToUser(params.data.sessionId, userId))) {
    res.status(404).json({ error: "Session not found" }); return;
  }
  const versions = await db
    .select()
    .from(imageVersionsTable)
    .where(eq(imageVersionsTable.sessionId, params.data.sessionId))
    .orderBy(imageVersionsTable.createdAt);
  res.json(versions.map((v) => ({
    id: v.id,
    messageId: v.messageId,
    parentVersionId: v.parentVersionId,
    prompt: v.prompt,
    imageB64: v.imageB64,
    imageMimeType: v.imageMimeType,
    model: v.model,
    mode: v.mode,
    createdAt: v.createdAt.toISOString(),
  })));
});

// GET /projects/:projectId/images — list AI-generated images for a project (from imageVersionsTable)
router.get("/projects/:projectId/images", async (req, res): Promise<void> => {
  const projectId = Number(req.params.projectId);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    res.status(400).json({ error: "Invalid projectId" }); return;
  }
  const userId = (req as any).authUser.id as number;
  const [proj] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);
  if (!proj) { res.status(404).json({ error: "Project not found" }); return; }

  const versions = await db
    .select()
    .from(imageVersionsTable)
    .where(eq(imageVersionsTable.projectId, projectId))
    .orderBy(desc(imageVersionsTable.createdAt));

  res.json({
    images: versions.map((v) => ({
      id: v.id,
      prompt: v.prompt,
      imageB64: v.imageB64,
      imageMimeType: v.imageMimeType,
      model: v.model,
      mode: v.mode,
      sessionId: v.sessionId,
      messageId: v.messageId,
      createdAt: v.createdAt.toISOString(),
    })),
  });
});

// POST /sessions/:id/summarize — write a session memory snapshot to project memory.
// Called automatically by the frontend when the user navigates away (visibilitychange).
router.post("/sessions/:id/summarize", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const userId = (req as any).authUser.id as number;
  if (!(await sessionBelongsToUser(params.data.id, userId))) {
    res.status(404).json({ error: "Session not found" }); return;
  }

  // Load session to get projectId
  const [session] = await db.select({ projectId: sessionsTable.projectId })
    .from(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  // Load last 30 messages (most recent first, then reverse for chronological)
  const rows = await db
    .select({ role: chatMessagesTable.role, content: chatMessagesTable.content })
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.sessionId, params.data.id))
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(30);

  const assistantCount = rows.filter(m => m.role === "assistant").length;
  if (assistantCount < 2) { res.json({ ok: true, skipped: "too few messages" }); return; }

  const transcript = rows.reverse()
    .map(m => `${m.role === "user" ? "You" : "Atlas"}: ${m.content.slice(0, 500)}`)
    .join("\n\n");

  // Load current project memory
  const [project] = await db
    .select({ memory: projectsTable.memory })
    .from(projectsTable)
    .where(eq(projectsTable.id, session.projectId))
    .limit(1);
  const store = parseMemoryStore(project?.memory ?? null);

  // Ask Claude Haiku to write a tight session summary
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const aiRes = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    messages: [{
      role: "user",
      content: `You are the memory layer of Atlas, a strategic AI partner. Write a 2-3 sentence session summary covering: (1) what was discussed or built, (2) any decisions made, (3) the logical next step. Be specific. Past tense. No markdown, no bullets.\n\nSession:\n${transcript}`,
    }],
  });

  const rawSummary = (aiRes.content[0] as { type: "text"; text: string }).text.trim();
  const label = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const summary = `[Session ${label}] ${rawSummary}`;

  const updatedStore = appendSessionSummary(store, summary);
  await db
    .update(projectsTable)
    .set({ memory: JSON.stringify(updatedStore) })
    .where(eq(projectsTable.id, session.projectId));

  res.json({ ok: true, summary });
});

export default router;
