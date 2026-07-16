import { describe, it, expect } from "vitest";
import { classify } from "../outputsClassification";

describe("outputsClassification — production inventory (242 rows)", () => {
  it("history_snapshot: excluded from both surfaces (timeline-only)", () => {
    const r = classify({ source: null, type: "history_snapshot", extension: null });
    expect(r.kind).toBe("snapshot");
    expect(r.includedInOutputs).toBe(false);
    expect(r.includedInArtifacts).toBe(false);
    expect(r.reason).toBe("rule:history_snapshot");
  });

  it("visual_sketch: Outputs only", () => {
    const r = classify({ source: null, type: "visual_sketch", extension: null });
    expect(r.kind).toBe("sketch");
    expect(r.tags).toEqual(["Sketch"]);
    expect(r.includedInOutputs).toBe(true);
    expect(r.includedInArtifacts).toBe(false);
  });

  it("pptx: presentation, Outputs only", () => {
    const r = classify({ source: "artifact-engine", type: "pptx", extension: "pptx" });
    expect(r.kind).toBe("presentation");
    expect(r.includedInOutputs).toBe(true);
    expect(r.includedInArtifacts).toBe(false);
  });

  it("xlsx: spreadsheet, Outputs only", () => {
    const r = classify({ source: "artifact-engine", type: "xlsx", extension: "xlsx" });
    expect(r.kind).toBe("spreadsheet");
    expect(r.includedInOutputs).toBe(true);
    expect(r.includedInArtifacts).toBe(false);
  });

  it("pdf: pdf, Outputs only", () => {
    const r = classify({ source: "artifact-engine", type: "pdf", extension: "pdf" });
    expect(r.kind).toBe("pdf");
  });

  it("mermaid: diagram, Outputs only", () => {
    const r = classify({ source: "artifact-engine", type: "mermaid", extension: "mmd" });
    expect(r.kind).toBe("diagram");
    expect(r.tags).toEqual(["Diagram · Mermaid"]);
  });

  it("draft_email vs draft_pr: type discriminates on shared extension=md", () => {
    const email = classify({ source: "artifact-engine", type: "draft_email", extension: "md" });
    const pr = classify({ source: "artifact-engine", type: "draft_pr", extension: "md" });
    expect(email.kind).toBe("document");
    expect(pr.kind).toBe("document");
    expect(email.tags).toEqual(["Document · Email draft"]);
    expect(pr.tags).toEqual(["Document · PR description"]);
    expect(email.reason).toBe("rule:draft_email");
    expect(pr.reason).toBe("rule:draft_pr");
  });
});

describe("outputsClassification — dev-only rows expected post-deploy", () => {
  it("html-app: canonical prototype, in both surfaces", () => {
    const r = classify({ source: "artifact-engine", type: "html-app", extension: "html" });
    expect(r.kind).toBe("html-app");
    expect(r.includedInOutputs).toBe(true);
    expect(r.includedInArtifacts).toBe(true);
  });

  it("html_preview: aliases to html-app", () => {
    const r = classify({ source: "artifact-engine", type: "html_preview", extension: "html" });
    expect(r.kind).toBe("html-app");
    expect(r.includedInArtifacts).toBe(true);
  });

  it("docx: document, Outputs only", () => {
    const r = classify({ source: "artifact-engine", type: "docx", extension: "docx" });
    expect(r.kind).toBe("document");
    expect(r.tags).toEqual(["Document"]);
  });
});

describe("outputsClassification — metadata fallback and unmatched", () => {
  it("falls back to metadata.extension when extension arg is missing", () => {
    const r = classify({
      source: "artifact-engine",
      type: "pdf",
      metadata: { extension: "pdf" },
    });
    expect(r.kind).toBe("pdf");
  });

  it("unknown combination -> other, excluded from both surfaces, reason traceable", () => {
    const r = classify({ source: "artifact-engine", type: "future_type", extension: "xyz" });
    expect(r.kind).toBe("other");
    expect(r.includedInOutputs).toBe(false);
    expect(r.includedInArtifacts).toBe(false);
    expect(r.reason).toContain("unmatched:");
    expect(r.reason).toContain("type=future_type");
    expect(r.reason).toContain("ext=xyz");
  });

  it("null source is required to match history_snapshot (would-be-artifact-engine variant does not match)", () => {
    const r = classify({ source: "artifact-engine", type: "history_snapshot", extension: null });
    expect(r.kind).toBe("other");
  });

  it("case-insensitive on all fields", () => {
    const r = classify({ source: "Artifact-Engine", type: "PPTX", extension: "PPTX" });
    expect(r.kind).toBe("presentation");
  });
});
