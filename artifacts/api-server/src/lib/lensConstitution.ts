/**
 * Milestone 2.3 Phase B — Lens Constitution (§3).
 *
 * Governing policy packs for Designer / Builder / Storyteller.
 * Prompts must obey this; adjective-only swaps are invalid.
 *
 * Source of truth: docs/audits/milestone-2-3-lens-differentiation-design.md §3
 * Shared lens ids: artifacts/api-server/src/lib/atlasPerspective.ts
 */

import type { AtlasPerspective } from "./atlasPerspective";
import type { ProjectDNA } from "./projectDNA";

export type LensConstitutionPack = {
  id: AtlasPerspective;
  label: string;
  contract: string;
  primaryQuestion: string;
  mission: string;
  primaryObjective: string;
  primaryQuestions: string[];
  preferredEvidence: string[];
  blindSpots: string[];
  successCriteria: string;
  failureModes: string[];
  whenToDisagree: string[];
  /** Keywords that raise transcript/evidence weight for this lens. */
  evidenceKeywords: string[];
  /** Keywords that indicate the wrong craft — demote when dominant. */
  demoteKeywords: string[];
};

export const LENS_CONSTITUTION: Record<AtlasPerspective, LensConstitutionPack> = {
  designer: {
    id: "designer",
    label: "Designer",
    contract:
      "Optimizes for the user's experience, clarity, usability, and emotional impact.",
    primaryQuestion: "How should this be experienced?",
    mission:
      "Make the product experienceable — what a human encounters, feels, and can do.",
    primaryObjective:
      "Define interaction, hierarchy, emotion, and usability of the proposed change.",
    primaryQuestions: [
      "What does the user see first?",
      "Where do they get stuck?",
      "What emotion should this surface hold?",
      "What is the interaction model?",
      "What fails accessibility or trust?",
    ],
    preferredEvidence: [
      "User journeys",
      "UI states (empty/loading/error/success)",
      "Visual hierarchy",
      "Copy as UI / affordances",
      "Design tokens / Look-adjacent patterns",
      "Flow nodes typed as experience/requirements",
    ],
    blindSpots: [
      "Does not own production architecture, schema design, or infra sequencing",
      "May sketch constraints (needs auth) without specifying tables",
    ],
    successCriteria:
      "A designer or PM could start wireframes / UX writing from the answer alone. Mentions states and interaction, not only features.",
    failureModes: [
      "Speaks as a backend plan",
      'Generic "make it beautiful"',
      "Duplicates Storyteller's meaning essay without interaction specifics",
    ],
    whenToDisagree: [
      "With Builder when the implementation plan would harm clarity, trust, or usability",
      "With Storyteller when the narrative promise cannot be expressed in the actual UI path",
    ],
    evidenceKeywords: [
      "user", "ux", "ui", "experience", "journey", "screen", "page", "flow",
      "empty", "loading", "error", "success", "state", "affordance", "trust",
      "accessibility", "a11y", "hierarchy", "emotion", "feel", "interaction",
      "click", "tap", "onboarding", "persona", "friction", "clarity",
    ],
    demoteKeywords: [
      "schema", "postgres", "migration", "endpoint", "api route", "latency",
      "infrastructure", "kubernetes", "dockerfile", "orm", "sql",
    ],
  },
  builder: {
    id: "builder",
    label: "Builder",
    contract:
      "Optimizes for feasibility, implementation, systems, and execution.",
    primaryQuestion: "How should this be constructed?",
    mission:
      "Make the product buildable — architecture, interfaces, data, and execution order.",
    primaryObjective:
      "Specify what to implement, in what order, against what system boundaries.",
    primaryQuestions: [
      "What components/APIs/data change?",
      "What are dependencies and risks?",
      "What is the smallest shippable slice?",
      "What is explicitly out of scope?",
    ],
    preferredEvidence: [
      "Stack / DNA",
      "Application Model entities",
      "Existing routes/files",
      "Flow requirements / decisions / blockers / sprints",
      "Repo reality when available",
    ],
    blindSpots: [
      "Does not own brand narrative or emotional tone",
      'Mentions UX only as acceptance constraints ("must support empty state"), not as the deliverable',
    ],
    successCriteria:
      "An engineer could open an implementation checklist / PR plan from the answer alone. Type-grouped, sequence-aware, constraint-honest.",
    failureModes: [
      "Motivational prose",
      'Restyling Designer\'s journey as "steps"',
      "Inventing stack that contradicts project DNA",
      "Schema aesthetic without substance",
    ],
    whenToDisagree: [
      "With Designer when the experience implies unbounded scope or impossible latency/authz",
      "With Storyteller when the story implies features that have no execution path this milestone",
    ],
    evidenceKeywords: [
      "api", "route", "schema", "data", "model", "component", "endpoint",
      "auth", "authz", "database", "db", "stack", "deploy", "build",
      "implement", "dependency", "blocker", "sprint", "migration", "file",
      "repo", "integration", "infra", "performance", "ship", "slice",
    ],
    demoteKeywords: [
      "brand story", "founding myth", "emotional arc", "make it feel",
      "narrative journey", "lore", "vibes",
    ],
  },
  storyteller: {
    id: "storyteller",
    label: "Storyteller",
    contract:
      "Optimizes for meaning, communication, narrative, motivation, and long-term identity.",
    primaryQuestion: "What is the meaning, narrative, and human journey?",
    mission:
      "Make the product meaningful — why it exists, who it is for, and how the journey earns trust.",
    primaryObjective:
      "Explain why the change matters, who enters the story, and what commitment it makes.",
    primaryQuestions: [
      "Why does this matter now?",
      "What story does the user enter?",
      "What commitment are we making?",
      "What would make this hollow?",
    ],
    preferredEvidence: [
      "Purpose / wedge / audience (DNA / Blueprint)",
      "Resolved decisions",
      "Risks / tradeoffs",
      "Human problem statements",
      "Flow goal + strategic answers",
    ],
    blindSpots: [
      "Does not own API shapes or CSS systems",
      'Mentions "page" as a narrative beat, not a component tree',
    ],
    successCriteria:
      "A founder or marketer could explain the change's meaning and user journey without reading code. Distinct chapters or arc — not a bullet dump of requirements.",
    failureModes: [
      "Chat summary",
      "Builder list in paragraphs",
      "Designer UI checklist without meaning",
      "Inventing lore not grounded in project knowledge",
    ],
    whenToDisagree: [
      "With Builder when the plan ships capability that does not advance the founding promise",
      "With Designer when the UI optimizes convenience against the story's required friction (trust, ritual, commitment)",
    ],
    evidenceKeywords: [
      "why", "meaning", "story", "narrative", "purpose", "audience", "wedge",
      "promise", "trust", "identity", "journey", "commitment", "vision",
      "origin", "tradeoff", "risk", "hollow", "motivation", "community",
      "member", "belong", "founding",
    ],
    demoteKeywords: [
      "postgres", "migration", "endpoint payload", "css token", "component tree",
      "orm", "kubernetes",
    ],
  },
};

