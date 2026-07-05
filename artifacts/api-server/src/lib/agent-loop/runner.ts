import crypto from "node:crypto";
import type { Response } from "express";
import { streamText, isStepCount, hasToolCall, gateway } from "ai";
import { google } from "@ai-sdk/google";
import { agentRunsTable, chatMessagesTable, db, planArtifactsTable, sessionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { composeAtlasPrompt } from "../atlas-core";
import { buildAgentTools, createSideEffects, createPlanState, type AgentToolContext, type AgentToolSideEffects, type AgentPlanState } from "../agent-tools";
import { ensureProjectWorkspaceDir } from "../projectWorkspace";
import { logger } from "../logger";

const STEP_LIMIT = 50;

function resolveAgentModel() {
  if (process.env.AI_GATEWAY_API_KEY) {
    return gateway("google/gemini-3-flash-preview");
  }
  return google("gemini-3-flash-preview");
}

function stopAfterProposePlan(structuredPlanEnabled: boolean, planState: AgentPlanState) {
  return ({ steps }: { steps: Array<{ toolCalls?: Array<{ toolName: string }> }> }) => {
    if (!structuredPlanEnabled || steps.length === 0) return false;
    const lastStep = steps[steps.length - 1];
    const calledProposePlan = lastStep.toolCalls?.some((tc) => tc.toolName === "propose_plan");
    if (!calledProposePlan) return false;
    return !planState.hasApprovedCommitPlan;
  };
}

export interface AgentLoopParams {
  res: Response;
  abortSignal: AbortSignal;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  projectId: number;
  sessionId: number;
  userId: number;
  activeModel: string;
  structuredPlanEnabled?: boolean;
  writeStep: (res: Response, s: { verb: string; target?: string; phase: string }) => void;
}

export interface AgentLoopResult {
  fullText: string;
  messageId?: number;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
  sideEffects: AgentToolSideEffects;
  planState: AgentPlanState;
}

function emitNamedEvent(res: Response, event: string, data: object) {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch { /* client gone */ }
}

function emitToken(res: Response, content: string) {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.write(`data: ${JSON.stringify({ type: "token", content })}\n\n`);
  } catch { /* client gone */ }
}

