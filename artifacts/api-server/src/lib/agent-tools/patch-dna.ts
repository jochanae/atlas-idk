import { tool } from "ai";
import { z } from "zod";
import { updateProjectDNA } from "../projectDNA";
import type { AgentToolContext } from "./context";

const DNA_FIELD_MAP: Record<string, keyof import("../projectDNA").ProjectDNAUpdate> = {
  purpose: "purpose",
  coreEmotion: "coreEmotion",
  audience: "audience",
  identity: "identity",
  format: "format",
  surfaceStrategy: "surfaceStrategy",
  wedge: "wedge",
  differentiator: "differentiator",
  stage: "stage",
  confidenceScore: "confidenceScore",
};

export function patchDnaTool(_ctx: AgentToolContext) {
  return tool({
    description: "Update a single project DNA field in the application model.",
    inputSchema: z.object({
      projectId: z.number().int(),
      field: z.string(),
      value: z.union([z.string(), z.number(), z.array(z.string())]),
      status: z.enum(["inferred", "confirmed", "committed"]),
    }),
    execute: async ({ projectId, field, value }) => {
      const started = performance.now();
      _ctx.emitToolCall("patch_dna", { projectId, field });
      try {
        const dnaField = DNA_FIELD_MAP[field];
        if (!dnaField) {
          const ms = Math.round(performance.now() - started);
          _ctx.emitToolResult("patch_dna", false, ms);
          return { ok: false, error: `Unknown DNA field: ${field}` };
        }
        await updateProjectDNA(projectId, { [dnaField]: value as never });
        const ms = Math.round(performance.now() - started);
        _ctx.emitToolResult("patch_dna", true, ms);
        return { ok: true, field, value };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        _ctx.emitToolResult("patch_dna", false, ms);
        return { ok: false, error: String(err) };
      }
    },
  });
}
