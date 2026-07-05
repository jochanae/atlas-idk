import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const capacityPoolsTable = pgTable("capacity_pools", {
  userId: integer("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  tier: text("tier").notNull().default("explorer"),
  monthlyAllotment: integer("monthly_allotment").notNull().default(30),
  dailyAllotment: integer("daily_allotment"),
  usedThisPeriod: integer("used_this_period").notNull().default(0),
  usedToday: integer("used_today").notNull().default(0),
  topupBalance: integer("topup_balance").notNull().default(0),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  dayStart: timestamp("day_start", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCapacityPoolSchema = createInsertSchema(capacityPoolsTable).omit({ updatedAt: true });
export type InsertCapacityPool = z.infer<typeof insertCapacityPoolSchema>;
export type CapacityPool = typeof capacityPoolsTable.$inferSelect;
