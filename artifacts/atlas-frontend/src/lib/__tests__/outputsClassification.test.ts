import { describe, it, expect } from "vitest";
import { classify } from "../outputsClassification";

describe("outputsClassification — production inventory (242 rows)", () => {
  it("history_snapshot: excluded from both (timeline-only)", () => {
    const r = classify({ source: null, type: "history_snapshot", extension: null });
    expect(r.kind).toBe("snapshot");
    expect(r.includedInOutputs).toBe(false);
    expect(r.includedInArtifacts).toBe(false);
    expect(r.reason).toBe("rule:history_snapshot");
  });

  it("visual_sketch: in BOTH surfaces (amended)", () => {
    const r = classify({ source: null, type: "visual_sketch", extension: null });
    expect(r.kind).toBe("sketch");
    expect(r.tags).toEqual(["Visual sketch"]);
    expect(r.includedInOutputs).toBe(true);
    expect(r.includedInArtifacts).toBe(true);
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
    expect(r.includedInArtifacts).toBe(false);
  });

  it("pdf: pdf, Outputs only", () => {
    const r = classify({ source: "artifact-engine", type: "pdf", extension: "pdf" });
    expect(r.kind).toBe("pdf");
    expect(r.includedInArtifacts).toBe(false);
  });

  it("mermaid: diagram, in BOTH surfaces (amended)", () => {
    const r = classify({ source: "artifact-engine", type: "mermaid", extension: "mmd" });
    expect(r.kind).toBe("diagram");
    expect(r.tags).toEqual(["Diagram · Mermaid"]);
    expect(r.includedInOutputs).toBe(true);
    expect(r.includedInArtifacts).toBe(true);
  });

  it("draft_email vs draft_pr: type discriminates on shared ext=md", () => {
    const email = classify({ source: "artifact-engine", type: "draft_email", extension: "md" });
    const pr = classify({ source: "artifact-engine", type: "draft_pr", extension: "md" });
    expect(email.tags).toEqual(["Document · Email draft"]);
    expect(pr.tags).toEqual(["Document · PR description"]);
    expect(email.reason).toBe("rule:draft_email");
    expect(pr.reason).toBe("rule:draft_pr");
  });
});

describe("outputsClassification — dev-only rows expected post-deploy", () => {
  it("html-app: prototype, in both surfaces", () => {
    const r = classify({ source: "artifact-engine", type: "html-app", extension: "html" });
    expect(r.kind).toBe("html-app");
    expect(r.includedInArtifacts).toBe(true);
  });

  it("html_preview alias → html-app", () => {
    const r = classify({ source: "artifact-engine", type: "html_preview", extension: "html" });
    expect(r.kind).toBe("html-app");
    expect(r.includedInArtifacts).toBe(true);
  });

  it("raw type='html' → html-app (amended, backend htmlRenderer emits this)", () => {
    const r = classify({ source: "artifact-engine", type: "html", extension: "html" });
    expect(r.kind).toBe("html-app");
    expect(r.includedInOutputs).toBe(true);
    expect(r.includedInArtifacts).toBe(true);
    expect(r.reason).toBe("rule:html_raw");
  });

  it("chart: technical, in both surfaces", () => {
    const r = classify({ source: "artifact-engine", type: "chart", extension: "svg" });
    expect(r.kind).toBe("chart");
    expect(r.includedInArtifacts).toBe(true);
  });

  it("docx: document, Outputs only", () => {
    const r = classify({ source: "artifact-engine", type: "docx", extension: "docx" });
    expect(r.kind).toBe("document");
    expect(r.tags).toEqual(["Document"]);
  });
});

describe("outputsClassification — real dev rows (frontend row shape)", () => {
  // Frontend ArtifactRecord has NO DB `source` column. Slice 3 will call
  // classify() with source undefined/omitted. These tests prove the
  // amended source="*" wildcard rules still match correctly.

  it("Axiom Activity Ledger (html-app, source omitted) classifies as html-app in both", () => {
    const r = classify({
      type: "html-app",
      metadata: { extension: "html" },
    });
    expect(r.kind).toBe("html-app");
    expect(r.includedInOutputs).toBe(true);
    expect(r.includedInArtifacts).toBe(true);
    expect(r.reason).toBe("rule:html-app");
  });

  it("raw HTML row (source omitted) still classifies as html-app", () => {
    const r = classify({ type: "html", metadata: { extension: "html" } });
    expect(r.kind).toBe("html-app");
    expect(r.includedInArtifacts).toBe(true);
  });

  it("IntoIQ docx (source omitted) classifies as document", () => {
    const r = classify({ type: "docx", metadata: { extension: "docx" } });
    expect(r.kind).toBe("document");
  });

  it("production pptx row (source omitted) still matches", () => {
    const r = classify({ type: "pptx", metadata: { extension: "pptx" } });
    expect(r.kind).toBe("presentation");
  });
});

describe("outputsClassification — metadata fallback, unmatched, safety", () => {
  it("falls back to metadata.extension when extension arg is missing", () => {
    const r = classify({ type: "pdf", metadata: { extension: "pdf" } });
    expect(r.kind).toBe("pdf");
  });

  it("unknown combination → other, excluded from both, reason traceable", () => {
    const r = classify({ type: "future_type", extension: "xyz" });
    expect(r.kind).toBe("other");
    expect(r.includedInOutputs).toBe(false);
    expect(r.includedInArtifacts).toBe(false);
    expect(r.reason).toContain("unmatched:");
    expect(r.reason).toContain("type=future_type");
    expect(r.reason).toContain("ext=xyz");
  });

  it("history_snapshot strictly requires null source (would-be artifact-engine variant → other)", () => {
    const r = classify({ source: "artifact-engine", type: "history_snapshot", extension: null });
    expect(r.kind).toBe("other");
  });

  it("visual_sketch strictly requires null source", () => {
    const r = classify({ source: "artifact-engine", type: "visual_sketch", extension: null });
    expect(r.kind).toBe("other");
  });

  it("case-insensitive on all fields", () => {
    const r = classify({ source: "Artifact-Engine", type: "PPTX", extension: "PPTX" });
    expect(r.kind).toBe("presentation");
  });
});
