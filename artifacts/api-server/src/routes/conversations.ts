import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { db, projectsTable, nexusMessagesTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

async function generateConversationTitle(projectId: number, message: string): Promise<string | null> {
  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 40,
      messages: [
        {
          role: "user",
          content: `Write a concise 3–7 word title for a project started with this message. No quotes, no trailing punctuation, be specific:\n\n"${message.slice(0, 500)}"`,
        },
      ],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : null;
    const title = raw?.replace(/^["']|["']$/g, "").replace(/[.!?]+$/, "").slice(0, 80) ?? null;
    if (title) {
      await db.update(projectsTable).set({ name: title }).where(eq(projectsTable.id, projectId));
    }
    return title;
  } catch (err) {
    logger.warn({ err, projectId }, "conversations: title generation failed — non-fatal, falling back to placeholder name");
    return null;
  }
}

async function persistFirstUserMessage(
  userId: number,
  projectId: number,
  conversationId: string,
  content: string,
): Promise<void> {
  const base = { userId, role: "user" as const, content, projectId, conversationId };
  try {
    await db.insert(nexusMessagesTable).values({ ...base, messageType: "message" });
  } catch (err: any) {
    const msg = err?.message ?? "";
    if (msg.includes("column") && msg.includes("does not exist")) {
      await db.insert(nexusMessagesTable).values(base).catch(() => {});
    } else {
      logger.warn({ err, projectId }, "conversations: first user message persist failed — non-fatal");
    }
  }
}

const INITIAL_ATLAS_SYSTEM_PROMPT = `You are Joy, a strategic thinking partner helping builders create meaningful software.

This is the very first message in a brand-new project workspace. The user just described their idea.

Your job:
- Engage immediately with what they're building — be specific to their description, not generic
- Surface the most important open question or tension that will shape this project
- Move the conversation toward clarity on the ONE thing that matters most right now
- Tone: direct and builder-oriented, like a trusted co-founder sitting next to them

Format: 2–4 short paragraphs. End with exactly ONE focused question.

Rules:
- Do NOT open with a greeting or introduction
- Do NOT say "Great idea!" or give generic affirmations  
- Do NOT recap their description back to them
- Be specific — name the actual challenge, user, or decision they need to wrestle with`;

async function generateInitialAtlasResponse(
  userId: number,
  projectId: number,
  conversationId: string,
  userMessage: string,
): Promise<void> {
  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: INITIAL_ATLAS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const content = response.content[0]?.type === "text" ? response.content[0].text.trim() : null;
    if (!content) return;

    const base = { userId, role: "assistant" as const, content, projectId, conversationId };
    try {
      await db.insert(nexusMessagesTable).values({ ...base, messageType: "message" });
      logger.info({ projectId, conversationId }, "conversations: background first-turn Atlas response saved");
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.includes("column") && msg.includes("does not exist")) {
        await db.insert(nexusMessagesTable).values(base).catch(() => {});
      } else {
        throw err;
      }
    }
  } catch (err) {
    logger.warn({ err, projectId }, "conversations: background first-turn Atlas response failed — non-fatal");
  }
}

router.post("/conversations", async (req, res) => {
  const userId = (req as any).authUser?.id as number | undefined;
  const { initialMessage, name } = req.body as { initialMessage?: string; name?: string };

  const conversationId = randomUUID();
  const projectName = name?.trim() || "New Conversation";
  const trimmedInitial = initialMessage?.trim() || null;

  try {
    const [project] = await db
      .insert(projectsTable)
      .values({
        userId,
        name: projectName,
        status: "shaping",
        conversationId,
        ...(trimmedInitial ? { initialMessage: trimmedInitial } : {}),
      })
      .returning({
        id: projectsTable.id,
        conversationId: projectsTable.conversationId,
        name: projectsTable.name,
        initialMessage: projectsTable.initialMessage,
      });

    // Generate the AI title synchronously (bounded) so the client receives the
    // real name in this response instead of learning about it later with no
    // notification. A short timeout keeps project creation from stalling if
    // the model call is slow — in that case the fire-and-forget write still
    // lands in the DB, it's just not in this particular response.
    let finalName = project.name;
    let titlePending = false;
    if (trimmedInitial) {
      const TITLE_TIMEOUT_MS = 4000;
      const titlePromise = generateConversationTitle(project.id, trimmedInitial);
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), TITLE_TIMEOUT_MS));
      const title = await Promise.race([titlePromise, timeoutPromise]);
      if (title) {
        finalName = title;
      } else {
        // The race timed out — the client is told titling is still in
        // flight so it can re-check shortly, and generation keeps running
        // in the background and will still persist to the DB.
        titlePending = true;
        titlePromise.catch(() => {});
      }
    }

    // Persist the user's opening message to nexus_messages BEFORE responding.
    // This guarantees the message is in the DB by the time the workspace mounts
    // and loads history (~1s after navigation). The workspace history load finds
    // the user message immediately, suppressing the SSE auto-send that would
    // otherwise depend on a fragile mobile SSE connection.
    if (trimmedInitial && userId) {
      await persistFirstUserMessage(userId, project.id, conversationId, trimmedInitial);
      // Fire the initial Atlas response as a background task (fire-and-forget).
      // If this completes before the workspace's first history poll (~3s), the
      // assistant response appears automatically without any SSE streaming.
      void generateInitialAtlasResponse(userId, project.id, conversationId, trimmedInitial);
    }

    return res.json({
      id: project.id,
      conversationId: project.conversationId,
      initialMessage: project.initialMessage ?? null,
      name: finalName,
      titlePending,
    });
  } catch (err) {
    logger.error({ err }, "conversations: failed to create conversation");
    return res.status(500).json({ error: "Failed to create conversation" });
  }
});

router.get("/conversations/:conversationId", async (req, res) => {
  const { conversationId } = req.params;
  if (!conversationId) return res.status(400).json({ error: "conversationId required" });

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.conversationId, conversationId))
    .limit(1);

  if (!project) return res.status(404).json({ error: "Conversation not found" });
  return res.json(project);
});

export default router;
