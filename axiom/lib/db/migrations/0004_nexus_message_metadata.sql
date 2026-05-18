-- Add missing metadata columns to nexus_messages.
-- The backend query in /api/nexus/thread selects project_id, session_id,
-- and message_type, which were never added by a prior migration. Without
-- these columns every thread load returns 500 and the chat UI is dead.
--> statement-breakpoint
ALTER TABLE "nexus_messages" ADD COLUMN IF NOT EXISTS "project_id" integer;
--> statement-breakpoint
ALTER TABLE "nexus_messages" ADD COLUMN IF NOT EXISTS "session_id" integer;
--> statement-breakpoint
ALTER TABLE "nexus_messages" ADD COLUMN IF NOT EXISTS "message_type" text;
