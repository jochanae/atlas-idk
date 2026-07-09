import { describe, expect, it, vi, beforeEach } from "vitest";

// Shared mock for every renderer that talks to Claude (docxRenderer uses the
// SDK directly; pdf/pptx/xlsx/chart/mermaid/draft* go through contentPlan.ts,
// which also wraps the same SDK). One mock covers all of them.
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class Anthropic {
      messages = { create: mockCreate };
    },
  };
});

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn() },
  projectArtifactsTable: {
    id: "id",
    projectId: "project_id",
    type: "type",
  },
}));

vi.mock("../lib/objectStorage", () => {
  class ObjectStorageService {
    async getObjectEntityFile(objectPath: string) {
      return { objectPath } as never;
    }
    async downloadObject() {
      return new Response(new Blob([Buffer.from("stub-file-bytes")]), { status: 200 });
    }
  }
  class ObjectNotFoundError extends Error {}
  return { ObjectStorageService, ObjectNotFoundError };
});

function jsonResponse(payload: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

import { getArtifactRenderer } from "../lib/artifactEngine";
import "../lib/renderers/docxRenderer";
import "../lib/renderers/pdfRenderer";
import "../lib/renderers/pptxRenderer";
import "../lib/renderers/xlsxRenderer";
import "../lib/renderers/mermaidRenderer";
import "../lib/renderers/chartRenderer";
import "../lib/renderers/draftRenderer";
import "../lib/renderers/bundleRenderer";
import * as artifactEngine from "../lib/artifactEngine";
import { db } from "@workspace/db";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("docx renderer", () => {
  it("renders a valid docx buffer from a content plan", async () => {
    mockCreate.mockResolvedValueOnce(
      jsonResponse({
        title: "Sprint 4 Recap",
        sections: [
          { heading: "Overview", paragraphs: ["We shipped the bundle renderer."] },
          { heading: "Next steps", bullets: ["Add tests", "Add UI triggers"] },
        ],
      }),
    );

    const renderer = getArtifactRenderer("docx")!;
    const output = await renderer.render({ context: "we shipped stuff", docType: "brief" });

    expect(output.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(output.extension).toBe("docx");
    expect(output.buffer.byteLength).toBeGreaterThan(0);
    expect(output.title).toBe("Sprint 4 Recap");
    expect((output.preview as any).sectionCount).toBe(2);
  });

  it("throws a clear error when the model produces no output", async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "" }] });
    const renderer = getArtifactRenderer("docx")!;
    await expect(renderer.render({ context: "..." })).rejects.toThrow(/no output/);
  });
});

