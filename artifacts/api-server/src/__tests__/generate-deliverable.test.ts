import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentToolContext } from "../lib/agent-tools/context";
import { createSideEffects, createPlanState } from "../lib/agent-tools/context";

const generateArtifact = vi.fn();
const listArtifactRendererTypes = vi.fn(() => ["pptx", "docx", "xlsx"]);

vi.mock("../lib/artifactEngine", () => ({
  generateArtifact: (...args: unknown[]) => generateArtifact(...args),
  listArtifactRendererTypes: () => listArtifactRendererTypes(),
}));

vi.mock("../lib/renderers/docxRenderer", () => ({}));
vi.mock("../lib/renderers/pdfRenderer", () => ({}));
vi.mock("../lib/renderers/pptxRenderer", () => ({}));
vi.mock("../lib/renderers/xlsxRenderer", () => ({}));
vi.mock("../lib/renderers/mermaidRenderer", () => ({}));
vi.mock("../lib/renderers/chartRenderer", () => ({}));

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
    ...overrides,
  };
}

describe("generate_deliverable tool — Outputs visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listArtifactRendererTypes.mockReturnValue(["pptx", "docx", "xlsx"]);
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

  it("returns structured metadata, Outputs copy, timeline step, and side effects", async () => {
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
    expect(String((result as { summary?: string }).summary)).toContain("Outputs");
    expect(String((result as { summary?: string }).summary)).not.toContain("Deliverables");

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
    expect(desc).toContain("Outputs");
    expect(desc).not.toContain("Deliverables");
  });

  it("fails cleanly when no project is focused", async () => {
    const ctx = makeCtx({ projectId: 0 });
    const tool = generateDeliverableTool(ctx);
    const result = await tool.execute!(
      { type: "pptx" },
      { toolCallId: "t1", messages: [] } as never,
    );
    expect(result).toMatchObject({ ok: false });
    expect(generateArtifact).not.toHaveBeenCalled();
    expect(ctx.sideEffects.generatedArtifacts).toHaveLength(0);
  });
});
