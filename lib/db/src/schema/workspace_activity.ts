import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { projectsTable } from "./projects";

/**
 * Emitted workspace timeline verbs (attachment + turn lifecycle).
 * Merged into GET /api/nexus/activity alongside commits/decisions/sessions.
 *
 * Idempotency: `idempotencyKey` is unique so retries / double-sends do not
 * duplicate events. Stable numeric `id` is returned for frontend poll dedupe.
 */

export const WORKSPACE_ACTIVITY_TYPES = [
  "attachment_received",
  "image_analyzed",
  "document_analyzed",
  "attachment_unsupported",
  "atlas_thinking",
  "response_generated",
] as const;
export type WorkspaceActivityType = (typeof WORKSPACE_ACTIVITY_TYPES)[number];

export const workspaceActivityTable = pgTable(
  "workspace_activity",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    type: text("type").$type<WorkspaceActivityType>().notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    attachmentName: text("attachment_name"),
    reason: text("reason"),
    /** Unique key for insert-time idempotency (one event per attachment/turn). */
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("workspace_activity_idempotency_uq").on(t.idempotencyKey),
    index("workspace_activity_project_created_idx").on(t.projectId, t.createdAt),
    index("workspace_activity_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const insertWorkspaceActivitySchema = createInsertSchema(
  workspaceActivityTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertWorkspaceActivity = z.infer<
  typeof insertWorkspaceActivitySchema
>;
export type WorkspaceActivity = typeof workspaceActivityTable.$inferSelect;
