CREATE TABLE IF NOT EXISTS nexus_conversations (
  conversation_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier1_buffer JSONB NULL,
  tier1_skipped_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nexus_conversations_user_id_idx ON nexus_conversations(user_id);
