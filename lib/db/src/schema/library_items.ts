import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { usersTable } from "./users";

/** Canonical library kinds — mirrors frontend LibraryItemKind. */
export const LIBRARY_ITEM_KINDS = [
  "document",
  "prd",
  "plan",
  "strategy",
  "spec",
  "outline",
  "brief",
  "bookmark",
  "sketch",
  "other",
] as const;
export type LibraryItemKind = (typeof LIBRARY_ITEM_KINDS)[number];

export const LIBRARY_ORIGIN_SOURCES = [
  "ask-atlas",
  "workspace",
  "upload",
  "unknown",
] as const;
export type LibraryOriginSource = (typeof LIBRARY_ORIGIN_SOURCES)[number];

export const LIBRARY_LEGACY_SOURCES = [
  "home_artifacts",
  "project_bookmarks",
] as const;
export type LibraryLegacySource = (typeof LIBRARY_LEGACY_SOURCES)[number];

/**
 * Canonical saved-item store for Ask Atlas artifacts, workspace outputs,
 * bookmarks, and future sketches. Supersedes home_artifacts / project_bookmarks
 * as the read path; legacy tables stay dual-writable until frontend cutover.
 */
export const libraryItemsTable = pgTable(
  "library_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id").references(() => projectsTable.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull().default("document"),
    title: text("title").notNull(),
    content: text("content"),
    preview: text("preview").notNull().default(""),
    originSource: text("origin_source").notNull().default("unknown"),
    /** Nexus conversation ids are TEXT UUIDs — keep as text, not uuid column. */
    originConversationId: text("origin_conversation_id"),
    originMessageId: text("origin_message_id"),
    legacySource: text("legacy_source"),
    legacyId: text("legacy_id"),
    /** Raw deliverable type from project_artifacts (e.g. "html-app", "pptx", "docx"). Null for non-artifact items. */
    artifactType: text("artifact_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("library_items_user_created_idx").on(t.userId, t.createdAt),
    index("library_items_user_project_idx").on(t.userId, t.projectId),
    index("library_items_user_kind_idx").on(t.userId, t.kind),
    uniqueIndex("library_items_legacy_uq")
      .on(t.legacySource, t.legacyId)
      .where(sql`${t.legacySource} IS NOT NULL AND ${t.legacyId} IS NOT NULL`),
  ],
);

/**
 * Attaches a library item to a conversation without duplicating the item.
 * Soft-detach via detached_at keeps history auditable.
 * conversation_id is TEXT to match nexus_conversations.conversation_id.
 */
export const conversationContextItemsTable = pgTable(
  "conversation_context_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: text("conversation_id").notNull(),
    libraryItemId: uuid("library_item_id")
      .notNull()
      .references(() => libraryItemsTable.id, { onDelete: "cascade" }),
    attachedByUserId: integer("attached_by_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    attachedAt: timestamp("attached_at", { withTimezone: true }).notNull().defaultNow(),
    detachedAt: timestamp("detached_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("conversation_context_items_active_uq")
      .on(t.conversationId, t.libraryItemId)
      .where(sql`${t.detachedAt} IS NULL`),
    index("conversation_context_items_conversation_idx").on(t.conversationId),
    index("conversation_context_items_library_item_idx").on(t.libraryItemId),
  ],
);

export const insertLibraryItemSchema = createInsertSchema(libraryItemsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLibraryItem = z.infer<typeof insertLibraryItemSchema>;
export type LibraryItemRow = typeof libraryItemsTable.$inferSelect;

export const insertConversationContextItemSchema = createInsertSchema(
  conversationContextItemsTable,
).omit({ id: true, attachedAt: true });
export type InsertConversationContextItem = z.infer<
  typeof insertConversationContextItemSchema
>;
export type ConversationContextItemRow =
  typeof conversationContextItemsTable.$inferSelect;
