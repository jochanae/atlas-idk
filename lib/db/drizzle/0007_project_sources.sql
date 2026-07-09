CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "source_type" text NOT NULL,
  "source_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "last_ingested_at" timestamptz,
  "last_ingest_status" text DEFAULT 'pending' NOT NULL,
  "last_ingest_error" text,
  "file_count" integer DEFAULT 0 NOT NULL,
  "total_bytes" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "one_primary_per_project" ON "project_sources" ("project_id") WHERE "is_primary" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_sources_project_id_idx" ON "project_sources" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_sources_status_idx" ON "project_sources" ("last_ingest_status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_source_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_id" uuid NOT NULL REFERENCES "project_sources"("id") ON DELETE CASCADE,
  "path" text NOT NULL,
  "size_bytes" integer DEFAULT 0 NOT NULL,
  "sha256" text NOT NULL,
  "language" text,
  "content" text,
  "storage_key" text,
  "exports" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "imports" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "indexed_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_source_files_source_path_uq" ON "project_source_files" ("source_id", "path");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_source_files_source_language_idx" ON "project_source_files" ("source_id", "language");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_source_files_exports_gin" ON "project_source_files" USING gin ("exports");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_source_files_imports_gin" ON "project_source_files" USING gin ("imports");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_source_embeddings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "file_id" uuid NOT NULL REFERENCES "project_source_files"("id") ON DELETE CASCADE,
  "chunk_index" integer NOT NULL,
  "line_start" integer NOT NULL,
  "line_end" integer NOT NULL,
  "content" text NOT NULL,
  "embedding" vector(1536)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_source_embeddings_file_chunk_uq" ON "project_source_embeddings" ("file_id", "chunk_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_source_embeddings_file_id_idx" ON "project_source_embeddings" ("file_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_source_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_id" uuid NOT NULL REFERENCES "project_sources"("id") ON DELETE CASCADE,
  "taken_at" timestamptz DEFAULT now() NOT NULL,
  "file_manifest" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_source_snapshots_source_id_idx" ON "project_source_snapshots" ("source_id");
