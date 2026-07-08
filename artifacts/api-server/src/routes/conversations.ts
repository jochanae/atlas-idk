import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { db, projectsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

async function generateConversationTitle(projectId: number, message: string): Promise<void> {
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
  } catch (err) {
    logger.warn({ err, projectId }, "conversations: async title generation failed — non-fatal");
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

    if (trimmedInitial) {
      generateConversationTitle(project.id, trimmedInitial).catch(() => {});
    }

    return res.json({
      id: project.id,
      conversationId: project.conversationId,
      initialMessage: project.initialMessage ?? null,
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
