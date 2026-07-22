import { pgEnum, pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const GENOME_STAGES = ["Think", "Shape", "Decide", "Workspace", "Strategize", "Build", "Operate", "Evolve"] as const;
export type GenomeStage = (typeof GENOME_STAGES)[number];

/** All persisted entry/object types (PG enum `object_type`). */
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

/**
 * Milestone 2.2 first-class knowledge kinds.
 * Secondary types (Goal, Blocker, Audience, Feature, Risk) remain valid
 * but must not silently drift into Decision without explicit promotion.
 */
export const KNOWLEDGE_TYPES = [
  "Idea",
  "Decision",
  "Insight",
  "Question",
  "EngineeringEvent",
] as const;
export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

/** Types that may be explicitly promoted to Decision (K6). */
export const PROMOTABLE_TO_DECISION = [
  "Idea",
  "Insight",
  "Question",
  "Goal",
  "Feature",
  "Risk",
] as const;
export type PromotableToDecision = (typeof PROMOTABLE_TO_DECISION)[number];

export const genomeStagePgEnum = pgEnum("genome_stage", [...GENOME_STAGES]);
export const objectTypePgEnum = pgEnum("object_type", [...OBJECT_TYPES]);

export const projectGenomeTable = pgTable("project_genome", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().unique().references(() => projectsTable.id, { onDelete: "cascade" }),
  purpose: text("purpose"),
  coreEmotion: text("core_emotion"),
  audience: text("audience"),
  identity: text("identity"),
  format: text("format"),
  surfaceStrategy: text("surface_strategy"),
  wedge: text("wedge"),
  differentiator: text("differentiator"),
  stack: text("stack").array().notNull().default([]),
  protectedAreas: text("protected_areas").array().notNull().default([]),
  constraints: text("constraints").array().notNull().default([]),
  openQuestions: text("open_questions").array().notNull().default([]),
  stage: genomeStagePgEnum("stage").notNull().default("Think"),
  confidenceScore: integer("confidence_score").notNull().default(0),
  lastEvolvedAt: timestamp("last_evolved_at", { withTimezone: true }),
  lastExtractedAt: timestamp("last_extracted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProjectGenomeSchema = createInsertSchema(projectGenomeTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProjectGenome = z.infer<typeof insertProjectGenomeSchema>;
export type ProjectGenome = typeof projectGenomeTable.$inferSelect;
