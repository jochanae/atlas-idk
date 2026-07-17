-- Attachment lifecycle — persistent chat attachments
CREATE TABLE IF NOT EXISTS message_attachments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id              integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id           integer REFERENCES projects(id) ON DELETE SET NULL,
  conversation_id      text,
  surface              text,
  chat_message_id      integer,
  nexus_message_id     integer,
  filename             text NOT NULL,
  mime_type            text NOT NULL,
  size_bytes           bigint NOT NULL,
  kind                 text NOT NULL DEFAULT 'other',
  storage_bucket       text NOT NULL,
  storage_path         text NOT NULL,
  upload_status        text NOT NULL DEFAULT 'pending_upload',
  availability_status  text NOT NULL DEFAULT 'active',
  processing_status    text NOT NULL DEFAULT 'pending',
  library_item_id      uuid REFERENCES library_items(id) ON DELETE SET NULL,
  expires_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_attachments_user_id_idx
  ON message_attachments (user_id);
CREATE INDEX IF NOT EXISTS message_attachments_conversation_id_idx
  ON message_attachments (conversation_id);
CREATE INDEX IF NOT EXISTS message_attachments_chat_message_id_idx
  ON message_attachments (chat_message_id);
CREATE INDEX IF NOT EXISTS message_attachments_nexus_message_id_idx
  ON message_attachments (nexus_message_id);
CREATE INDEX IF NOT EXISTS message_attachments_expires_at_idx
  ON message_attachments (expires_at)
  WHERE availability_status <> 'library';
