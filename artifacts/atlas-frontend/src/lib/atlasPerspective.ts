/**
 * Canonical Workspace / Flow lens identities (Milestone 2.3 Phase A).
 * One vocabulary for Map tabs + live chat. See:
 * docs/audits/milestone-2-3-lens-differentiation-design.md §3.0 / §9
 */

export const ATLAS_PERSPECTIVES = ["designer", "builder", "storyteller"] as const;
export type AtlasPerspective = (typeof ATLAS_PERSPECTIVES)[number];

/** @deprecated Use AtlasPerspective — kept as alias during migration. */
export type WorkspaceLens = AtlasPerspective;

export const PERSPECTIVE_CONTRACT: Record<AtlasPerspective, string> = {
  designer:
    "Optimizes for the user's experience, clarity, usability, and emotional impact.",
  builder:
    "Optimizes for feasibility, implementation, systems, and execution.",
  storyteller:
    "Optimizes for meaning, communication, narrative, motivation, and long-term identity.",
};

export const PERSPECTIVE_QUESTION: Record<AtlasPerspective, string> = {
  designer: "How should this be experienced?",
  builder: "How should this be constructed?",
  storyteller: "What is the meaning, narrative, and human journey?",
};

export const PERSPECTIVE_LABEL: Record<AtlasPerspective, string> = {
  designer: "Designer",
  builder: "Builder",
  storyteller: "Storyteller",
};

/** Sublabel under the picker (Map tabs use the same). */
export const PERSPECTIVE_SUBLABEL: Record<AtlasPerspective, string> = {
  designer: "experience",
  builder: "execution",
  storyteller: "story",
};

const LEGACY_LENS_MAP: Record<string, AtlasPerspective> = {
  flow: "storyteller",
  build: "builder",
  look: "designer",
  designer: "designer",
  builder: "builder",
  storyteller: "storyteller",
  // scenario is a modifier — map leftover storage to storyteller + speculate
  scenario: "storyteller",
};

export function isAtlasPerspective(value: unknown): value is AtlasPerspective {
  return value === "designer" || value === "builder" || value === "storyteller";
}

/**
 * Normalize any stored / wire value to a canonical perspective.
 * Legacy chat modes: flow→storyteller, build→builder, look→designer.
 * Unknown → storyteller (safe default; was "flow").
 */
export function normalizePerspective(raw: unknown): AtlasPerspective {
  if (typeof raw !== "string") return "storyteller";
  const key = raw.trim().toLowerCase();
  return LEGACY_LENS_MAP[key] ?? "storyteller";
}

/** True when stored value was the legacy scenario "lens" (now speculate modifier). */
export function legacyWasScenario(raw: unknown): boolean {
  return typeof raw === "string" && raw.trim().toLowerCase() === "scenario";
}

export function perspectiveStorageKey(projectId: number | string | undefined): string {
  return `atlas-ws-lens-v2-${projectId ?? "none"}`;
}

export function speculateStorageKey(projectId: number | string | undefined): string {
  return `atlas-ws-speculate-v1-${projectId ?? "none"}`;
}

export function readStoredPerspective(projectId: number | string | undefined): {
  perspective: AtlasPerspective;
  speculate: boolean;
} {
  try {
    const raw = localStorage.getItem(perspectiveStorageKey(projectId));
    const speculateStored = localStorage.getItem(speculateStorageKey(projectId));
    const perspective = normalizePerspective(raw);
    const speculate =
      speculateStored === "1" || speculateStored === "true" || legacyWasScenario(raw);
    return { perspective, speculate };
  } catch {
    return { perspective: "storyteller", speculate: false };
  }
}

export function writeStoredPerspective(
  projectId: number | string | undefined,
  perspective: AtlasPerspective,
  speculate: boolean,
): void {
  try {
    localStorage.setItem(perspectiveStorageKey(projectId), perspective);
    localStorage.setItem(speculateStorageKey(projectId), speculate ? "1" : "0");
  } catch { /* quota */ }
}

export const PERSPECTIVE_CHANGE_EVENT = "axiom:perspective-change";

export type PerspectiveChangeDetail = {
  perspective: AtlasPerspective;
  speculate: boolean;
  projectId?: number | string;
};

export function emitPerspectiveChange(detail: PerspectiveChangeDetail): void {
  try {
    window.dispatchEvent(new CustomEvent(PERSPECTIVE_CHANGE_EVENT, { detail }));
  } catch { /* ssr */ }
}
