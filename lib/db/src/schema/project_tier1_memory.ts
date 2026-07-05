import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const Tier1AnswersSchema = z.object({
  building: z.string(),
  audience: z.string(),
  problem: z.string(),
  outOfScope: z.string(),
  successSignal: z.string(),
  constraints: z.string(),
});

export const Tier1AnswersPartialSchema = Tier1AnswersSchema.partial();

export const PostTier1MemoryBodySchema = z.object({
  projectId: z.coerce.number().int().positive(),
  answers: Tier1AnswersSchema,
});

export const PutTier1MemoryBodySchema = z.object({
  answers: Tier1AnswersPartialSchema,
});

export type Tier1Answers = z.infer<typeof Tier1AnswersSchema>;

export const TIER1_FIELD_KEYS = [
  "building",
  "audience",
  "problem",
  "outOfScope",
  "successSignal",
  "constraints",
] as const;

export type Tier1FieldKey = (typeof TIER1_FIELD_KEYS)[number];

export const projectTier1MemoryTable = pgTable("project_tier1_memory", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }).unique(),
  building: text("building").notNull().default(""),
  audience: text("audience").notNull().default(""),
  problem: text("problem").notNull().default(""),
  outOfScope: text("out_of_scope").notNull().default(""),
  successSignal: text("success_signal").notNull().default(""),
  constraints: text("constraints").notNull().default(""),
  tier1SkippedAt: timestamp("tier1_skipped_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ProjectTier1Memory = typeof projectTier1MemoryTable.$inferSelect;

export function getTier1MissingFields(
  row: Pick<ProjectTier1Memory, Tier1FieldKey> | null | undefined,
): Tier1FieldKey[] {
  return TIER1_FIELD_KEYS.filter((key) => !row?.[key]?.trim());
}

export function serializeTier1Memory(row: ProjectTier1Memory) {
  return {
    answers: {
      building: row.building,
      audience: row.audience,
      problem: row.problem,
      outOfScope: row.outOfScope,
      successSignal: row.successSignal,
      constraints: row.constraints,
    },
    updatedAt: row.updatedAt.toISOString(),
    skippedAt: row.tier1SkippedAt?.toISOString() ?? null,
    missing: getTier1MissingFields(row),
  };
}
