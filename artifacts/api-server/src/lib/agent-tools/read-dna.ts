import { tool } from "ai";
import { z } from "zod";
import { getProjectDNA } from "../projectDNA";
import type { AgentToolContext } from "./context";

const DNA_FIELDS = [
  "purpose", "coreEmotion", "audience", "identity", "format",
  "surfaceStrategy", "wedge", "differentiator", "stack", "protectedAreas",
  "constraints", "openQuestions", "stage", "confidenceScore",
] as const;

export function readDnaTool(_ctx: AgentToolContext) {
  return tool({
    description: "Read project DNA fields from the application model.",
    inputSchema: z.object({
      projectId: z.number().int(),
      fields: z.array(z.enum(DNA_FIELDS)).optional(),
    }),
    execute: async ({ projectId, fields }) => {
      const started = performance.now();
      _ctx.emitToolCall("read_dna", { projectId, fields });
      try {
        const dna = await getProjectDNA(projectId);
        if (!dna) {
          const ms = Math.round(performance.now() - started);
          _ctx.emitToolResult("read_dna", true, ms);
          return { dna: null };
        }
        const keys = fields?.length ? fields : [...DNA_FIELDS];
        const subset: Record<string, unknown> = {};
        for (const k of keys) {
          subset[k] = (dna as unknown as Record<string, unknown>)[k];
        }
        const ms = Math.round(performance.now() - started);
        _ctx.emitToolResult("read_dna", true, ms);
        return { dna: subset };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        _ctx.emitToolResult("read_dna", false, ms);
        return { error: String(err) };
      }
    },
  });
}
