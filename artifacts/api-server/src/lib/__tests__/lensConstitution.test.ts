import { describe, expect, it } from "vitest";
import {
  LENS_CONSTITUTION,
  buildConstitutionPolicyBlock,
  buildExpandNodeOutputContract,
  filterTranscriptForLens,
  formatDnaEvidenceForLens,
  formatFlowNodeEvidenceForLens,
  getLensConstitution,
} from "../lensConstitution";
import type { ProjectDNA } from "../projectDNA";

describe("LENS_CONSTITUTION packs", () => {
  it("covers all three perspectives with locked contracts", () => {
    expect(getLensConstitution("designer").contract).toContain("experience");
    expect(getLensConstitution("builder").contract).toContain("feasibility");
    expect(getLensConstitution("storyteller").contract).toContain("meaning");
    for (const id of ["designer", "builder", "storyteller"] as const) {
      const pack = LENS_CONSTITUTION[id];
      expect(pack.primaryQuestions.length).toBeGreaterThan(2);
      expect(pack.preferredEvidence.length).toBeGreaterThan(2);
      expect(pack.failureModes.length).toBeGreaterThan(1);
      expect(pack.evidenceKeywords.length).toBeGreaterThan(5);
    }
  });

  it("builds policy blocks that are not adjective-only", () => {
    const designer = buildConstitutionPolicyBlock("designer");
    expect(designer).toContain("LENS CONSTITUTION: DESIGNER");
    expect(designer).toContain("Blind spots");
    expect(designer).toContain("When to disagree");
    expect(designer).toContain("Grounding beats invention");

    const builder = buildConstitutionPolicyBlock("builder");
    expect(builder).toContain("buildable");
    expect(builder).not.toContain("LENS CONSTITUTION: DESIGNER");
  });

  it("emits distinct expand-node output contracts", () => {
    const d = buildExpandNodeOutputContract("designer");
    const b = buildExpandNodeOutputContract("builder");
    const s = buildExpandNodeOutputContract("storyteller");
    expect(d).toContain("experience");
    expect(d).toMatch(/empty|loading|error|success/i);
    expect(b).toContain("implementation");
    expect(b).toContain("schema-true");
    expect(s).toContain("narrative");
    expect(s).toContain("hollow");
    // Contracts must disagree in substance
    expect(d.includes("API/schema") || d.includes("API")).toBe(true);
    expect(b).toContain("acceptance constraints");
  });
});

describe("filterTranscriptForLens", () => {
  const lines = [
    { role: "User", content: "We need a postgres schema and API endpoints for members." },
    { role: "Joy", content: "Empty state and loading trust UX matter for the community page." },
    { role: "User", content: "Why does community matter for the founding promise?" },
    { role: "Joy", content: "Deploy the infra and run migrations next sprint." },
    { role: "User", content: "Accessibility and hierarchy on the join screen." },
    { role: "Joy", content: "The narrative arc is lurker to member." },
    { role: "User", content: "Authz boundaries and ship slice." },
    { role: "Joy", content: "Make the vibe beautiful somehow." },
    { role: "User", content: "What commitment are we making to trust?" },
    { role: "Joy", content: "Component tree and route handlers." },
    { role: "User", content: "padding filler conversation about weather and lunch plans today." },
    { role: "Joy", content: "more filler without craft signal at all in this line." },
    { role: "User", content: "still filler content that should get filtered under tight limits." },
    { role: "Joy", content: "yet another low-signal line for the filter test case." },
    { role: "User", content: "and one more generic chat line without keywords." },
    { role: "Joy", content: "final filler to force ranking under the limit." },
    { role: "User", content: "extra filler seventeen." },
    { role: "Joy", content: "extra filler eighteen." },
    { role: "User", content: "extra filler nineteen." },
    { role: "Joy", content: "extra filler twenty." },
  ];

  it("privileges designer UX lines over schema/infra", () => {
    const filtered = filterTranscriptForLens(lines, "designer", 6);
    const blob = filtered.map((l) => l.content).join(" ");
    expect(blob).toMatch(/empty state|accessibility|hierarchy/i);
    expect(filtered.length).toBeLessThanOrEqual(6);
  });

  it("privileges builder construction lines", () => {
    const filtered = filterTranscriptForLens(lines, "builder", 6);
    const blob = filtered.map((l) => l.content).join(" ");
    expect(blob).toMatch(/schema|api|authz|ship slice|migration|infra/i);
  });

  it("privileges storyteller meaning lines", () => {
    const filtered = filterTranscriptForLens(lines, "storyteller", 6);
    const blob = filtered.map((l) => l.content).join(" ");
    expect(blob).toMatch(/founding|narrative|commitment|trust/i);
  });
});

describe("formatDnaEvidenceForLens", () => {
  const dna: ProjectDNA = {
    purpose: "Help founders think clearly",
    coreEmotion: "calm confidence",
    audience: "solo founders",
    identity: "strategic partner",
    format: "workspace",
    surfaceStrategy: "conversation-first",
    wedge: "decision memory",
    differentiator: "living ledger",
    stack: ["react", "postgres"],
    protectedAreas: ["ledger"],
    constraints: ["mobile-first"],
    openQuestions: ["pricing?"],
    stage: "Shape",
    confidenceScore: 0.4,
    lastEvolvedAt: null,
    lastExtractedAt: null,
  };

  it("emphasizes stack for builder and purpose for storyteller", () => {
    const builder = formatDnaEvidenceForLens(dna, "builder");
    const story = formatDnaEvidenceForLens(dna, "storyteller");
    expect(builder.indexOf("Stack")).toBeLessThan(builder.indexOf("Purpose"));
    expect(story.indexOf("Purpose")).toBeLessThan(story.indexOf("Constraints"));
    expect(story).toContain("Wedge");
  });
});

describe("formatFlowNodeEvidenceForLens", () => {
  const nodes = [
    { type: "goal", label: "Community home", strategicAnswer: "A place to belong", resolved: true },
    { type: "requirement", label: "Join flow UX" },
    { type: "sprint", label: "Ship authz slice" },
    { type: "blocker", label: "Trust risk" },
    { type: "decision", label: "Paid vs free", strategicAnswer: "Free v1", resolved: true },
  ];

  it("selects different node emphasis per lens", () => {
    const designer = formatFlowNodeEvidenceForLens(nodes, "designer", 3);
    const builder = formatFlowNodeEvidenceForLens(nodes, "builder", 3);
    const story = formatFlowNodeEvidenceForLens(nodes, "storyteller", 3);
    expect(designer).toContain("Join flow UX");
    expect(builder).toContain("Ship authz slice");
    expect(story).toMatch(/Community home|Paid vs free|Trust risk/);
  });
});
