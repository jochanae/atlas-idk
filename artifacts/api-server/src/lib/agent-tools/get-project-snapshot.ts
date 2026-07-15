/**
 * get_project_snapshot — Project State Snapshot v1
 *
 * Returns the current operational state of the project workspace: stack,
 * git, services, and last build result. Cached for 30 minutes — no re-read
 * on every turn.
 *
 * Atlas should call this once at the start of any INVESTIGATE or EXECUTE
 * turn. It eliminates:
 *   - repeated package.json reads to discover the stack
 *   - git log calls to find the current branch
 *   - artifact.toml reads to find service ports
 *   - "what framework are you using?" style questions
 */

import { tool } from "ai";
import { z } from "zod";
import type { AgentToolContext } from "./context";
import { getProjectSnapshot } from "../projectSnapshot";

export function getProjectSnapshotTool(ctx: AgentToolContext) {
  return tool({
    description:
      "Get the current operational state of the project: tech stack, git state, " +
      "service configuration, and last build result. Call this once at the start of " +
      "any INVESTIGATE or EXECUTE turn — it eliminates repeated package.json and " +
      "artifact.toml reads. Results are cached for 30 minutes. Pass forceRefresh:true " +
      "after a build or deploy to see the updated state.",
    inputSchema: z.object({
      forceRefresh: z
        .boolean()
        .optional()
        .describe(
          "Bypass the cache and re-extract. Use after a build, deploy, or install.",
        ),
    }),
    execute: async ({ forceRefresh }) => {
      const started = performance.now();
      ctx.emitToolCall("get_project_snapshot", { forceRefresh: forceRefresh ?? false });

      const snapshot = await getProjectSnapshot(
        ctx.projectId,
        ctx.workspaceDir,
        { forceRefresh: forceRefresh ?? false },
      );

      const ms = Math.round(performance.now() - started);
      ctx.emitToolResult("get_project_snapshot", true, ms);

      return snapshot;
    },
  });
}
