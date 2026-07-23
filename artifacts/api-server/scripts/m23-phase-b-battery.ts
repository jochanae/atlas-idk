/**
 * Milestone 2.3 Phase B — Map Constitution battery harness.
 *
 * Builds the same constitution + evidence + output-contract prompts that
 * expand-node injects, for T1–T6 × Designer/Builder/Storyteller.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server exec tsx scripts/m23-phase-b-battery.ts
 *   ANTHROPIC_API_KEY=... pnpm --filter @workspace/api-server exec tsx scripts/m23-phase-b-battery.ts --live
 *
 * Without --live: writes prompts + expects responses under docs/audits/.../responses/
 * With --live: calls Anthropic and writes responses.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import type { AtlasPerspective } from "../src/lib/atlasPerspective";
import {
  buildConstitutionPolicyBlock,
  buildExpandNodeOutputContract,
  filterTranscriptForLens,
  formatDnaEvidenceForLens,
  formatFlowNodeEvidenceForLens,
  type FlowNodeEvidence,
} from "../src/lib/lensConstitution";
import type { ProjectDNA } from "../src/lib/projectDNA";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const OUT = path.join(ROOT, "docs/audits/milestone-2-3-phase-b-battery");
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
  const dnaEvidence = formatDnaEvidenceForLens(dna, lens);
  const flowEvidence = formatFlowNodeEvidenceForLens(flowNodes, lens);
  const evidenceBlocks = [
    dnaEvidence,
    flowEvidence,
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

async function maybeLiveGenerate(prompt: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");
  const anthropic = new Anthropic({ apiKey: key });
  const message = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");
}

function extractJsonArray(raw: string): unknown[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON array in response");
  return JSON.parse(match[0]) as unknown[];
}

async function main() {
  const live = process.argv.includes("--live");
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as {
    dna: ProjectDNA;
    flowNodes: FlowNodeEvidence[];
    transcript: Array<{ role: string; content: string }>;
  };

  fs.mkdirSync(path.join(OUT, "prompts"), { recursive: true });
  fs.mkdirSync(path.join(OUT, "responses"), { recursive: true });
  fs.mkdirSync(path.join(OUT, "evidence"), { recursive: true });

  const manifest: Array<{ caseId: CaseId; lens: AtlasPerspective; promptFile: string; responseFile: string }> = [];

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
      const promptFile = path.join(OUT, "prompts", `${c.id}-${lens}.txt`);
      const responseFile = path.join(OUT, "responses", `${c.id}-${lens}.json`);
      const evidenceFile = path.join(OUT, "evidence", `${c.id}-${lens}.txt`);
      fs.writeFileSync(promptFile, prompt);
      // Evidence snapshot for review (filter differences)
      const filtered = filterTranscriptForLens(fixture.transcript, lens, 18);
      fs.writeFileSync(
        evidenceFile,
        [
          formatDnaEvidenceForLens(fixture.dna, lens),
          formatFlowNodeEvidenceForLens(fixture.flowNodes, lens),
          "Transcript (weighted):\n" + filtered.map((m) => `${m.role}: ${m.content}`).join("\n"),
        ].join("\n\n"),
      );

      if (live) {
        const raw = await maybeLiveGenerate(prompt);
        const nodes = extractJsonArray(raw);
        fs.writeFileSync(responseFile, JSON.stringify({ caseId: c.id, lens, prompt: c.prompt, nodes, raw }, null, 2));
        console.log(`live ${c.id}/${lens}: ${nodes.length} nodes`);
      } else if (!fs.existsSync(responseFile)) {
        console.log(`prompt ready ${c.id}/${lens} (no response yet)`);
      } else {
        console.log(`existing response ${c.id}/${lens}`);
      }
      manifest.push({ caseId: c.id, lens, promptFile, responseFile });
    }
  }

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Wrote prompts/evidence under ${OUT}`);
  if (!live) {
    console.log("Run with --live when ANTHROPIC_API_KEY is available, or fill responses/ manually for scoring.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
