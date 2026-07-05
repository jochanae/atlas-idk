CREATE TABLE IF NOT EXISTS "nexus_conversations" (
  "conversation_id" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "tier1_buffer" jsonb,
  "tier1_skipped_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nexus_conversations" ADD CONSTRAINT "nexus_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nexus_conversations_user_id_idx" ON "nexus_conversations" USING btree ("user_id");
