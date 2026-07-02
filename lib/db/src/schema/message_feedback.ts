import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { nexusMessagesTable } from "./nexus_messages";
import { usersTable } from "./users";

export const messageFeedbackTable = pgTable("message_feedback", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => nexusMessagesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  rating: text("rating").notNull(),
  reason: text("reason"),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMessageFeedbackSchema = createInsertSchema(messageFeedbackTable).omit({ id: true, createdAt: true });
export type InsertMessageFeedback = z.infer<typeof insertMessageFeedbackSchema>;
export type MessageFeedback = typeof messageFeedbackTable.$inferSelect;