export function getLensConstitution(perspective: AtlasPerspective): LensConstitutionPack {
  return LENS_CONSTITUTION[perspective];
}

/** Structured policy block for model prompts (Map expand + Map-bound chat). */
export function buildConstitutionPolicyBlock(perspective: AtlasPerspective): string {
  const p = getLensConstitution(perspective);
  return [
    `--- LENS CONSTITUTION: ${p.label.toUpperCase()} ---`,
    `Contract: ${p.contract}`,
    `Primary question: ${p.primaryQuestion}`,
    `Mission: ${p.mission}`,
    `Primary objective: ${p.primaryObjective}`,
    `Answer these questions (as relevant to the node/task):`,
    ...p.primaryQuestions.map((q) => `  - ${q}`),
    `Preferred evidence (privilege these; do not invent missing facts):`,
    ...p.preferredEvidence.map((e) => `  - ${e}`),
    `Blind spots (do not own these as deliverables):`,
    ...p.blindSpots.map((b) => `  - ${b}`),
    `Success: ${p.successCriteria}`,
    `Failure modes (avoid):`,
    ...p.failureModes.map((f) => `  - ${f}`),
    `When to disagree with sibling lenses:`,
    ...p.whenToDisagree.map((d) => `  - ${d}`),
    `Cross-cutting rules:`,
    `  - One graph, three jobs — shared knowledge is required; shared outline is forbidden.`,
    `  - No silent restyle — do not produce content that another lens could claim by renaming headings.`,
    `  - Grounding beats invention — prefer DNA / Flow / conversation evidence; inventing stack or lore is a fail.`,
    `  - Disagreement is a feature — you may reject instincts that belong to other lenses.`,
    `--- END LENS CONSTITUTION ---`,
  ].join("\n");
}

/**
 * Per-lens output contract for expand-node.
 * Keeps the shared JSON array transport (Flow UI depends on it) but forces
 * different content jobs so sub-nodes are not isomorphic adjective swaps.
 */
