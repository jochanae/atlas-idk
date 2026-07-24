/**
 * Shared Parking Lot helpers — payload shape, product categories, promote destinations.
 * Keep CaptureBar, ParkSheet, and /parking page aligned with docs/PARKING_LOT_CONTRACT.md
 */

export const PARK_CATEGORIES = [
  "idea",
  "decision",
  "clarification",
  "risk",
  "research",
  "later",
  "build",
] as const;

export type ParkCategory = (typeof PARK_CATEGORIES)[number];

/** Capture intents shown on Park destination (Dump belongs on Forge Intake only). */
export const PARK_CAPTURE_INTENTS = [
  { id: "idea" as const, label: "Idea", hint: "loose thought" },
  { id: "decision" as const, label: "Decision", hint: "choice deferred" },
  { id: "build" as const, label: "Build", hint: "make it real" },
  { id: "later" as const, label: "Later", hint: "worth another conversation" },
];

export type ParkCaptureIntent = (typeof PARK_CAPTURE_INTENTS)[number]["id"];

/** Forge / Intake may still use Dump for raw brain. */
export const FORGE_CAPTURE_INTENTS = [
  { id: "idea" as const, label: "Idea", hint: "loose thought" },
  { id: "decision" as const, label: "Decision", hint: "commit this" },
  { id: "build" as const, label: "Build", hint: "make it real" },
  { id: "dump" as const, label: "Dump", hint: "raw brain" },
];

export type ForgeCaptureIntent = (typeof FORGE_CAPTURE_INTENTS)[number]["id"];

export type CaptureIntent = ParkCaptureIntent | ForgeCaptureIntent;

/** Promote graduation destinations — ask "Promote to what?" */
export const PROMOTE_DESTINATIONS = [
  { label: "Decision", value: "Decision" },
  { label: "Goal", value: "Goal" },
  { label: "Build", value: "Feature" },
  { label: "Risk", value: "Risk" },
  { label: "Question", value: "Question" },
] as const;

export type PromoteDestination = (typeof PROMOTE_DESTINATIONS)[number]["value"];

/** Filter chips on the Parking Lot page. */
export const PARK_FILTER_CHIPS: Array<{ id: ParkCategory | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "idea", label: "Idea" },
  { id: "decision", label: "Decision" },
  { id: "clarification", label: "Clarification" },
  { id: "risk", label: "Risk" },
  { id: "research", label: "Research" },
  { id: "build", label: "Build" },
  { id: "later", label: "Later" },
];

const INTENT_TO_TYPE: Record<string, string> = {
  idea: "Idea",
  decision: "Decision",
  build: "Feature",
  later: "Idea",
  clarification: "Question",
  risk: "Risk",
  research: "Question",
  dump: "Idea", // should not park; fallback if mis-routed
};

export function parkCategoryFromIntent(intent?: string | null): ParkCategory {
  const raw = (intent ?? "idea").toLowerCase();
  if (raw === "dump") return "later";
  if ((PARK_CATEGORIES as readonly string[]).includes(raw)) return raw as ParkCategory;
  return "idea";
}

export function entryTypeForParkCategory(category: ParkCategory): string {
  return INTENT_TO_TYPE[category] ?? "Idea";
}

/** Resolve display/filter category from a stored entry. */
export function resolveParkCategory(entry: {
  verb?: string | null;
  type?: string | null;
  mode?: string | null;
}): ParkCategory {
  const verb = (entry.verb ?? "").toLowerCase();
  if ((PARK_CATEGORIES as readonly string[]).includes(verb)) return verb as ParkCategory;
  const type = (entry.type ?? "").toLowerCase();
  if (type === "decision") return "decision";
  if (type === "risk") return "risk";
  if (type === "feature") return "build";
  if (type === "question") return "clarification";
  if (type === "idea") return "idea";
  if (type === "goal") return "idea";
  return "later";
}

/**
 * Shared shape for creating a parked Entry.
 */
export function buildParkedEntryPayload(
  content: string,
  sessionId?: number | string | null,
  sourceMessageId?: number | null,
  contextWhat?: string | null,
  details?: string | null,
  intent?: string | null,
) {
  const trimmed = content.trim();
  const title = trimmed.replace(/\n/g, " ").slice(0, 80).trim();
  const category = parkCategoryFromIntent(intent);
  return {
    title,
    summary: trimmed.slice(0, 500),
    status: "parked" as const,
    severity: "parked" as const,
    mode: "think" as const,
    type: entryTypeForParkCategory(category),
    verb: category,
    ...(sessionId != null ? { sessionId: sessionId as number } : {}),
    ...(sourceMessageId != null ? { sourceMessageId } : {}),
    ...(contextWhat != null ? { contextWhat: contextWhat.slice(0, 120) } : {}),
    ...(details != null && details.trim() ? { details: details.trim().slice(0, 2000) } : {}),
  };
}

/** Clarify prefill — distinct from Resume. */
export function buildClarifyPrefill(title: string, contextWhat?: string | null): string {
  const subject = contextWhat ? `${title} (${contextWhat})` : title;
  return `Help me clarify until this is actionable: ${subject}\n\nWhat still needs to be answered before we can decide, build, or drop this?`;
}

export function buildResumePrefill(title: string, contextWhat?: string | null): string {
  return contextWhat ? `${title} (${contextWhat})` : title;
}
