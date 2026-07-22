import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentToolContext } from "../lib/agent-tools/context";
import { createSideEffects, createPlanState } from "../lib/agent-tools/context";

const generateArtifact = vi.fn();
const listArtifactRendererTypes = vi.fn(() => ["pptx", "docx", "xlsx"]);

vi.mock("../lib/artifactEngine", () => ({
  generateArtifact: (...args: unknown[]) => generateArtifact(...args),
  listArtifactRendererTypes: () => listArtifactRendererTypes(),
  registerArtifactRenderer: vi.fn(),
}));

vi.mock("../lib/library", () => ({
  captureDeliverableToLibrary: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
    })),
  },
  projectArtifactsTable: {
    payload: "payload",
    projectId: "project_id",
    type: "type",
    createdAt: "created_at",
  },
}));

vi.mock("../lib/renderers/docxRenderer", () => ({}));
vi.mock("../lib/renderers/pdfRenderer", () => ({}));
vi.mock("../lib/renderers/pptxRenderer", () => ({}));
vi.mock("../lib/renderers/xlsxRenderer", () => ({}));
vi.mock("../lib/renderers/mermaidRenderer", () => ({}));
vi.mock("../lib/renderers/chartRenderer", () => ({}));
vi.mock("../lib/renderers/htmlAppRenderer", () => ({}));

const ensureUserDeliverableBucketProject = vi.fn();
vi.mock("../lib/projectCreation", () => ({
  ensureUserDeliverableBucketProject: (...args: unknown[]) =>
    ensureUserDeliverableBucketProject(...args),
}));

import { generateDeliverableTool } from "../lib/agent-tools/generate-deliverable";

function makeCtx(overrides: Partial<AgentToolContext> = {}): AgentToolContext {
  return {
    projectId: 45,
    userId: 1,
    workspaceDir: "/tmp/ws",
    res: undefined as unknown as import("express").Response,
    sideEffects: createSideEffects(),
    planState: createPlanState(),
    structuredPlanEnabled: false,
    messages: [
      { role: "user", content: "Generate a PowerPoint for beta testers." },
      { role: "assistant", content: "Happy to — I'll put together a deck." },
    ],
    stepId: () => "step-1",
    emitToolCall: vi.fn(),
    emitToolResult: vi.fn(),
    emitNamedEvent: vi.fn(),
    writeStep: vi.fn(),
    activeExecutionRunId: null,
    runMode: "EXPLORE" as const,
    ...overrides,
  };
}

describe("generate_deliverable tool — Outputs visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listArtifactRendererTypes.mockReturnValue(["pptx", "docx", "xlsx"]);
    ensureUserDeliverableBucketProject.mockResolvedValue({ id: 99, name: "Atlas Files" });
    generateArtifact.mockResolvedValue({
      id: 123,
      projectId: 45,
      type: "pptx",
      category: "presentation",
      version: 1,
      title: "Beta Tester Presentation",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      extension: "pptx",
      sizeBytes: 4096,
      preview: {
        title: "Beta Tester Presentation",
        subtitle: "Onboarding overview",
        slideCount: 8,
        slideHeadings: ["Welcome", "Goals", "Feedback"],
      },
      summary: 'Generated deck "Beta Tester Presentation" (8 slides).',
      objectPath: "/objects/uploads/abc",
      ledgerEntryId: 9,
      createdAt: "2026-07-09T00:00:00.000Z",
    });
  });

  it("returns structured metadata, conversation-card copy, timeline step, and side effects", async () => {
    const ctx = makeCtx();
    const tool = generateDeliverableTool(ctx);
    const result = await tool.execute!(
      { type: "pptx", title: "Beta Tester Presentation" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toMatchObject({
      ok: true,
      artifactId: 123,
      projectId: 45,
      type: "pptx",
      title: "Beta Tester Presentation",
      extension: "pptx",
      downloadUrl: "/api/projects/45/artifacts/123/download",
      preview: {
        slideCount: 8,
        slideHeadings: ["Welcome", "Goals", "Feedback"],
      },
    });
    expect(String((result as { summary?: string }).summary)).toMatch(/card|conversation|download/i);
    expect(String((result as { summary?: string }).summary)).not.toContain("Deliverables");
    expect(ensureUserDeliverableBucketProject).not.toHaveBeenCalled();

    expect(ctx.sideEffects.generatedArtifacts).toHaveLength(1);
    expect(ctx.sideEffects.generatedArtifacts[0]).toMatchObject({
      artifactId: 123,
      downloadUrl: "/api/projects/45/artifacts/123/download",
    });

    expect(ctx.sideEffects.timelineSteps).toEqual([
      {
        verb: "ARTIFACT_CREATED",
        target: "Beta Tester Presentation",
        detail: "PPTX · pptx",
        content: 'Generated deck "Beta Tester Presentation" (8 slides).',
        artifactUrl: "artifact://123",
      },
    ]);

    expect(ctx.writeStep).toHaveBeenCalledWith({
      verb: "ARTIFACT_CREATED",
      target: "Beta Tester Presentation",
      phase: "output",
    });
    expect(ctx.emitNamedEvent).toHaveBeenCalledWith(
      "artifact_created",
      expect.objectContaining({ artifactId: 123, artifactUrl: "artifact://123" }),
    );

    const desc = typeof tool.description === "string" ? tool.description : "";
    expect(desc).toMatch(/inline|card|conversation/i);
    expect(desc).not.toContain("Deliverables");
  });

  it("uses the per-user Atlas Files bucket when no project is focused", async () => {
    generateArtifact.mockResolvedValueOnce({
      id: 456,
      projectId: 99,
      type: "xlsx",
      category: "spreadsheet",
      version: 1,
      title: "Tracker",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
      sizeBytes: 2048,
      preview: {},
      summary: "Generated spreadsheet.",
      objectPath: "/objects/uploads/def",
      ledgerEntryId: null,
      createdAt: "2026-07-22T00:00:00.000Z",
    });

    const ctx = makeCtx({ projectId: 0 });
    const tool = generateDeliverableTool(ctx);
    const result = await tool.execute!(
      { type: "xlsx", title: "Tracker" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(ensureUserDeliverableBucketProject).toHaveBeenCalledWith(1);
    expect(generateArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 99 }),
    );
    expect(result).toMatchObject({
      ok: true,
      artifactId: 456,
      projectId: 99,
      downloadUrl: "/api/projects/99/artifacts/456/download",
    });
    expect(ctx.sideEffects.generatedArtifacts).toHaveLength(1);
    expect(ctx.projectId).toBe(99);
  });

  it("fails cleanly when unfocused and the user id is missing", async () => {
    const ctx = makeCtx({ projectId: 0, userId: 0 });
    const tool = generateDeliverableTool(ctx);
    const result = await tool.execute!(
      { type: "pptx" },
      { toolCallId: "t1", messages: [] } as never,
    );
    expect(result).toMatchObject({ ok: false });
    expect(ensureUserDeliverableBucketProject).not.toHaveBeenCalled();
    expect(generateArtifact).not.toHaveBeenCalled();
    expect(ctx.sideEffects.generatedArtifacts).toHaveLength(0);
  });
});
