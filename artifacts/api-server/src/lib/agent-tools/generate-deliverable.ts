import { tool } from "ai";
import { z } from "zod";
import { generateArtifact, listArtifactRendererTypes } from "../artifactEngine";
import { captureDeliverableToLibrary } from "../library";
import type { AgentToolContext, GeneratedArtifactMeta } from "./context";
import { db, projectArtifactsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
// Side-effect imports: each renderer registers itself with the Artifact Engine on load.
import "../renderers/docxRenderer";
import "../renderers/pdfRenderer";
import "../renderers/pptxRenderer";
import "../renderers/xlsxRenderer";
import "../renderers/mermaidRenderer";
import "../renderers/chartRenderer";
import "../renderers/htmlAppRenderer";

const HTML_STAGES = ["Preparing", "Building", "Styling", "Checking", "Ready"] as const;
type HtmlStage = typeof HTML_STAGES[number];

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
        .describe("Optional short instruction narrowing what the deliverable should focus on."),
      style: z
        .string()
        .optional()
        .describe("Optional explicit visual style instruction. Only pass if the user asked for a specific look."),
    }),
    execute: async ({ type, title, docType, focus, style }) => {
      const started = performance.now();
      ctx.emitToolCall("generate_deliverable", { type, title, docType });

      const emitStage = (stage: HtmlStage) => {
        ctx.emitNamedEvent("build_progress", {
          type,
          title: title || "Web App",
          status: "building",
          stage,
        });
      };

      // ── Preparing — emit immediately so the card appears before any model call ──
      ctx.writeStep({ verb: "Building", target: title || "Web App", phase: "output" });
      emitStage("Preparing");

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

        // ── Design contract lookup (html-app only) ────────────────────────────
        let resolvedStyle = style;
        if (type === "html-app" && !resolvedStyle && ctx.projectId > 0) {
          try {
            const [contractRow] = await db
              .select({ payload: projectArtifactsTable.payload })
              .from(projectArtifactsTable)
              .where(
                and(
                  eq(projectArtifactsTable.projectId, ctx.projectId),
                  eq(projectArtifactsTable.type, "design-contract"),
                )
              )
              .orderBy(desc(projectArtifactsTable.createdAt))
              .limit(1);

            if (contractRow?.payload) {
              const contractData = (contractRow.payload as Record<string, unknown>).contract;
              if (contractData && typeof contractData === "object") {
                resolvedStyle = JSON.stringify(contractData);
              }
            }
          } catch {
            // Non-fatal — proceed without contract if lookup fails
          }
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

        // ── Stage callback wired into renderer ────────────────────────────────
        // For html-app, the renderer calls onStage at Building/Styling/Checking.
        // We translate these into build_progress SSE events so the workspace
        // stage stepper advances in real time during the renderer call.
        const onStage = type === "html-app"
          ? (rendererStage: "building" | "styling" | "checking") => {
              const stageMap: Record<string, HtmlStage> = {
                building: "Building",
                styling: "Styling",
                checking: "Checking",
              };
              emitStage(stageMap[rendererStage] ?? "Building");
            }
          : undefined;

        const artifact = await generateArtifact({
          projectId: ctx.projectId,
          sessionId: null,
          type,
          sourceMessageId: ctx.messageId ?? null,
          input: { context, title, docType, projectId: ctx.projectId, styleOverride: resolvedStyle, onStage },
        });

        // ── Ready ─────────────────────────────────────────────────────────────
        const validation = (artifact.preview as Record<string, unknown>)?.validation as {
          issues?: string[];
          tileCount?: number;
          duplicateTitles?: string[];
        } | undefined;

        ctx.emitNamedEvent("build_progress", {
          type,
          title: artifact.title,
          status: "complete",
          stage: "Ready",
          needsReview: artifact.status === "needs_review",
          validationIssues: validation?.issues ?? [],
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

        ctx.writeStep({ verb: "ARTIFACT_CREATED", target: artifact.title, phase: "output" });
        ctx.emitNamedEvent("artifact_created", {
          ...meta,
          artifactUrl: `artifact://${artifact.id}`,
          detail: `${artifact.type.toUpperCase()} · ${artifact.extension}`,
          needsReview: artifact.status === "needs_review",
          validationIssues: validation?.issues ?? [],
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
        ctx.emitNamedEvent("build_progress", {
          type,
          title: title || "Web App",
          status: "failed",
          stage: "Ready",
          validationIssues: [],
        });
        return { ok: false, error: String(err) };
      }
    },
  });
}
