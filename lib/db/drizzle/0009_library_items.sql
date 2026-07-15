-- Library Foundation (drizzle mirror of supabase/migrations/20260715120000_library_items.sql)
CREATE TABLE IF NOT EXISTS "library_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" integer REFERENCES "projects"("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'document' NOT NULL,
  "title" text NOT NULL,
  "content" text,
  "preview" text DEFAULT '' NOT NULL,
  "origin_source" text DEFAULT 'unknown' NOT NULL,
  "origin_conversation_id" text,
  "origin_message_id" text,
  "legacy_source" text,
  "legacy_id" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_items_user_created_idx" ON "library_items" ("user_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_items_user_project_idx" ON "library_items" ("user_id", "project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_items_user_kind_idx" ON "library_items" ("user_id", "kind");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_items_legacy_uq" ON "library_items" ("legacy_source", "legacy_id") WHERE "legacy_source" IS NOT NULL AND "legacy_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_context_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" text NOT NULL,
  "library_item_id" uuid NOT NULL REFERENCES "library_items"("id") ON DELETE CASCADE,
  "attached_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "attached_at" timestamptz DEFAULT now() NOT NULL,
  "detached_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_context_items_active_uq" ON "conversation_context_items" ("conversation_id", "library_item_id") WHERE "detached_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_context_items_conversation_idx" ON "conversation_context_items" ("conversation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_context_items_library_item_idx" ON "conversation_context_items" ("library_item_id");
