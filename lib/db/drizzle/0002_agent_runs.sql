CREATE TABLE IF NOT EXISTS "agent_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" integer REFERENCES "chat_messages"("id") ON DELETE SET NULL,
  "project_id" integer REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "step_count" integer DEFAULT 0 NOT NULL,
  "stop_reason" text NOT NULL,
  "tools_called" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "total_tokens_in" integer DEFAULT 0 NOT NULL,
  "total_tokens_out" integer DEFAULT 0 NOT NULL,
  "started_at" timestamptz DEFAULT now() NOT NULL,
  "ended_at" timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_runs_message_id" ON "agent_runs" ("message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_runs_project_user" ON "agent_runs" ("project_id", "user_id");
--> statement-breakpoint
GRANT SELECT ON public.agent_runs TO authenticated;
--> statement-breakpoint
GRANT ALL ON public.agent_runs TO service_role;
