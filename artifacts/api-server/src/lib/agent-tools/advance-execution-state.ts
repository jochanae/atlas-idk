import { tool } from "ai";
import { z } from "zod";
import type { AgentToolContext } from "./context";
import { advanceRunExecutionState } from "../executionStateMachine";

/**
 * advance_execution_state — v1.4
 *
 * Advances the execution state machine for an INVESTIGATE or EXECUTE run.
 *
 * v1.4 changes:
 *   - runId is no longer in the schema. It is sourced from ctx.activeExecutionRunId
 *     (server-provided), so the model cannot impersonate a different run.
 *   - evidenceType/stepId/confidence removed. Replaced with evidenceRefs[]: a list
 *     of execution_run_steps IDs the backend will validate (ownership, purpose,
 *     ordering). The model provides refs to immutable DB records — it cannot forge them.
 *   - conversationId sourced from execution_runs row — no contract_runs lookup.
 *
 * Atlas must never assert a claimed outcome in prose. Only this tool (via the
 * backend) may produce an outcome label that surfaces in the UI.
 */
export function advanceExecutionStateTool(ctx: AgentToolContext) {
  return tool({
    description:
      "Advance the execution state machine for a run. Call this when you have " +
      "concrete evidence justifying the next state. Provide the IDs of the " +
      "execution_run_steps records that prove the state (evidenceRefs). The " +
      "backend validates each ref: ownership, purpose type, and ordering. " +
      "Include issueType on the first call only. Never claim an outcome in " +
      "prose — the backend derives it from validated evidence.",
    inputSchema: z.object({
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
      evidenceRefs: z
        .array(
          z.object({
            id: z.number().int().describe("ID of the execution_run_steps row."),
          }),
        )
        .describe(
          "References to execution_run_steps records that justify this state transition. " +
          "Required for CAUSE_CONFIRMED, CHANGE_APPLIED, BUILD_VERIFIED, RUNTIME_VERIFIED, " +
          "and USER_FLOW_VERIFIED. Optional for INVESTIGATING, CHANGE_PROPOSED, BLOCKED, FAILED. " +
          "The backend validates: ownership (step must belong to this run), purpose type " +
          "(e.g. BUILD_VERIFIED requires a BUILD/TYPECHECK step with status=ok), and ordering " +
          "(BUILD step must postdate the latest PATCH step, etc.).",
        ),
      summary: z
        .string()
        .describe(
          "One sentence: what the evidence shows. Stored for context — not treated as proof.",
        ),
    }),
    execute: async ({ toState, issueType, evidenceRefs, summary }) => {
      const started = performance.now();
      ctx.emitToolCall("advance_execution_state", { toState, issueType, evidenceRefs, summary });

      const runId = ctx.activeExecutionRunId;
      if (!runId) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("advance_execution_state", false, ms);
        return { ok: false, error: "No active execution run for this turn." };
      }

      // Resolve conversation_id from execution_runs (not contract_runs)
      const result = await advanceRunExecutionState({
        runId,
        conversationId: `ws-${runId}`,  // fallback; real conversationId resolved inside via SSE bus
        userId: ctx.userId,
        toState: toState as import("@workspace/run-contract").ExecutionState,
        issueType: issueType as import("@workspace/run-contract").IssueType | undefined,
        evidenceRefs: evidenceRefs as import("@workspace/run-contract").EvidenceRef[],
        summary,
      });

      const ms = Math.round(performance.now() - started);
      ctx.emitToolResult("advance_execution_state", result.ok, ms);

      if (!result.ok) return result;

      return {
        ok: true,
        executionState: result.executionState,
        outcome: result.outcome,
        openQuestionsAnswered: result.openQuestions.filter(q => q.status === "ANSWERED").length,
      };
    },
  });
}
