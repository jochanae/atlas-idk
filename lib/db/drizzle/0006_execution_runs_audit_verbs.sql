-- Audit-surface verb coverage: run.intent / run.prompt + step.artifact_url
ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS intent text;
--> statement-breakpoint
ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS prompt text;
--> statement-breakpoint
ALTER TABLE execution_run_steps ADD COLUMN IF NOT EXISTS artifact_url text;
