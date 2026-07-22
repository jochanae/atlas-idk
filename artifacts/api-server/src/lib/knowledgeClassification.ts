/**
 * Milestone 2.2 — Knowledge Classification helpers.
 *
 * First-class kinds: Idea | Decision | Insight | Question | EngineeringEvent
 * Promotion must be explicit (no silent category drift).
 */

import {
  OBJECT_TYPES,
  PROMOTABLE_TO_DECISION,
  type ObjectType,
  type PromotableToDecision,
} from "@workspace/db";

export {
  KNOWLEDGE_TYPES,
  OBJECT_TYPES,
  PROMOTABLE_TO_DECISION,
  type KnowledgeType,
  type ObjectType,
  type PromotableToDecision,
} from "@workspace/db";

export function isObjectType(value: unknown): value is ObjectType {
  return typeof value === "string" && (OBJECT_TYPES as readonly string[]).includes(value);
}

export function isPromotableToDecision(value: unknown): value is PromotableToDecision {
  return typeof value === "string" && (PROMOTABLE_TO_DECISION as readonly string[]).includes(value);
}

/** Genome auto-extract: Decisions stay parked until an explicit commit/promote. */
export function genomeInsertStatus(type: ObjectType): "committed" | "parked" {
  if (type === "Decision") return "parked";
  if (type === "Question") return "parked";
  if (type === "EngineeringEvent") return "committed";
  return "committed";
}

/** Activity feed label for an entry type (Surface Integrity S2/S5). */
export function activityFeedTypeForEntry(type: ObjectType | string): "decision" | "engineering_event" | "knowledge" {
  if (type === "Decision") return "decision";
  if (type === "EngineeringEvent") return "engineering_event";
  return "knowledge";
}
