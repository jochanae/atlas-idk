import { tool } from "ai";
import { z } from "zod";
import type { AgentToolContext } from "./context";
import { runClosedLoopVerification, formatVerificationReport } from "../closedLoopVerification";

/**
 * Completion gate (Phase 3): a build cannot be reported "done" until
 * Closed-Loop Verification has run and passed for this workspace, or its
 * failures have been surfaced. If any FILE_EDIT/edit_file writes happened
 * this turn, `finish` runs the full manifest/build/typecheck/truncation/env
 * checklist/seed-data pass before allowing the loop to stop.
 */
export function finishTool(ctx: AgentToolContext) {
  return tool({
    description:
      "Signal that the task is complete and terminate the agent loop. If files were written this turn, this runs Closed-Loop Verification (manifest check, install/build/typecheck, truncation scan, env checklist, seed-data check) first — the loop will NOT stop as \"done\" if verification fails.",
    inputSchema: z.object({
      summary: z.string(),
    }),
    execute: async ({ summary }) => {
      const started = performance.now();
      ctx.emitToolCall("finish", { summary });

      const wroteFiles = ctx.sideEffects.fileEdits.length > 0 || ctx.sideEffects.linePatches.length > 0;
      if (wroteFiles && ctx.sideEffects.verificationPassed === null) {
        ctx.writeStep({ verb: "Verifying", target: "build", phase: "verify" });
        const report = await runClosedLoopVerification(ctx.workspaceDir);
        ctx.sideEffects.verificationPassed = report.passed;
        ctx.sideEffects.verificationReportText = formatVerificationReport(report);

        if (!report.passed) {
          const ms = Math.round(performance.now() - started);
          ctx.emitToolResult("finish", false, ms);
          return {
            ok: false,
            blocked: true,
            reason: "Closed-Loop Verification failed — this build is not done. Fix the blocking issues below and call finish again.",
            report: ctx.sideEffects.verificationReportText,
          };
        }
      }

      ctx.sideEffects.finishSummary = ctx.sideEffects.verificationReportText
        ? `${summary}\n\n${ctx.sideEffects.verificationReportText}`
        : summary;
      const ms = Math.round(performance.now() - started);
      ctx.emitToolResult("finish", true, ms);
      return { ok: true, summary, verificationPassed: ctx.sideEffects.verificationPassed };
    },
  });
}
