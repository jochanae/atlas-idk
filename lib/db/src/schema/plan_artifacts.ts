import { pgTable, uuid, integer, text, timestamp, jsonb, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { chatMessagesTable } from "./chat_messages";
import { projectsTable } from "./projects";
import { usersTable } from "./users";

export type PlanStep = {
  id: string;
  order: number;
  title: string;
  detail: string;
  layer: string;
  touches: string[];
  depends_on: string[];
  verification: string | null;
  risk: string | null;
};

export type PlanOpenQuestion = {
  id: string;
  text: string;
};

export const planArtifactsTable = pgTable("plan_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: integer("message_id").references(() => chatMessagesTable.id, { onDelete: "set null" }),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  version: integer("version").notNull().default(1),
  parentId: uuid("parent_id").references((): AnyPgColumn => planArtifactsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  intent: text("intent").notNull(),
  steps: jsonb("steps").$type<PlanStep[]>().notNull().default([]),
  openQuestions: jsonb("open_questions").$type<PlanOpenQuestion[] | null>(),
  estimatedEffort: text("estimated_effort").notNull(),
  status: text("status").notNull().default("proposed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  committedAt: timestamp("committed_at", { withTimezone: true }),
});

export const insertPlanArtifactSchema = createInsertSchema(planArtifactsTable).omit({ id: true, createdAt: true });
export type InsertPlanArtifact = z.infer<typeof insertPlanArtifactSchema>;
export type PlanArtifact = typeof planArtifactsTable.$inferSelect;
