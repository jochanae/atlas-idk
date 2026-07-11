-- Add conversation_id to execution_runs so Timeline/Changes can scope to the
-- active thread instead of leaking across every conversation in the project.
ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS conversation_id text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS execution_runs_project_conversation_idx
  ON execution_runs (project_id, conversation_id);