export async function runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult> {
  const {
    res,
    abortSignal,
    systemPrompt,
    messages,
    projectId,
    sessionId,
    userId,
    activeModel,
    structuredPlanEnabled = false,
    writeStep,
  } = params;

  const startedAt = new Date();
  const workspaceDir = await ensureProjectWorkspaceDir(projectId);
  const sideEffects = createSideEffects();
  const planState = createPlanState();
  let stepCounter = 0;
  const toolsCalled: Array<{ name: string; ok: boolean; ms: number }> = [];
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let stopReason = "completed";
  let fullText = "";

  const ctx: AgentToolContext = {
    projectId,
    userId,
    workspaceDir,
    res,
    sideEffects,
    planState,
    structuredPlanEnabled,
    stepId: () => `step-${stepCounter}-${crypto.randomUUID().slice(0, 8)}`,
    emitToolCall: (name, args) => {
      emitNamedEvent(res, "tool_call", { name, args, stepId: ctx.stepId() });
    },
    emitToolResult: (name, ok, ms) => {
      toolsCalled.push({ name, ok, ms });
      emitNamedEvent(res, "tool_result", { name, ok, ms, stepId: ctx.stepId() });
    },
    emitNamedEvent: (event, data) => emitNamedEvent(res, event, data),
    writeStep: (s) => writeStep(res, s),
  };

  const tools = buildAgentTools(ctx, { includePlanTools: structuredPlanEnabled });
  const finalSystem = composeAtlasPrompt(systemPrompt, {
    includeTools: true,
    includePlanning: structuredPlanEnabled,
  });

  const modelMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  let result;
  try {
    result = streamText({
      model: resolveAgentModel(),
      system: finalSystem,
      messages: modelMessages,
      tools,
      stopWhen: [
        isStepCount(STEP_LIMIT),
        hasToolCall("finish"),
        ...(structuredPlanEnabled ? [stopAfterProposePlan(structuredPlanEnabled, planState)] : []),
      ],
      ...(structuredPlanEnabled
        ? { toolApproval: { commit_plan: "user-approval" as const } }
        : {}),
      abortSignal,
      experimental_telemetry: { isEnabled: true },
      onStepFinish: async ({ toolCalls, toolResults, usage }) => {
        stepCounter += 1;
        const tokensIn = usage?.inputTokens ?? 0;
        const tokensOut = usage?.outputTokens ?? 0;
        totalTokensIn += tokensIn;
        totalTokensOut += tokensOut;
        emitNamedEvent(res, "step_end", { step: stepCounter, tokensIn, tokensOut });

        const calledFinish = toolCalls?.some((tc) => tc.toolName === "finish");
        if (calledFinish) stopReason = "completed";

        const calledProposePlan = toolCalls?.some((tc) => tc.toolName === "propose_plan");
        if (calledProposePlan && structuredPlanEnabled && !planState.hasApprovedCommitPlan) {
          stopReason = "awaiting_plan_commit";
        }

        const commitApproved = toolResults?.some((tr) => tr.toolName === "commit_plan");
        if (commitApproved) planState.hasApprovedCommitPlan = true;
      },
    });

    for await (const part of result.fullStream) {
      if (abortSignal.aborted) {
        stopReason = "aborted";
        break;
      }
      if (part.type === "text-delta") {
        fullText += part.text;
        emitToken(res, part.text);
      }
      if (part.type === "tool-approval-request") {
        emitNamedEvent(res, "tool_approval_request", {
          approvalId: part.approvalId,
          toolCallId: part.toolCall.toolCallId,
          toolName: part.toolCall.toolName,
          input: part.toolCall.input,
        });
        if (part.toolCall.toolName === "commit_plan") {
          stopReason = "awaiting_plan_commit";
        }
      }
      if (part.type === "error") {
        stopReason = "error";
        logger.error({ error: part.error }, "agent loop stream error");
      }
    }

    const finishReason = await result.finishReason;
    if (finishReason === "stop" && sideEffects.finishSummary) {
      stopReason = "completed";
    } else if (stepCounter >= STEP_LIMIT) {
      stopReason = "step_limit";
    }

    const usage = await result.usage;
    if (usage) {
      totalTokensIn = usage.inputTokens ?? totalTokensIn;
      totalTokensOut = usage.outputTokens ?? totalTokensOut;
    }
  } catch (err) {
    if (abortSignal.aborted) {
      stopReason = "aborted";
    } else {
      stopReason = "error";
      logger.error({ err }, "agent loop failed");
      emitToken(res, "\n\nSomething went wrong running the agent loop. Please try again.");
    }
  }

  if (sideEffects.finishSummary && !fullText.trim()) {
    fullText = sideEffects.finishSummary;
  }

  let messageId: number | undefined;
  try {
    const [saved] = await db
      .insert(chatMessagesTable)
      .values({
        sessionId,
        role: "assistant",
        content: fullText,
        inputTokens: totalTokensIn || null,
        outputTokens: totalTokensOut || null,
        fileEditsJson: sideEffects.fileEdits.length > 0 ? JSON.stringify(sideEffects.fileEdits) : null,
        linePatchesJson: sideEffects.linePatches.length > 0 ? JSON.stringify(sideEffects.linePatches) : null,
        runStatus: stopReason === "completed" ? "completed" : stopReason,
        runSummary: sideEffects.finishSummary,
      })
      .returning();
    messageId = saved?.id;
    ctx.messageId = messageId;

    if (planState.activePlanId && messageId) {
      await db
        .update(planArtifactsTable)
        .set({ messageId })
        .where(eq(planArtifactsTable.id, planState.activePlanId));
    }

    await db
      .update(sessionsTable)
      .set({ messageCount: sql`${sessionsTable.messageCount} + 1` })
      .where(eq(sessionsTable.id, sessionId));
  } catch (dbErr) {
    logger.warn({ err: dbErr }, "agent loop: failed to save assistant message");
  }

  try {
    await db.insert(agentRunsTable).values({
      messageId: messageId ?? null,
      projectId,
      userId,
      stepCount: stepCounter,
      stopReason,
      toolsCalled,
      totalTokensIn,
      totalTokensOut,
      startedAt,
      endedAt: new Date(),
    });
  } catch (dbErr) {
    logger.warn({ err: dbErr }, "agent loop: failed to persist agent_runs row");
  }

  return {
    fullText,
    messageId,
    inputTokens: totalTokensIn,
    outputTokens: totalTokensOut,
    stopReason,
    sideEffects,
    planState,
  };
}
