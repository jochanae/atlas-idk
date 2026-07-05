import crypto from "node:crypto";
import { z } from "zod";
import type { PlanOpenQuestion, PlanStep } from "@workspace/db";

export const PlanStepSchema = z.object({
  id: z.string(),
  order: z.number(),
  title: z.string(),
  detail: z.string(),
  layer: z.string(),
  touches: z.array(z.string()).optional().default([]),
  depends_on: z.array(z.string()).optional().default([]),
  verification: z.string().nullable().optional(),
  risk: z.string().nullable().optional(),
});

export const ProposePlanInput = z.object({
  title: z.string(),
  intent: z.string(),
  steps: z.array(PlanStepSchema),
  open_questions: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  estimated_effort: z.string(),
});

export const RevisePlanInput = z.object({
  planId: z.string(),
  steps: z.array(PlanStepSchema),
  open_questions: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  note: z.string().optional(),
});

export const CommitPlanInput = z.object({
  planId: z.string(),
});

const KNOWN_LAYERS = new Set(["frontend", "backend", "db", "infra", "docs"]);
const KNOWN_EFFORT = new Set(["small", "medium", "large"]);
const MAX_STEPS = 12;
const MAX_TITLE_LEN = 80;
const MAX_DETAIL_LEN = 400;

export function clampEstimatedEffort(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  return KNOWN_EFFORT.has(normalized) ? normalized : "other";
}

export function clampLayer(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  return KNOWN_LAYERS.has(normalized) ? normalized : "other";
}

export function normalizePlanSteps(steps: z.infer<typeof PlanStepSchema>[]): PlanStep[] {
  const limited = steps.slice(0, MAX_STEPS);
  return limited.map((step, index) => ({
    id: step.id?.trim() ? step.id : crypto.randomUUID(),
    order: step.order > 0 ? step.order : index + 1,
    title: step.title.slice(0, MAX_TITLE_LEN),
    detail: step.detail.slice(0, MAX_DETAIL_LEN),
    layer: clampLayer(step.layer),
    touches: step.touches ?? [],
    depends_on: step.depends_on ?? [],
    verification: step.verification ?? null,
    risk: step.risk ?? null,
  }));
}

export function normalizeOpenQuestions(
  questions: PlanOpenQuestion[] | undefined,
): PlanOpenQuestion[] {
  if (!questions?.length) return [];
  return questions.map((q) => ({
    id: q.id?.trim() ? q.id : crypto.randomUUID(),
    text: q.text,
  }));
}

/** Attempt to recover plan input from malformed model output text. */
export function parsePlanInputFallback(text: string): z.infer<typeof ProposePlanInput> | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const result = ProposePlanInput.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export type ProposePlanPayload = {
  planId: string;
  version: number;
  title: string;
  intent: string;
  steps: PlanStep[];
  open_questions: PlanOpenQuestion[];
  estimated_effort: string;
};

export function toLegacyPlanArtifact(payload: ProposePlanPayload) {
  const layerToStepType: Record<string, string> = {
    frontend: "edit",
    backend: "edit",
    db: "edit",
    infra: "push",
    docs: "edit",
  };
  return {
    type: "plan" as const,
    title: payload.title,
    confidence: "medium" as const,
    steps: payload.steps.map((s) => ({
      label: s.title,
      stepType: layerToStepType[s.layer] ?? "other",
      moscow: "must",
      ...(s.touches[0] ? { file: s.touches[0] } : {}),
    })),
    estimatedChanges: payload.steps.length,
    reversible: true,
  };
}
