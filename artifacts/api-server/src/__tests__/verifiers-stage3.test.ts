import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import "../lib/verifiers/xlsxVerifier";
import "../lib/verifiers/chartVerifier";
import "../lib/verifiers/mermaidVerifier";
import "../lib/verifiers/draftVerifier";
import "../lib/verifiers/bundleVerifier";
import { getArtifactVerifier } from "../lib/verificationEngine";
import type { ArtifactRenderOutput } from "../lib/artifactEngine";

function fakeRendered(overrides: Partial<ArtifactRenderOutput> = {}): ArtifactRenderOutput {
  return {
    buffer: Buffer.from(""),
    title: "t",
    mimeType: "application/octet-stream",
    extension: "bin",
    preview: {},
    ...overrides,
  };
}

async function buildValidXlsx(sheetCount: number, withFormula: boolean): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (let i = 0; i < sheetCount; i++) {
    const sheet = workbook.addWorksheet(`Sheet${i + 1}`);
    sheet.addRow(["A", "B"]);
    sheet.addRow([1, 2]);
    if (withFormula) sheet.addRow([{ formula: "SUM(A2:A2)" }, 3]);
  }
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

describe("xlsxVerifier", () => {
  const verifier = getArtifactVerifier("xlsx")!;

  it("passes a valid xlsx fixture matching expected sheet count, no formulas requested", async () => {
    const buffer = await buildValidXlsx(2, false);
    const checks = await verifier.verify({
      buffer,
      rendered: fakeRendered({ expectedCounts: { sheets: 2 }, preview: { formulasRequested: false } }),
      input: {},
      projectId: 1,
    });
    expect(checks.every((c) => c.pass)).toBe(true);
    expect(checks.find((c) => c.key === "xlsx-formulas-preserved")).toBeUndefined();
  });

  it("fails a deliberately broken xlsx (not a zip)", async () => {
    const buffer = Buffer.from("not a real workbook");
    const checks = await verifier.verify({ buffer, rendered: fakeRendered(), input: {}, projectId: 1 });
    const openCheck = checks.find((c) => c.key === "xlsx-opens");
    expect(openCheck?.pass).toBe(false);
  });

  it("fails when sheet count is fewer than expected", async () => {
    const buffer = await buildValidXlsx(1, false);
    const checks = await verifier.verify({
      buffer,
      rendered: fakeRendered({ expectedCounts: { sheets: 3 } }),
      input: {},
      projectId: 1,
    });
    const sheetCheck = checks.find((c) => c.key === "xlsx-sheet-count");
    expect(sheetCheck?.pass).toBe(false);
    expect(sheetCheck?.reason).toMatch(/Expected 3 sheets but only found 1/);
  });

  it("passes formula preservation check when formulas were requested and present", async () => {
    const buffer = await buildValidXlsx(1, true);
    const checks = await verifier.verify({
      buffer,
      rendered: fakeRendered({ preview: { formulasRequested: true } }),
      input: {},
      projectId: 1,
    });
    const formulaCheck = checks.find((c) => c.key === "xlsx-formulas-preserved");
    expect(formulaCheck?.pass).toBe(true);
  });

  it("fails formula preservation check when formulas were requested but none exist", async () => {
    const buffer = await buildValidXlsx(1, false);
    const checks = await verifier.verify({
      buffer,
      rendered: fakeRendered({ preview: { formulasRequested: true } }),
      input: {},
      projectId: 1,
    });
    const formulaCheck = checks.find((c) => c.key === "xlsx-formulas-preserved");
    expect(formulaCheck?.pass).toBe(false);
    expect(formulaCheck?.reason).toMatch(/no <f> formula element/);
  });
});

describe("chartVerifier", () => {
  const verifier = getArtifactVerifier("chart")!;

  it("passes a valid nonempty SVG chart", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect x="0" y="0" width="50" height="100" /><text x="10" y="10">Label</text></svg>`;
    const checks = await verifier.verify({
      buffer: Buffer.from(svg, "utf-8"),
      rendered: fakeRendered(),
      input: {},
      projectId: 1,
    });
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it("fails a malformed (non-well-formed XML) SVG", async () => {
    const svg = `<svg><rect x="0"></svg`;
    const checks = await verifier.verify({
      buffer: Buffer.from(svg, "utf-8"),
      rendered: fakeRendered(),
      input: {},
      projectId: 1,
    });
    const wellFormedCheck = checks.find((c) => c.key === "chart-svg-well-formed");
    expect(wellFormedCheck?.pass).toBe(false);
  });

  it("fails an empty SVG with no drawable shapes", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"></svg>`;
    const checks = await verifier.verify({
      buffer: Buffer.from(svg, "utf-8"),
      rendered: fakeRendered(),
      input: {},
      projectId: 1,
    });
    const nonEmptyCheck = checks.find((c) => c.key === "chart-nonempty");
    expect(nonEmptyCheck?.pass).toBe(false);
  });
});

