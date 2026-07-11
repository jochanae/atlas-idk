import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Durable run ledger for the workspace audit surface (Timeline / Changes).
 * Managed primarily via raw SQL in api-server ensureColumns + route writers;
 * this schema documents the columns for typecheck and future drizzle use.
 */
export const executionRunsTable = pgTable("execution_runs", {
  id: text("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  threadId: integer("thread_id"),
  messageId: integer("message_id"),
  mode: text("mode").notNull().default("conversation"),
  status: text("status").notNull().default("running"),
  summary: text("summary"),
  /** WhisperGate classification for this turn: "CHAT" | "DECIDE" | "BUILD" */
  intent: text("intent"),
  /** Nexus conversation UUID — scopes Timeline/Changes to the active thread. */
  conversationId: text("conversation_id"),
  /** User prompt that kicked off the run (mirrors PROMPT step content). */
  prompt: text("prompt"),
  receipts: jsonb("receipts"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  elapsedMs: integer("elapsed_ms"),
  /**
   * DB-assigned monotonic insertion order. Reads must tie-break on this
   * (not just started_at) because a milestone run and its turn's
   * code-execution run are deliberately stamped with the same turn
   * startedAt for correct cross-turn ordering — started_at alone can't
   * order runs written within the same turn.
   */
  seq: serial("seq"),
});

export const executionRunStepsTable = pgTable("execution_run_steps", {
  id: serial("id").primaryKey(),
  runId: text("run_id").notNull(),
  verb: text("verb").notNull(),
  target: text("target"),
  status: text("status").default("ok"),
  detail: text("detail"),
  content: text("content"),
  beforeContent: text("before_content"),
  /** Openable URL for ARTIFACT_CREATED steps (e.g. /api/artifacts/:id). */
  artifactUrl: text("artifact_url"),
  orderIndex: integer("order_index").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ExecutionRun = typeof executionRunsTable.$inferSelect;
export type ExecutionRunStep = typeof executionRunStepsTable.$inferSelect;
