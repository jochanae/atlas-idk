import {
  pgTable,
  uuid,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  bigint,
  uniqueIndex,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

/** Transport kinds for a project source. Phase 1: zip | generated | pasted. */
export const PROJECT_SOURCE_TYPES = ["zip", "github", "replit", "generated", "pasted"] as const;
export type ProjectSourceType = (typeof PROJECT_SOURCE_TYPES)[number];

export const PROJECT_SOURCE_INGEST_STATUSES = ["pending", "indexing", "ready", "failed"] as const;
export type ProjectSourceIngestStatus = (typeof PROJECT_SOURCE_INGEST_STATUSES)[number];

export type ProjectSourceExport = {
  name: string;
  kind: string;
  line: number;
};

export type ProjectSourceImport = {
  specifier: string;
  resolvedPath: string | null;
  line: number;
};

const vector1536 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value.slice(1, -1).split(",").map(Number);
  },
});

/**
 * Canonical row per (project, source). One project may have multiple sources;
 * exactly one may be primary (enforced by partial unique index).
 *
 * Note: handoff docs mention uuid project_id; this schema uses integer to match
 * the existing `projects.id` serial PK in atlas-idk.
 */
export const projectSourcesTable = pgTable(
  "project_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceRef: jsonb("source_ref").$type<Record<string, unknown>>().notNull().default({}),
    isPrimary: boolean("is_primary").notNull().default(false),
    lastIngestedAt: timestamp("last_ingested_at", { withTimezone: true }),
    lastIngestStatus: text("last_ingest_status").notNull().default("pending"),
    lastIngestError: text("last_ingest_error"),
    fileCount: integer("file_count").notNull().default(0),
    totalBytes: bigint("total_bytes", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("one_primary_per_project")
      .on(t.projectId)
      .where(sql`${t.isPrimary} = true`),
    index("project_sources_project_id_idx").on(t.projectId),
    index("project_sources_status_idx").on(t.lastIngestStatus),
  ],
);

export const projectSourceFilesTable = pgTable(
  "project_source_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => projectSourcesTable.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    sha256: text("sha256").notNull(),
    language: text("language"),
    content: text("content"),
    storageKey: text("storage_key"),
    exports: jsonb("exports").$type<ProjectSourceExport[]>().notNull().default([]),
    imports: jsonb("imports").$type<ProjectSourceImport[]>().notNull().default([]),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("project_source_files_source_path_uq").on(t.sourceId, t.path),
    index("project_source_files_source_language_idx").on(t.sourceId, t.language),
  ],
);

export const projectSourceEmbeddingsTable = pgTable(
  "project_source_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => projectSourceFilesTable.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    lineStart: integer("line_start").notNull(),
    lineEnd: integer("line_end").notNull(),
    content: text("content").notNull(),
    embedding: vector1536("embedding"),
  },
  (t) => [
    uniqueIndex("project_source_embeddings_file_chunk_uq").on(t.fileId, t.chunkIndex),
    index("project_source_embeddings_file_id_idx").on(t.fileId),
  ],
);

export const projectSourceSnapshotsTable = pgTable(
  "project_source_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => projectSourcesTable.id, { onDelete: "cascade" }),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
    fileManifest: jsonb("file_manifest").$type<Record<string, string>>().notNull().default({}),
  },
  (t) => [index("project_source_snapshots_source_id_idx").on(t.sourceId)],
);

export const insertProjectSourceSchema = createInsertSchema(projectSourcesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProjectSource = z.infer<typeof insertProjectSourceSchema>;
export type ProjectSource = typeof projectSourcesTable.$inferSelect;
export type ProjectSourceFile = typeof projectSourceFilesTable.$inferSelect;
export type ProjectSourceEmbedding = typeof projectSourceEmbeddingsTable.$inferSelect;
export type ProjectSourceSnapshot = typeof projectSourceSnapshotsTable.$inferSelect;