describe("mermaidVerifier", () => {
  const verifier = getArtifactVerifier("mermaid")!;

  it("passes valid flowchart mermaid source", async () => {
    const source = "flowchart TD\n  A[Start] --> B[End]";
    const checks = await verifier.verify({
      buffer: Buffer.from(source, "utf-8"),
      rendered: fakeRendered({ preview: { diagramType: "flowchart" } }),
      input: {},
      projectId: 1,
    });
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it("passes valid sequence diagram mermaid source", async () => {
    const source = "sequenceDiagram\n  Alice->>Bob: Hello";
    const checks = await verifier.verify({
      buffer: Buffer.from(source, "utf-8"),
      rendered: fakeRendered({ preview: { diagramType: "sequence" } }),
      input: {},
      projectId: 1,
    });
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it("fails an empty mermaid file", async () => {
    const checks = await verifier.verify({
      buffer: Buffer.from("", "utf-8"),
      rendered: fakeRendered(),
      input: {},
      projectId: 1,
    });
    expect(checks.find((c) => c.key === "mermaid-nonempty")?.pass).toBe(false);
  });

  it("fails mermaid source with no recognized directive", async () => {
    const source = "this is just plain text, not mermaid syntax at all";
    const checks = await verifier.verify({
      buffer: Buffer.from(source, "utf-8"),
      rendered: fakeRendered(),
      input: {},
      projectId: 1,
    });
    expect(checks.find((c) => c.key === "mermaid-valid-directive")?.pass).toBe(false);
  });

  it("fails mermaid source that is directive-only with no body", async () => {
    const source = "flowchart TD";
    const checks = await verifier.verify({
      buffer: Buffer.from(source, "utf-8"),
      rendered: fakeRendered({ preview: { diagramType: "flowchart" } }),
      input: {},
      projectId: 1,
    });
    expect(checks.find((c) => c.key === "mermaid-has-body")?.pass).toBe(false);
  });
});

describe("draftVerifier", () => {
  const verifier = getArtifactVerifier("draft_email")!;

  it("passes a valid email draft matching its declared subtype", async () => {
    const body = "Subject: Update\n\nHi team,\n\nHere's the update.\n\nBest,\nAtlas";
    const checks = await verifier.verify({
      buffer: Buffer.from(body, "utf-8"),
      rendered: fakeRendered({ preview: { draftType: "draft_email" } }),
      input: {},
      projectId: 1,
    });
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it("fails an empty draft body", async () => {
    const checks = await verifier.verify({
      buffer: Buffer.from("", "utf-8"),
      rendered: fakeRendered({ preview: { draftType: "draft_email" } }),
      input: {},
      projectId: 1,
    });
    expect(checks.find((c) => c.key === "draft-nonempty-body")?.pass).toBe(false);
  });

  it("fails when the generated content is tagged with a mismatched subtype", async () => {
    const body = "## What & Why\nSome PR description content.";
    const checks = await verifier.verify({
      buffer: Buffer.from(body, "utf-8"),
      rendered: fakeRendered({ preview: { draftType: "draft_pr" } }),
      input: {},
      projectId: 1,
    });
    const matchCheck = checks.find((c) => c.key === "draft-subtype-matches-request");
    expect(matchCheck?.pass).toBe(false);
    expect(matchCheck?.reason).toMatch(/Requested "draft_email" but the generated draft is tagged as "draft_pr"/);
  });
});

describe("bundleVerifier", () => {
  const verifier = getArtifactVerifier("bundle")!;

  it("fails a deliberately corrupted bundle zip", async () => {
    const buffer = Buffer.from("not a real zip file at all");
    const checks = await verifier.verify({
      buffer,
      rendered: fakeRendered({ preview: { files: [{ id: 1, title: "x", type: "pptx", fileName: "x.pptx" }] } }),
      input: {},
      projectId: 1,
    });
    expect(checks.find((c) => c.key === "bundle-zip-opens")?.pass).toBe(false);
  });

  it("fails when preview declares no promised files", async () => {
    const JSZipMod = (await import("jszip")).default;
    const zip = new JSZipMod();
    zip.file("empty.txt", "hi");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const checks = await verifier.verify({
      buffer,
      rendered: fakeRendered({ preview: { files: [] } }),
      input: {},
      projectId: 1,
    });
    expect(checks.find((c) => c.key === "bundle-has-promised-files")?.pass).toBe(false);
  });

  it("fails when a promised file is missing from the zip", async () => {
    const JSZipMod = (await import("jszip")).default;
    const zip = new JSZipMod();
    zip.file("actual.pptx", "content");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const checks = await verifier.verify({
      buffer,
      rendered: fakeRendered({
        preview: { files: [{ id: 1, title: "Promised", type: "pptx", fileName: "promised.pptx" }] },
      }),
      input: {},
      projectId: 1,
    });
    expect(checks.find((c) => c.key === "bundle-all-files-present-in-zip")?.pass).toBe(false);
  });
});
