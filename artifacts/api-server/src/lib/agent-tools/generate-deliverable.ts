import { tool } from "ai";
import { z } from "zod";
import { generateArtifact, listArtifactRendererTypes } from "../artifactEngine";
import { captureDeliverableToLibrary } from "../library";
import type { AgentToolContext, GeneratedArtifactMeta } from "./context";
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
import "../renderers/htmlAppRenderer";

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
      "Generate a downloadable file-backed deliverable from the current conversation and save it to the project's Outputs. Use this whenever the user asks for a presentation/deck, document, spreadsheet, or web app/tool/widget to be created — never say you can't produce files. After success, tell the user it's in Outputs.",
    inputSchema: z.object({
      type: z
        .enum(["pptx", "docx", "xlsx", "html-app"])
        .describe("Deliverable format: pptx for a slide deck/presentation, docx for a document, xlsx for a spreadsheet, html-app for a complete self-contained interactive web app or tool."),
      title: z.string().optional().describe("Optional title for the deliverable."),
      docType: z
        .string()
        .optional()
        .describe("Optional sub-type hint for the renderer, e.g. 'deck', 'brief', 'one-pager'."),
      focus: z
        .string()
        .optional()
        .describe("Optional short instruction narrowing what the deliverable should focus on, if the user asked for something specific."),
      style: z
        .string()
        .optional()
        .describe("Optional explicit visual style instruction, e.g. 'make it look playful and colorful' or 'match our fintech branding'. Only pass this if the user asked for a specific look — otherwise the project's own theme is inferred automatically."),
    }),
    execute: async ({ type, title, docType, focus, style }) => {
      const started = performance.now();
      ctx.emitToolCall("generate_deliverable", { type, title, docType });
      try {
        const available = listArtifactRendererTypes();
        if (!available.includes(type)) {
          const ms = Math.round(performance.now() - started);
          ctx.emitToolResult("generate_deliverable", false, ms);
          return { ok: false, error: `No renderer registered for type "${type}". Available: ${available.join(", ")}` };
        }

        if (!ctx.projectId || ctx.projectId <= 0) {
          const ms = Math.round(performance.now() - started);
          ctx.emitToolResult("generate_deliverable", false, ms);
          return { ok: false, error: "No active project — open a project workspace before generating Outputs." };
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
          input: { context, title, docType, projectId: ctx.projectId, styleOverride: style },
        });

        const downloadUrl = `/api/projects/${artifact.projectId}/artifacts/${artifact.id}/download`;
        const meta: GeneratedArtifactMeta = {
          ok: true,
          artifactId: artifact.id,
          projectId: artifact.projectId,
          type: artifact.type,
          title: artifact.title,
          extension: artifact.extension,
          downloadUrl,
          preview: artifact.preview ?? {},
          ...(artifact.summary ? { summary: artifact.summary } : {}),
        };

        ctx.sideEffects.generatedArtifacts.push(meta);

        // Auto-capture into Library — fire-and-forget, never blocks tool result.
        void captureDeliverableToLibrary({
          userId: ctx.userId,
          projectId: ctx.projectId,
          conversationId: ctx.conversationId ?? null,
          artifactId: artifact.id,
          type: artifact.type,
          title: artifact.title,
          summary: artifact.summary ?? null,
        });

        ctx.sideEffects.timelineSteps.push({
          verb: "ARTIFACT_CREATED",
          target: artifact.title,
          detail: `${artifact.type.toUpperCase()} · ${artifact.extension}`,
          content: artifact.summary ?? null,
          artifactUrl: `artifact://${artifact.id}`,
        });

        // Live timeline / SSE signal for the client (Workspace → Changes → Timeline).
        // phase is required by AgentToolContext's writeStep signature (chat agent loop).
        ctx.writeStep({
          verb: "ARTIFACT_CREATED",
          target: artifact.title,
          phase: "output",
        });
        ctx.emitNamedEvent("artifact_created", {
          ...meta,
          artifactUrl: `artifact://${artifact.id}`,
          detail: `${artifact.type.toUpperCase()} · ${artifact.extension}`,
        });

        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("generate_deliverable", true, ms);
        return {
          ...meta,
          version: artifact.version,
          summary: `Generated ${artifact.type.toUpperCase()} "${artifact.title}" — it's in Outputs.`,
        };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("generate_deliverable", false, ms);
        return { ok: false, error: String(err) };
      }
    },
  });
}
