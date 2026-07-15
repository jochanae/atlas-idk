import { tool } from "ai";
import { z } from "zod";
import type { AgentToolContext } from "./context";
import { advanceRunExecutionState } from "../executionStateMachine";
import { pool } from "@workspace/db";

/**
 * advance_execution_state — v1.3
 *
 * Advances the execution state machine for an INVESTIGATE or EXECUTE run.
 * The backend validates the transition, derives allowedOutcome, and emits
 * an execution_state_update SSE event.
 *
 * Atlas must never assert a claimed outcome in prose — only this tool (via
 * the backend) may produce an allowedOutcome label that surfaces in the UI.
 *
 * On the FIRST call for a run, include `issueType` to classify the problem
 * and determine which verification steps are required. Omit it on subsequent
 * calls — the contract is already set.
 */
export function advanceExecutionStateTool(ctx: AgentToolContext) {
  return tool({
    description:
      "Advance the execution state machine for a run. Call this when you have " +
      "concrete evidence justifying the next state. The backend validates the " +
      "transition and derives allowedOutcome — never claim an outcome in prose. " +
      "Include issueType on the first call only (classifies the problem and sets " +
      "required verification steps). Omit it on subsequent calls.",
    inputSchema: z.object({
      runId: z
        .string()
        .describe("ID of the run to advance."),
      toState: z
        .enum([
          "INVESTIGATING",
          "CAUSE_CONFIRMED",
          "CHANGE_PROPOSED",
          "CHANGE_APPLIED",
          "BUILD_VERIFIED",
          "RUNTIME_VERIFIED",
          "USER_FLOW_VERIFIED",
          "BLOCKED",
          "FAILED",
        ])
        .describe("Target execution state."),
      issueType: z
        .enum([
          "CONTENT_EDIT",
          "CODE_COMPILE",
          "SERVER_ROUTING",
          "UI_BEHAVIOR",
          "DEPLOYMENT",
          "INVESTIGATION",
          "UNKNOWN",
        ])
        .optional()
        .describe(
          "Problem classification — required on the first call, ignored thereafter. " +
          "Determines which verification states must be reached before the run may succeed.",
        ),
      evidenceType: z
        .enum([
          "file_change",
          "build_output",
          "runtime_check",
          "user_flow",
          "log_read",
          "search_result",
        ])
        .describe("Type of evidence that justifies this transition."),
      stepId: z
        .string()
        .describe("ID of the RunStep that produced the evidence."),
      summary: z
        .string()
        .describe("One sentence: what the evidence shows."),
      confidence: z
        .enum(["confirmed", "inferred", "assumed"])
        .describe(
          "confirmed = direct evidence (e.g. build exited 0). " +
          "inferred = strong signal (e.g. no errors in log). " +
          "assumed = reasonable guess with no direct proof.",
        ),
    }),
    execute: async ({
      runId,
      toState,
      issueType,
      evidenceType,
      stepId,
      summary,
      confidence,
    }) => {
      const started = performance.now();
      ctx.emitToolCall("advance_execution_state", {
        runId, toState, issueType, evidenceType, stepId, summary, confidence,
      });

      // Resolve conversation_id (needed for SSE publish)
      const convRow = await pool.query<{ conversation_id: string }>(
        "SELECT conversation_id FROM contract_runs WHERE id = $1",
        [runId],
      );
      if (!convRow.rows.length) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("advance_execution_state", false, ms);
        return { ok: false, error: "Run not found" };
      }
      const conversationId = convRow.rows[0].conversation_id;

      const result = await advanceRunExecutionState({
        runId,
        conversationId,
        userId: ctx.userId,
        toState: toState as any,
        issueType: issueType as any,
        evidenceType,
        stepId,
        summary,
        confidence,
      });

      const ms = Math.round(performance.now() - started);
      ctx.emitToolResult("advance_execution_state", result.ok, ms);

      if (!result.ok) return result;

      return {
        ok: true,
        executionState: result.executionState,
        allowedOutcome: result.allowedOutcome,
        evidence: result.evidence,
        openQuestionsAnswered: result.openQuestions.filter(q => q.status === "ANSWERED").length,
      };
    },
  });
}
