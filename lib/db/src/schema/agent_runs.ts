import { pgTable, uuid, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { chatMessagesTable } from "./chat_messages";
import { projectsTable } from "./projects";
import { usersTable } from "./users";

export const agentRunsTable = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: integer("message_id").references(() => chatMessagesTable.id, { onDelete: "set null" }),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  stepCount: integer("step_count").notNull().default(0),
  stopReason: text("stop_reason").notNull(),
  toolsCalled: jsonb("tools_called").$type<Array<{ name: string; ok: boolean; ms: number }>>().notNull().default([]),
  totalTokensIn: integer("total_tokens_in").notNull().default(0),
  totalTokensOut: integer("total_tokens_out").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const insertAgentRunSchema = createInsertSchema(agentRunsTable).omit({ id: true, startedAt: true });
export type InsertAgentRun = z.infer<typeof insertAgentRunSchema>;
export type AgentRun = typeof agentRunsTable.$inferSelect;
