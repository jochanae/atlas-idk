// Tier 1 memory API client — canonical project intake.
//
// Backend contract (docs/handoffs/2026-07-05-agent-loop-refactor-backend.md sibling):
//   GET  /api/memory/tier1/:projectId  → { answers, updatedAt } | 404
//   POST /api/memory/tier1             { projectId, answers }   → 201 { answers, updatedAt }
//   PUT  /api/memory/tier1/:projectId  { answers: Partial }     → 200 { answers, updatedAt }

export type Tier1Answers = {
  building: string;
  audience: string;
  problem: string;
  outOfScope: string;
  successSignal: string;
  constraints: string;
};

export type Tier1Memory = {
  answers: Tier1Answers;
  updatedAt: string;
};

export const TIER1_QUESTIONS: Array<{
  key: keyof Tier1Answers;
  label: string;
  hint: string;
  placeholder: string;
}> = [
  {
    key: "building",
    label: "What are you building?",
    hint: "One sentence. The thing itself, not the pitch.",
    placeholder: "A decision-led builder for solo operators…",
  },
  {
    key: "audience",
    label: "Who is it for?",
    hint: "Be specific. A named archetype beats a demographic.",
    placeholder: "Solo founders who ship without a team…",
  },
  {
    key: "problem",
    label: "What problem does it solve?",
    hint: "What breaks today without it?",
    placeholder: "They build the wrong thing fast, then can't undo it…",
  },
  {
    key: "outOfScope",
    label: "What's explicitly out of scope?",
    hint: "The lines you won't cross — say them now.",
    placeholder: "No team collaboration. No AI-writes-your-strategy…",
  },
  {
    key: "successSignal",
    label: "How will you know it's working?",
    hint: "One observable signal — not a KPI dashboard.",
    placeholder: "Users commit a decision within their first session…",
  },
  {
    key: "constraints",
    label: "What constraints are you working within?",
    hint: "Time, money, tech, self — whatever binds you.",
    placeholder: "Solo, nights only, no external funding…",
  },
];

export const EMPTY_TIER1: Tier1Answers = {
  building: "",
  audience: "",
  problem: "",
  outOfScope: "",
  successSignal: "",
  constraints: "",
};

export async function getTier1Memory(projectId: number): Promise<Tier1Memory | null> {
  const r = await fetch(`/api/memory/tier1/${projectId}`, { credentials: "include" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Tier1 GET failed: ${r.status}`);
  return (await r.json()) as Tier1Memory;
}

export async function createTier1Memory(projectId: number, answers: Tier1Answers): Promise<Tier1Memory> {
  const r = await fetch(`/api/memory/tier1`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, answers }),
  });
  if (!r.ok) throw new Error(`Tier1 POST failed: ${r.status}`);
  return (await r.json()) as Tier1Memory;
}

export async function updateTier1Memory(
  projectId: number,
  answers: Partial<Tier1Answers>,
): Promise<Tier1Memory> {
  const r = await fetch(`/api/memory/tier1/${projectId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  if (!r.ok) throw new Error(`Tier1 PUT failed: ${r.status}`);
  return (await r.json()) as Tier1Memory;
}

/** Global event: open the Tier 1 intake sheet from anywhere. */
export const TIER1_INTAKE_OPEN_EVENT = "axiom:open-tier1-intake";
export function openTier1IntakeSheet() {
  window.dispatchEvent(new CustomEvent(TIER1_INTAKE_OPEN_EVENT));
}

/** Sessionstorage key so we only auto-prompt once per project per browser session. */
export const tier1AutoPromptKey = (projectId: number) => `atlas-tier1-autoprompted-${projectId}`;
