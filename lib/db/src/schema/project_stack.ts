import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { projectsTable } from "./projects";

export const projectStackTable = pgTable("project_stack", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().unique().references(() => projectsTable.id, { onDelete: "cascade" }),
  frontend: text("frontend"),
  backend: text("backend"),
  database: text("database"),
  hosting: text("hosting"),
  auth: text("auth"),
  integrations: jsonb("integrations").$type<string[]>().default([]),
  repo: text("repo"),
  language: text("language"),
  packageManager: text("package_manager"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ProjectStack = typeof projectStackTable.$inferSelect;
