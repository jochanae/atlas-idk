import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import type { Tier1FieldKey } from "./project_tier1_memory";

/** Nullable per-field values buffered before a project is selected. */
export type NexusTier1Buffer = Partial<Record<Tier1FieldKey, string | null>>;

export const nexusConversationsTable = pgTable("nexus_conversations", {
  conversationId: text("conversation_id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  tier1Buffer: jsonb("tier1_buffer").$type<NexusTier1Buffer | null>(),
  tier1SkippedAt: timestamp("tier1_skipped_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type NexusConversation = typeof nexusConversationsTable.$inferSelect;
