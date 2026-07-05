ALTER TABLE "project_tier1_memory"
  ADD COLUMN IF NOT EXISTS "tier1_skipped_at" timestamptz;
--> statement-breakpoint