describe("pdf renderer", () => {
  it("renders a valid pdf buffer (starts with the PDF magic header)", async () => {
    mockCreate.mockResolvedValueOnce(
      jsonResponse({
        title: "Status Report",
        sections: [{ heading: "Summary", paragraphs: ["Everything is on track."] }],
      }),
    );
    const renderer = getArtifactRenderer("pdf")!;
    const output = await renderer.render({ context: "status update" });
    expect(output.extension).toBe("pdf");
    expect(output.buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("pptx renderer", () => {
  it("renders a valid pptx (zip) buffer", async () => {
    mockCreate.mockResolvedValueOnce(
      jsonResponse({
        title: "Q3 Review",
        subtitle: "Team sync",
        slides: [{ heading: "Wins", bullets: ["Shipped bundle renderer"] }],
      }),
    );
    const renderer = getArtifactRenderer("pptx")!;
    const output = await renderer.render({ context: "q3 review" });
    expect(output.extension).toBe("pptx");
    // PPTX/OOXML files are zip archives — magic header "PK".
    expect(output.buffer.subarray(0, 2).toString()).toBe("PK");
  });
});

describe("xlsx renderer", () => {
  it("renders a valid xlsx (zip) workbook buffer", async () => {
    mockCreate.mockResolvedValueOnce(
      jsonResponse({
        title: "Budget",
        sheets: [
          { name: "Budget", columns: ["Item", "Cost"], rows: [["Hosting", 50]] },
        ],
      }),
    );
    const renderer = getArtifactRenderer("xlsx")!;
    const output = await renderer.render({ context: "budget planning" });
    expect(output.extension).toBe("xlsx");
    expect(output.buffer.subarray(0, 2).toString()).toBe("PK");
  });
});

describe("mermaid renderer", () => {
  it("renders raw mermaid source as the buffer and preview", async () => {
    mockCreate.mockResolvedValueOnce(
      jsonResponse({
        title: "Auth Flow",
        diagramType: "sequence",
        mermaidSource: "sequenceDiagram\n  User->>API: login",
        summary: "Login sequence",
      }),
    );
    const renderer = getArtifactRenderer("mermaid")!;
    const output = await renderer.render({ context: "login flow", diagramType: "sequence" });
    expect(output.mimeType).toBe("text/vnd.mermaid");
    expect(output.extension).toBe("mmd");
    expect(output.buffer.toString("utf-8")).toContain("sequenceDiagram");
    expect((output.preview as any).diagramType).toBe("sequence");
  });

  it("propagates a clear error when the model returns an invalid shape", async () => {
    mockCreate.mockResolvedValueOnce(jsonResponse({ title: "oops" }));
    const renderer = getArtifactRenderer("mermaid")!;
    await expect(renderer.render({ context: "..." })).rejects.toThrow(/unexpected shape/);
  });
});

describe("chart renderer", () => {
  it("renders an SVG chart buffer", async () => {
    mockCreate.mockResolvedValueOnce(
      jsonResponse({
        title: "Revenue by Quarter",
        chartType: "bar",
        labels: ["Q1", "Q2"],
        datasets: [{ label: "Revenue", values: [100, 150] }],
        summary: "Revenue grew quarter over quarter.",
      }),
    );
    const renderer = getArtifactRenderer("chart")!;
    const output = await renderer.render({ context: "revenue numbers", chartType: "bar" });
    expect(output.mimeType).toContain("svg");
    expect(output.buffer.toString("utf-8")).toContain("<svg");
  });
});

describe("draft renderers (email/slack/pr/changelog)", () => {
  const cases: Array<{ type: string; label: string }> = [
    { type: "draft_email", label: "Email Draft" },
    { type: "draft_slack", label: "Slack Message Draft" },
    { type: "draft_pr", label: "PR Description Draft" },
    { type: "draft_changelog", label: "Changelog Entry Draft" },
  ];

  it.each(cases)("$type renders copy-ready markdown text", async ({ type, label }) => {
    mockCreate.mockResolvedValueOnce(
      jsonResponse({
        title: `Draft: ${label}`,
        body: `Body content for ${label}.`,
        summary: `Summary for ${label}.`,
      }),
    );
    const renderer = getArtifactRenderer(type)!;
    expect(renderer).toBeDefined();
    const output = await renderer.render({ context: "we shipped the bundle renderer" });
    expect(output.mimeType).toBe("text/markdown");
    expect(output.extension).toBe("md");
    expect(output.buffer.toString("utf-8")).toBe(`Body content for ${label}.`);
    expect((output.preview as any).isDraft).toBe(true);
    expect((output.preview as any).draftType).toBe(type);
  });
});

describe("bundle renderer", () => {
  it("throws when no artifactIds are provided", async () => {
    const renderer = getArtifactRenderer("bundle")!;
    await expect(renderer.render({ projectId: 1, artifactIds: [] })).rejects.toThrow(
      /at least one artifactId/,
    );
  });

  it("bundles a file-backed artifact into a zip", async () => {
    vi.spyOn(artifactEngine, "getFileBackedArtifact").mockResolvedValueOnce({
      objectPath: "/objects/uploads/xyz",
      extension: "docx",
      row: { id: 10, title: "Sprint Recap", type: "docx" } as never,
    } as never);

    const renderer = getArtifactRenderer("bundle")!;
    const output = await renderer.render({ projectId: 1, artifactIds: [10] });
    expect(output.mimeType).toBe("application/zip");
    expect(output.extension).toBe("zip");
    expect((output.preview as any).fileCount).toBe(1);
    expect(output.buffer.subarray(0, 2).toString()).toBe("PK");
  });

  it("falls back to Markdown for JSON-only decision-intelligence artifacts", async () => {
    vi.spyOn(artifactEngine, "getFileBackedArtifact").mockResolvedValueOnce(null);
    (db.select as any).mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              id: 20,
              projectId: 1,
              type: "tradeoff_matrix",
              title: "Database choice",
              payload: { options: ["Postgres", "Mongo"] },
            },
          ],
        }),
      }),
    });

    const renderer = getArtifactRenderer("bundle")!;
    const output = await renderer.render({ projectId: 1, artifactIds: [20] });
    expect((output.preview as any).fileCount).toBe(1);
    expect((output.preview as any).files[0].type).toBe("tradeoff_matrix");
  });

  it("skips artifacts that are neither file-backed nor decision-intelligence, and still throws if none included", async () => {
    vi.spyOn(artifactEngine, "getFileBackedArtifact").mockResolvedValueOnce(null);
    (db.select as any).mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    });

    const renderer = getArtifactRenderer("bundle")!;
    await expect(renderer.render({ projectId: 1, artifactIds: [999] })).rejects.toThrow(
      /none of the requested artifacts/,
    );
  });
});
