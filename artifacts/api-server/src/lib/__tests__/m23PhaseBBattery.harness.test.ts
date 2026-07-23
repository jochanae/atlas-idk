/**
 * Phase B battery harness — builds real Constitution prompts + evidence
 * snapshots for T1–T6, and validates lens-weighted evidence differs.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AtlasPerspective } from "../atlasPerspective";
import {
  buildConstitutionPolicyBlock,
  buildExpandNodeOutputContract,
  filterTranscriptForLens,
  formatDnaEvidenceForLens,
  formatFlowNodeEvidenceForLens,
  type FlowNodeEvidence,
} from "../lensConstitution";
import type { ProjectDNA } from "../projectDNA";

const OUT = path.resolve(
  process.cwd(),
  "../../docs/audits/milestone-2-3-phase-b-battery",
);
const FIXTURE_PATH = path.join(OUT, "fixture-reveal.json");

type CaseId = "T1" | "T2" | "T3" | "T4" | "T5" | "T6";

const CASES: Array<{
  id: CaseId;
  prompt: string;
  nodeLabel: string;
  nodeType: string;
}> = [
  { id: "T1", prompt: "Build a community page for Reveal.", nodeLabel: "Community page", nodeType: "goal" },
  { id: "T2", prompt: "Should Reveal charge for community access in v1?", nodeLabel: "Paid vs free v1", nodeType: "decision" },
  { id: "T3", prompt: "Add real-time notifications when someone replies in the community.", nodeLabel: "Reply notifications", nodeType: "requirement" },
  { id: "T4", prompt: "Design a weekly group Bible study rhythm inside Reveal’s community.", nodeLabel: "Weekly Bible study rhythm", nodeType: "requirement" },
  { id: "T5", prompt: "Help me plan my next four weeks as founder of Reveal.", nodeLabel: "Founder next four weeks", nodeType: "sprint" },
  { id: "T6", prompt: "Write the opening of the community page — the first thing a new member reads.", nodeLabel: "Community page opening", nodeType: "goal" },
];

const LENSES: AtlasPerspective[] = ["designer", "builder", "storyteller"];

function buildExpandPrompt(args: {
  casePrompt: string;
  nodeLabel: string;
  nodeType: string;
  lens: AtlasPerspective;
  dna: ProjectDNA;
  flowNodes: FlowNodeEvidence[];
  transcript: Array<{ role: string; content: string }>;
}): string {
  const { casePrompt, nodeLabel, nodeType, lens, dna, flowNodes, transcript } = args;
  const filtered = filterTranscriptForLens(transcript, lens, 18);
  const transcriptContext = filtered.map((m) => `${m.role}: ${m.content}`).join("\n");
  const evidenceBlocks = [
    formatDnaEvidenceForLens(dna, lens),
    formatFlowNodeEvidenceForLens(flowNodes, lens),
    transcriptContext
      ? `Project conversation evidence (lens-weighted):\n${transcriptContext.slice(0, 2800)}`
      : "",
    `User ask (identical across lenses): ${casePrompt}`,
  ].filter(Boolean).join("\n\n");

  return `You are expanding a specific node in a project's Axiom Flow map into sub-nodes under a constitutional lens.

Node being expanded: "${nodeLabel}" (type: ${nodeType})
Active lens: ${lens}

${buildConstitutionPolicyBlock(lens)}

${buildExpandNodeOutputContract(lens)}

Generate 4–7 sub-nodes that break this node down one level deeper under THIS lens's job only.
Shared requirements:
- Be specific to this project's evidence (not generic)
- Each sub-node is concrete and represents a real concern owned by this lens
- Use these node types: requirement, blocker, decision, priority, sprint, goal
- If a decision or answer for a sub-node is clearly and explicitly stated in the evidence, set resolved: true and add a "strategicAnswer" field with the actual answer (1–2 sentences, in the user's own words). Omit "strategicAnswer" if not unambiguously stated — do not infer or guess.
- Do not produce an outline another lens could claim by renaming headings.

Grounding evidence:
${evidenceBlocks}

Respond with ONLY a JSON array. Each element MUST have these fields:
{"id":"short-slug","label":"Concise label (4–6 words)","type":"requirement|blocker|decision|priority|sprint","resolved":false,"meta":"must|should|could","details":"one sentence of lens-specific context","x":0,"y":0}
Only add "strategicAnswer":"<actual answer from evidence>" and set resolved:true when the answer is unambiguously present above.`;
}

describe("m2.3 Phase B battery harness", () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as {
    dna: ProjectDNA;
    flowNodes: FlowNodeEvidence[];
    transcript: Array<{ role: string; content: string }>;
  };

  it("writes Constitution prompts + evidence snapshots for T1–T6", () => {
    fs.mkdirSync(path.join(OUT, "prompts"), { recursive: true });
    fs.mkdirSync(path.join(OUT, "evidence"), { recursive: true });
    fs.mkdirSync(path.join(OUT, "responses"), { recursive: true });

    for (const c of CASES) {
      for (const lens of LENSES) {
        const prompt = buildExpandPrompt({
          casePrompt: c.prompt,
          nodeLabel: c.nodeLabel,
          nodeType: c.nodeType,
          lens,
          dna: fixture.dna,
          flowNodes: fixture.flowNodes,
          transcript: fixture.transcript,
        });
        fs.writeFileSync(path.join(OUT, "prompts", `${c.id}-${lens}.txt`), prompt);
        const filtered = filterTranscriptForLens(fixture.transcript, lens, 18);
        fs.writeFileSync(
          path.join(OUT, "evidence", `${c.id}-${lens}.txt`),
          [
            formatDnaEvidenceForLens(fixture.dna, lens),
            formatFlowNodeEvidenceForLens(fixture.flowNodes, lens),
            "Transcript (weighted):\n" + filtered.map((m) => `${m.role}: ${m.content}`).join("\n"),
          ].join("\n\n"),
        );
        expect(prompt).toContain("LENS CONSTITUTION");
        expect(prompt).toContain(c.prompt);
      }
    }
  });

  it("weights Reveal evidence differently per lens", () => {
    const d = formatDnaEvidenceForLens(fixture.dna, "designer");
    const b = formatDnaEvidenceForLens(fixture.dna, "builder");
    const s = formatDnaEvidenceForLens(fixture.dna, "storyteller");
    expect(d.indexOf("Audience")).toBeLessThan(d.indexOf("Purpose"));
    expect(b).toContain("Stack: react, postgres, node");
    expect(b.indexOf("Stack")).toBeLessThan(b.indexOf("Purpose"));
    expect(s).toContain("Wedge");
    expect(s.indexOf("Purpose")).toBeLessThan(s.indexOf("Constraints"));

    const flowD = formatFlowNodeEvidenceForLens(fixture.flowNodes, "designer", 4);
    const flowB = formatFlowNodeEvidenceForLens(fixture.flowNodes, "builder", 4);
    const flowS = formatFlowNodeEvidenceForLens(fixture.flowNodes, "storyteller", 4);
    expect(flowD).toMatch(/Join without shame|Onboarding|Community home/i);
    expect(flowB).toMatch(/Ship member profiles|Weekly study|blocker|sprint/i);
    expect(flowS).toMatch(/Community home|Paid vs free|Trust risk|Notifications/i);
  });

  it("emits non-isomorphic output contracts for T1", () => {
    const contracts = LENSES.map((l) => buildExpandNodeOutputContract(l));
    expect(new Set(contracts).size).toBe(3);
    expect(contracts[0]).toMatch(/empty|loading|error|success/i);
    expect(contracts[1]).toContain("schema-true");
    expect(contracts[2]).toContain("hollow");
  });
});
