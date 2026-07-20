-- Workspace timeline verbs (attachment + turn lifecycle)
CREATE TABLE IF NOT EXISTS "workspace_activity" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "subtitle" text,
  "attachment_name" text,
  "reason" text,
  "idempotency_key" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_activity_idempotency_uq"
  ON "workspace_activity" ("idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_activity_project_created_idx"
  ON "workspace_activity" ("project_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_activity_user_created_idx"
  ON "workspace_activity" ("user_id", "created_at");
