/**
 * Canonical Workspace / Flow lens identities (Milestone 2.3 Phase A).
 * Mirrors artifacts/atlas-frontend/src/lib/atlasPerspective.ts — keep in sync.
 * docs/audits/milestone-2-3-lens-differentiation-design.md §3.0 / §9
 */

export const ATLAS_PERSPECTIVES = ["designer", "builder", "storyteller"] as const;
export type AtlasPerspective = (typeof ATLAS_PERSPECTIVES)[number];

const LEGACY_LENS_MAP: Record<string, AtlasPerspective> = {
  flow: "storyteller",
  build: "builder",
  look: "designer",
  designer: "designer",
  builder: "builder",
  storyteller: "storyteller",
  scenario: "storyteller",
};

export function isAtlasPerspective(value: unknown): value is AtlasPerspective {
  return value === "designer" || value === "builder" || value === "storyteller";
}

export function normalizePerspective(raw: unknown): AtlasPerspective {
  if (typeof raw !== "string") return "storyteller";
  const key = raw.trim().toLowerCase();
  return LEGACY_LENS_MAP[key] ?? "storyteller";
}

/** Phase A stub — acknowledge lens in prompt assembly later (Phase C). */
export function perspectiveMetaLine(perspective: AtlasPerspective, speculate: boolean): string {
  return `[Active perspective: ${perspective}${speculate ? " · speculate" : ""}]`;
}
