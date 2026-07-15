/**
 * run-browser-flow.ts — Atlas agent tool for browser verification
 *
 * Wires the browserRunner into the AI SDK tool contract.
 * Security guarantees:
 *   - runId comes from ctx.activeExecutionRunId (server context), never model input
 *   - userId/projectId come from ctx, never model input
 *   - startPath must be relative — server enforces this
 *   - Scope defaults to READ_ONLY; model cannot escalate without server authorization
 *   - The resulting execution_run_step is the ONLY valid proof for USER_FLOW_VERIFIED
 */

import { tool } from "ai";
import { z } from "zod/v4";
import { runBrowserFlow } from "../browserRunner";
import type { AgentToolContext } from "./context";
import type { BrowserStepInput, BrowserAssertionInput } from "@workspace/run-contract";

// ── Zod schemas ──────────────────────────────────────────────────────────────

const BrowserLocatorSchema = z.discriminatedUnion("by", [
  z.object({ by: z.literal("testId"), value: z.string() }),
  z.object({ by: z.literal("role"),   role: z.string(), name: z.string().optional() }),
  z.object({ by: z.literal("label"),  value: z.string() }),
  z.object({ by: z.literal("text"),   value: z.string() }),
  z.object({ by: z.literal("css"),    value: z.string() }),
]);

const BrowserStepSchema: z.ZodType<BrowserStepInput> = z.discriminatedUnion("action", [
  z.object({ action: z.literal("navigate"),    path: z.string() }),
  z.object({ action: z.literal("click"),       target: BrowserLocatorSchema, waitAfterMs: z.number().optional() }),
  z.object({ action: z.literal("fill"),        target: BrowserLocatorSchema, value: z.string() }),
  z.object({ action: z.literal("wait"),        ms: z.number().max(5000) }),
  z.object({ action: z.literal("wait_for"),    selector: z.string(), timeoutMs: z.number().optional() }),
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("screenshot"),  label: z.string().optional() }),
]);

const BrowserAssertionSchema: z.ZodType<BrowserAssertionInput> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text_visible"),     value: z.string() }),
  z.object({ type: z.literal("url_contains"),     value: z.string() }),
  z.object({ type: z.literal("element_visible"),  selector: z.string() }),
  z.object({ type: z.literal("element_absent"),   selector: z.string() }),
  z.object({ type: z.literal("no_console_errors") }),
  z.object({ type: z.literal("no_network_errors"), pattern: z.string().optional() }),
]);

const ViewportSchema = z.enum(["DESKTOP", "MOBILE", "FOLD_CLOSED", "FOLD_OPEN"]);

// ── Tool registration ─────────────────────────────────────────────────────────

export function runBrowserFlowTool(ctx: AgentToolContext) {
  return tool({
    description: `
Run an automated browser verification flow against the app and record the result as immutable evidence.

Use this tool when:
- The verification contract requires USER_FLOW_VERIFIED
- The change affects navigation, rendering, forms, auth, or state that survives refresh
- Explicit user or contract request for browser verification

Do NOT use for:
- Documentation-only edits
- Pure backend schema changes
- Utility function changes
- Planning tasks

The tool runs Playwright against the live preview, enforces READ_ONLY scope by default
(POST/PUT/PATCH/DELETE are blocked at the browser network layer), and persists an
execution_run_steps record with step_purpose=BROWSER_FLOW. That record is the ONLY
valid proof for USER_FLOW_VERIFIED — Atlas cannot self-assert this state.

Authentication is handled server-side via a scoped browser-test session.
The runId is bound from the active execution context — you cannot supply it.
    `.trim(),

    inputSchema: z.object({
      startPath: z.string().describe(
        "Relative path to start navigation from (e.g. '/workspace/abc'). Must not contain '://'. Server enforces the base URL.",
      ),
      viewports: z.array(ViewportSchema).min(1).describe(
        "Viewport profiles to test. All must pass for USER_FLOW_VERIFIED. Use ['DESKTOP', 'MOBILE'] for responsive changes.",
      ),
      steps: z.array(BrowserStepSchema).min(1).max(30).describe(
        "Ordered browser actions. Use semantic locators (testId > role > label > text > css).",
      ),
      assertions: z.array(BrowserAssertionSchema).min(1).max(20).describe(
        "Assertions evaluated after steps complete. All must pass for the flow to succeed.",
      ),
      timeoutMs: z.number().min(5000).max(60000).optional().describe(
        "Total timeout in ms. Default 30000, max 60000.",
      ),
    }),

    execute: async ({ startPath, viewports, steps, assertions, timeoutMs }) => {
      const runId = ctx.activeExecutionRunId;
      if (!runId) {
        return {
          ok: false,
          error: "No active execution run. run_browser_flow requires an active BUILD execution run.",
        };
      }

      const started = performance.now();
      ctx.emitToolCall("run_browser_flow", { startPath, viewports, steps: steps.length, assertions: assertions.length });
      ctx.writeStep({ verb: "Browser testing", target: startPath, phase: "verify" });

      try {
        const result = await runBrowserFlow({
          userId: ctx.userId,
          projectId: ctx.projectId,
          executionRunId: runId,
          startPath,
          viewports,
          steps,
          assertions,
          scope: "READ_ONLY",
          timeoutMs,
        });

        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("run_browser_flow", result.allProfilesPassed, ms);
        ctx.writeStep({
          verb: result.allProfilesPassed ? "Browser verified" : "Browser failed",
          target: startPath,
          phase: "verify",
        });

        return {
          ok: result.allProfilesPassed,
          traceId: result.traceId,
          stepRecordId: result.stepRecordId,
          finalUrl: result.finalUrl,
          profileResults: result.profileResults,
          assertionsPassed: result.assertionsPassed,
          assertionsFailed: result.assertionsFailed,
          durationMs: result.durationMs,
          consoleErrors: result.consoleErrors.slice(0, 5),
          networkErrors: result.networkErrors.slice(0, 10),
          artifactsStored: result.artifacts.length,
          message: result.allProfilesPassed
            ? `Browser flow passed — all ${viewports.join("+")} profiles verified. stepRecordId=${result.stepRecordId} is your BROWSER_FLOW evidence ref for USER_FLOW_VERIFIED.`
            : `Browser flow FAILED on ${result.profileResults.filter(r => !r.success).map(r => r.viewport).join(", ")}. assertionsFailed=${result.assertionsFailed}. Fix the issues and retry.`,
        };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("run_browser_flow", false, ms);
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });
}