export function buildExpandNodeOutputContract(perspective: AtlasPerspective): string {
  switch (perspective) {
    case "designer":
      return `OUTPUT CONTRACT (Designer — experience decomposition):
- Sub-nodes MUST be experience concerns: journeys, UI states, interaction moments, trust/safety surfaces, accessibility risks, hierarchy choices.
- Prefer types: requirement, decision, blocker, priority.
- Each "details" field MUST name a user-visible state or interaction (empty / loading / error / success / entry / recovery) OR a concrete usability risk.
- DO NOT emit API/schema/infra decomposition as the primary content. At most one constraint node may note "needs auth" without tables.
- Labels should read as experience units a designer could wireframe (e.g. "Empty community state", not "users table").`;
    case "builder":
      return `OUTPUT CONTRACT (Builder — execution decomposition):
- Sub-nodes MUST be construction concerns: components, APIs, data/entities, authz boundaries, dependencies, ship slices, explicit out-of-scope.
- Prefer types: requirement, decision, blocker, sprint, priority.
- Each "details" field MUST be implementation-checkable (what changes, dependency, or risk) — not motivational prose.
- Mention UX only as acceptance constraints (e.g. "must support empty state"), never as the deliverable.
- Stay schema-true: concrete, sequence-aware, constraint-honest. Prefer smallest shippable slice language.
- DO NOT invent stack that contradicts project DNA when DNA is provided.`;
    case "storyteller":
      return `OUTPUT CONTRACT (Storyteller — meaning / narrative decomposition):
- Sub-nodes MUST be narrative/meaning beats: why now, who enters, commitment made, trust earned, what would make it hollow, tradeoffs.
- Prefer types: goal, decision, blocker, priority, requirement (as story stakes — not feature dumps).
- Each "details" field MUST advance meaning or human journey — not a UI checklist and not an API plan.
- Treat "page" / "feature" as narrative beats, not component trees.
- DO NOT invent lore absent from DNA / conversation. Prefer grounded purpose, audience, wedge, decisions, risks.`;
    default:
      return "";
  }
}

/**
 * Per-lens output contract for live Workspace chat (Nexus).
 * Prose / tools allowed — but the *job* must match the Constitution.
 */
export function buildChatOutputContract(perspective: AtlasPerspective): string {
  switch (perspective) {
    case "designer":
      return `OUTPUT CONTRACT (Designer — live chat):
- Answer as an experience designer: journeys, states, hierarchy, interaction, emotion, trust/usability.
- Prefer concrete UI/UX recommendations a designer or PM could act on.
- Do not lead with API/schema/infra plans. Mention systems only as constraints on the experience.
- If the user asks for code, you may help — but frame deliverables as experience outcomes first.`;
    case "builder":
      return `OUTPUT CONTRACT (Builder — live chat):
- Answer as an implementation partner: components, APIs, data, authz, dependencies, ship slices, out-of-scope.
- Prefer checklists, sequences, and constraint-honest plans an engineer could execute.
- Mention UX only as acceptance criteria, not as the main essay.
- Stay schema-true. Do not invent stack that contradicts project DNA.`;
    case "storyteller":
      return `OUTPUT CONTRACT (Storyteller — live chat):
- Answer as a meaning / narrative partner: why this matters, who enters, commitment, trust, what would make it hollow.
- Prefer arcs and grounded purpose over feature dumps or API plans.
- Do not produce a Builder checklist in prose or a Designer UI audit without meaning.
- Do not invent lore absent from DNA / conversation.`;
    default:
      return "";
  }
}

/** Full live-chat Constitution injection (Phase C). */
export function buildLiveChatConstitutionBlock(
  perspective: AtlasPerspective,
  speculate = false,
): string {
  const speculateNote = speculate
    ? `\nSCENARIO MODIFIER (speculate=true): Explore alternate assumptions without converting them into commitments. Keep the active lens identity (${perspective}) — change assumptions, not craft.`
    : "";
  // Continuity is architectural: one engine, one memory, one thread — only the
  // reasoning job changes when perspective switches mid-conversation.
  const continuity = `CONTINUITY (non-negotiable):
- This is the same Workspace conversation and the same project memory.
- When the active perspective changes, change only your reasoning job — do not restart, re-greet, re-brief the whole project, or discard prior turns.
- Carry forward facts, decisions, and open threads already established in this thread.
- You may say you are now answering as ${perspective} only if the user explicitly asks which lens is active; otherwise just reason in that craft.`;
  return `${buildConstitutionPolicyBlock(perspective)}

${buildChatOutputContract(perspective)}
${continuity}${speculateNote}`;
}

export type TranscriptLine = { role: string; content: string };

