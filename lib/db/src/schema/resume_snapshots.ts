import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";

export const userResumeSnapshotsTable = pgTable("user_resume_snapshots", {
  userId: integer("user_id").primaryKey(),
  dataJson: text("data_json").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});
