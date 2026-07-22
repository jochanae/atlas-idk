export const OBJECT_TYPES = [
  "Idea",
  "Goal",
  "Blocker",
  "Decision",
  "Audience",
  "Feature",
  "Risk",
  "Insight",
  "Question",
  "EngineeringEvent",
] as const;

export type ObjectType = (typeof OBJECT_TYPES)[number];

/** Types shown in ObjectBoard create UI (engineering events are Activity-only). */
export const CREATABLE_OBJECT_TYPES = OBJECT_TYPES.filter(
  (t) => t !== "EngineeringEvent",
) as ObjectType[];
