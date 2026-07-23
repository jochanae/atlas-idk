/**
 * Phase C live-chat battery harness — builds Nexus-style Constitution prompts
 * for T1–T6 (conversational surface, not expand-node JSON).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AtlasPerspective } from "../atlasPerspective";
import {
  buildLiveChatConstitutionBlock,
  formatDnaEvidenceForLens,
} from "../lensConstitution";
import type { ProjectDNA } from "../projectDNA";

const OUT = path.resolve(
  process.cwd(),
  "../../docs/audits/milestone-2-3-phase-c-battery",
);
const FIXTURE_PATH = path.join(OUT, "fixture-reveal.json");

const CASES = [
  { id: "T1", prompt: "Build a community page for Reveal." },
  { id: "T2", prompt: "Should Reveal charge for community access in v1?" },
  { id: "T3", prompt: "Add real-time notifications when someone replies in the community." },
  { id: "T4", prompt: "Design a weekly group Bible study rhythm inside Reveal’s community." },
  { id: "T5", prompt: "Help me plan my next four weeks as founder of Reveal." },
  { id: "T6", prompt: "Write the opening of the community page — the first thing a new member reads." },
] as const;

const LENSES: AtlasPerspective[] = ["designer", "builder", "storyteller"];

function buildLiveChatPrompt(args: {
  casePrompt: string;
  lens: AtlasPerspective;
  dna: ProjectDNA;
  speculate?: boolean;
}): string {
  const { casePrompt, lens, dna, speculate = false } = args;
  const dnaBlock = formatDnaEvidenceForLens(dna, lens);
  return [
    "You are Joy in a live Workspace conversation (surfaceContext=workspace).",
    "One conversation engine — apply the active Constitution only; do not invent a parallel prompt system.",
    "",
    buildLiveChatConstitutionBlock(lens, speculate),
    "",
    dnaBlock || "(no DNA)",
    "",
    `User message (identical across lenses): ${casePrompt}`,
    "",
    "Respond in conversational prose as Joy under this lens. Do not emit expand-node JSON.",
  ].join("\n");
}

describe("m2.3 Phase C live-chat battery harness", () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as {
    dna: ProjectDNA;
  };

  it("writes live-chat Constitution prompts for T1–T6", () => {
    fs.mkdirSync(path.join(OUT, "prompts"), { recursive: true });
    for (const c of CASES) {
      for (const lens of LENSES) {
        const prompt = buildLiveChatPrompt({
          casePrompt: c.prompt,
          lens,
          dna: fixture.dna,
        });
        fs.writeFileSync(path.join(OUT, "prompts", `${c.id}-${lens}.txt`), prompt);
        expect(prompt).toContain("LENS CONSTITUTION");
        expect(prompt).toContain("CONTINUITY");
        expect(prompt).toContain(c.prompt);
        expect(prompt).toContain("OUTPUT CONTRACT");
      }
    }
  });
});
