import { tool } from "ai";
import { z } from "zod";
import { generateArtifact, listArtifactRendererTypes } from "../artifactEngine";
import type { AgentToolContext } from "./context";
// Side-effect imports: each renderer registers itself with the Artifact Engine on load.
// The agent loop can run without ever hitting the projectArtifacts routes, so this
// tool must trigger renderer registration itself instead of relying on route-file
// import order.
import "../renderers/docxRenderer";
import "../renderers/pdfRenderer";
import "../renderers/pptxRenderer";
import "../renderers/xlsxRenderer";
import "../renderers/mermaidRenderer";
import "../renderers/chartRenderer";

/**
 * Task #1 fix: a working PPTX (and docx/xlsx/etc) renderer + Artifact Engine
 * already existed, but was only reachable via a dedicated REST endpoint
 * (POST /api/projects/:id/deliverables/:type/generate). Nothing in the agent
 * loop's toolset could call it, so Atlas had no way to actually produce a
 * presentation from conversation — she could only say she couldn't. This tool
 * closes that gap by wiring the same Artifact Engine call into the agent loop,
 * using the turn's own conversation history as context instead of re-querying it.
 */
export function generateDeliverableTool(ctx: AgentToolContext) {
  return tool({
    description:
      "Generate a downloadable file-backed deliverable (e.g. a PowerPoint deck, Word doc, or spreadsheet) from the current conversation and save it to the project's Deliverables. Use this whenever the user asks for a presentation/deck, document, or spreadsheet to be created — never say you can't produce files.",
    inputSchema: z.object({
      type: z
        .enum(["pptx", "docx", "xlsx"])
        .describe("Deliverable format: pptx for a slide deck/presentation, docx for a document, xlsx for a spreadsheet."),
      title: z.string().optional().describe("Optional title for the deliverable."),
      docType: z
        .string()
        .optional()
        .describe("Optional sub-type hint for the renderer, e.g. 'deck', 'brief', 'one-pager'."),
      focus: z
        .string()
        .optional()
        .describe("Optional short instruction narrowing what the deliverable should focus on, if the user asked for something specific."),
    }),
    execute: async ({ type, title, docType, focus }) => {
      const started = performance.now();
      ctx.emitToolCall("generate_deliverable", { type, title, docType });
      try {
        const available = listArtifactRendererTypes();
        if (!available.includes(type)) {
          const ms = Math.round(performance.now() - started);
          ctx.emitToolResult("generate_deliverable", false, ms);
          return { ok: false, error: `No renderer registered for type "${type}". Available: ${available.join(", ")}` };
        }

        const context = ctx.messages
          .map((m) => `${m.role === "user" ? "User" : "Atlas"}: ${String(m.content).slice(0, 2000)}`)
          .join("\n\n")
          + (focus ? `\n\n[Focus for this deliverable: ${focus}]` : "");

        if (!context.trim()) {
          const ms = Math.round(performance.now() - started);
          ctx.emitToolResult("generate_deliverable", false, ms);
          return { ok: false, error: "No conversation context available to generate from yet." };
        }

        const artifact = await generateArtifact({
          projectId: ctx.projectId,
          sessionId: null,
          type,
          sourceMessageId: ctx.messageId ?? null,
          input: { context, title, docType },
        });

        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("generate_deliverable", true, ms);
        return {
          ok: true,
          artifactId: artifact.id,
          type: artifact.type,
          title: artifact.title,
          version: artifact.version,
          extension: artifact.extension,
          summary: `Generated ${artifact.type.toUpperCase()} "${artifact.title}" — available in this project's Deliverables tab.`,
        };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("generate_deliverable", false, ms);
        return { ok: false, error: String(err) };
      }
    },
  });
}
