import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { projectArtifactsTable } from "./application_model";

/** Delivery providers pluggable behind the generic Delivery Service interface. */
export const DELIVERY_PROVIDERS = ["email", "slack", "github_pr"] as const;
export type DeliveryProvider = (typeof DELIVERY_PROVIDERS)[number];

export const DELIVERY_STATUSES = ["pending", "sent", "failed"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const deliveriesTable = pgTable("deliveries", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  artifactId: integer("artifact_id").notNull().references(() => projectArtifactsTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  target: jsonb("target").notNull().default({}),
  status: text("status").notNull().default("pending"),
  externalRef: jsonb("external_ref"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export const insertDeliverySchema = createInsertSchema(deliveriesTable).omit({ id: true, createdAt: true });
export type InsertDelivery = z.infer<typeof insertDeliverySchema>;
export type Delivery = typeof deliveriesTable.$inferSelect;