function scoreLine(text: string, pack: LensConstitutionPack): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of pack.evidenceKeywords) {
    if (lower.includes(kw)) score += 2;
  }
  for (const kw of pack.demoteKeywords) {
    if (lower.includes(kw)) score -= 1;
  }
  // Keep a small base so empty keyword hits still retain recent context.
  return score + 0.25;
}

/**
 * Evidence filter: same transcript store, different retrieval weighting.
 * Returns up to `limit` lines most relevant to the active lens, newest-biased.
 */
export function filterTranscriptForLens(
  lines: TranscriptLine[],
  perspective: AtlasPerspective,
  limit = 18,
): TranscriptLine[] {
  const pack = getLensConstitution(perspective);
  if (lines.length <= limit) return lines;

  const scored = lines.map((line, index) => ({
    line,
    index,
    score: scoreLine(line.content, pack) + index * 0.01, // slight recency bias
  }));
  scored.sort((a, b) => b.score - a.score);
  const keep = new Set(scored.slice(0, limit).map((s) => s.index));
  return lines.filter((_, i) => keep.has(i));
}

/** Format DNA into a lens-weighted evidence block (omit empty fields). */
export function formatDnaEvidenceForLens(
  dna: ProjectDNA | null | undefined,
  perspective: AtlasPerspective,
): string {
  if (!dna) return "";
  const lines: string[] = [];

  const add = (label: string, value: string | null | undefined | string[]) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      if (value.length === 0) return;
      lines.push(`${label}: ${value.join(", ")}`);
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) return;
    lines.push(`${label}: ${trimmed}`);
  };

  // Always allow grounding; order/emphasis differs by lens.
  if (perspective === "designer") {
    add("Audience", dna.audience);
    add("Core emotion", dna.coreEmotion);
    add("Surface strategy", dna.surfaceStrategy);
    add("Format", dna.format);
    add("Purpose", dna.purpose);
    add("Constraints", dna.constraints);
    add("Open questions", dna.openQuestions);
  } else if (perspective === "builder") {
    add("Stack", dna.stack);
    add("Constraints", dna.constraints);
    add("Protected areas", dna.protectedAreas);
    add("Stage", dna.stage);
    add("Open questions", dna.openQuestions);
    add("Purpose", dna.purpose);
    add("Audience", dna.audience);
  } else {
    add("Purpose", dna.purpose);
    add("Wedge", dna.wedge);
    add("Audience", dna.audience);
    add("Positioning", dna.identity);
    add("Differentiator", dna.differentiator);
    add("Core emotion", dna.coreEmotion);
    add("Open questions", dna.openQuestions);
    add("Constraints", dna.constraints);
  }

  if (lines.length === 0) return "";
  return `Project DNA evidence (${perspective}):\n${lines.join("\n")}`;
}

export type FlowNodeEvidence = {
  type?: string;
  label?: string;
  strategicAnswer?: string;
  details?: string;
  question?: string;
  resolved?: boolean;
};

/**
 * Extract a short Flow-graph evidence snippet weighted by lens.
 * Same node store; different selection.
 */
export function formatFlowNodeEvidenceForLens(
  nodes: FlowNodeEvidence[],
  perspective: AtlasPerspective,
  limit = 12,
): string {
  if (!nodes.length) return "";

  const scored = nodes
    .filter((n) => typeof n.label === "string" && n.label.trim())
    .map((n, index) => {
      const type = (n.type ?? "").toLowerCase();
      let score = 0;
      if (perspective === "designer") {
        if (type === "requirement" || type === "goal") score += 3;
        if (type === "blocker") score += 2;
        if (type === "decision") score += 1;
      } else if (perspective === "builder") {
        if (type === "requirement" || type === "sprint" || type === "blocker") score += 3;
        if (type === "decision" || type === "priority") score += 2;
        if (type === "wont") score += 2;
      } else {
        if (type === "goal" || type === "decision") score += 3;
        if (type === "blocker" || type === "wont") score += 2;
        if (n.resolved || n.strategicAnswer) score += 2;
      }
      if (n.strategicAnswer) score += 1;
      return { n, score: score + index * 0.001 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) return "";

  const lines = scored.map(({ n }) => {
    const answer = n.strategicAnswer?.trim();
    const detail = n.details?.trim() || n.question?.trim();
    const suffix = answer
      ? ` → ${answer.slice(0, 120)}`
      : detail
        ? ` — ${detail.slice(0, 100)}`
        : "";
    return `- [${n.type ?? "node"}] ${n.label}${suffix}`;
  });

  return `Flow graph evidence (${perspective}):\n${lines.join("\n")}`;
}
