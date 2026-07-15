-- Library Foundation — canonical saved-item store + conversation attachments
-- Tables: library_items, conversation_context_items
-- Backfill: home_artifacts + project_bookmarks → library_items
--
-- Non-goal: do NOT drop legacy tables. Dual-write until frontend cutover.
-- Note: origin_conversation_id / conversation_id are TEXT (nexus conversation ids),
-- not uuid columns — matches nexus_conversations.conversation_id.

-- ── library_items ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.library_items (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id                 integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id              integer REFERENCES public.projects(id) ON DELETE CASCADE,
  kind                    text NOT NULL DEFAULT 'document',
  title                   text NOT NULL,
  content                 text,
  preview                 text NOT NULL DEFAULT '',
  origin_source           text NOT NULL DEFAULT 'unknown',
  origin_conversation_id  text,
  origin_message_id       text,
  legacy_source           text,
  legacy_id               text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT library_items_kind_check
    CHECK (kind IN (
      'document', 'prd', 'plan', 'strategy', 'spec',
      'outline', 'brief', 'bookmark', 'sketch', 'other'
    )),
  CONSTRAINT library_items_origin_source_check
    CHECK (origin_source IN ('ask-atlas', 'workspace', 'upload', 'unknown')),
  CONSTRAINT library_items_legacy_source_check
    CHECK (legacy_source IS NULL OR legacy_source IN ('home_artifacts', 'project_bookmarks'))
);

CREATE INDEX IF NOT EXISTS library_items_user_created_idx
  ON public.library_items (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS library_items_user_project_idx
  ON public.library_items (user_id, project_id);

CREATE INDEX IF NOT EXISTS library_items_user_kind_idx
  ON public.library_items (user_id, kind);

CREATE UNIQUE INDEX IF NOT EXISTS library_items_legacy_uq
  ON public.library_items (legacy_source, legacy_id)
  WHERE legacy_source IS NOT NULL AND legacy_id IS NOT NULL;

-- ── conversation_context_items ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.conversation_context_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  conversation_id       text NOT NULL,
  library_item_id       uuid NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  attached_by_user_id   integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  attached_at           timestamptz NOT NULL DEFAULT now(),
  detached_at           timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS conversation_context_items_active_uq
  ON public.conversation_context_items (conversation_id, library_item_id)
  WHERE detached_at IS NULL;

CREATE INDEX IF NOT EXISTS conversation_context_items_conversation_idx
  ON public.conversation_context_items (conversation_id);

CREATE INDEX IF NOT EXISTS conversation_context_items_library_item_idx
  ON public.conversation_context_items (library_item_id);

-- ── Backfill: home_artifacts / project_bookmarks (tables may be ensureColumns-only)

DO $$
BEGIN
  IF to_regclass('public.home_artifacts') IS NOT NULL THEN
    INSERT INTO public.library_items (
      user_id, project_id, kind, title, content, preview,
      origin_source, origin_conversation_id, origin_message_id,
      legacy_source, legacy_id, created_at, updated_at
    )
    SELECT
      ha.user_id,
      NULL,
      CASE lower(ha.type)
        WHEN 'document' THEN 'document'
        WHEN 'prd' THEN 'prd'
        WHEN 'plan' THEN 'plan'
        WHEN 'strategy' THEN 'strategy'
        WHEN 'spec' THEN 'spec'
        WHEN 'outline' THEN 'outline'
        WHEN 'brief' THEN 'brief'
        WHEN 'bookmark' THEN 'bookmark'
        WHEN 'sketch' THEN 'sketch'
        ELSE 'other'
      END,
      ha.title,
      ha.content,
      left(coalesce(ha.content, ''), 200),
      'ask-atlas',
      ha.conversation_id,
      NULL,
      'home_artifacts',
      ha.id::text,
      ha.created_at,
      coalesce(ha.updated_at, ha.created_at)
    FROM public.home_artifacts ha
    WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = ha.user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.library_items li
        WHERE li.legacy_source = 'home_artifacts' AND li.legacy_id = ha.id::text
      );
  END IF;

  IF to_regclass('public.project_bookmarks') IS NOT NULL THEN
    INSERT INTO public.library_items (
      user_id, project_id, kind, title, content, preview,
      origin_source, origin_conversation_id, origin_message_id,
      legacy_source, legacy_id, created_at, updated_at
    )
    SELECT
      pb.user_id,
      pb.project_id,
      'bookmark',
      pb.title,
      pb.payload_json,
      left(coalesce(nullif(pb.payload_json, ''), pb.title, ''), 200),
      'ask-atlas',
      NULL,
      pb.message_id::text,
      'project_bookmarks',
      pb.id::text,
      pb.created_at,
      pb.created_at
    FROM public.project_bookmarks pb
    WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = pb.user_id)
      AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = pb.project_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.library_items li
        WHERE li.legacy_source = 'project_bookmarks' AND li.legacy_id = pb.id::text
      );
  END IF;
END $$;

-- ── Grants ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_items TO authenticated;
GRANT ALL ON public.library_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_context_items TO authenticated;
GRANT ALL ON public.conversation_context_items TO service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Api-server enforces ownership in application code (integer users.id).
-- RLS is defense-in-depth for direct client access via email/jwt bridge.

ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_context_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.owns_library_user(p_user_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_user_id
      AND (
        u.email = lower(coalesce(auth.jwt() ->> 'email', ''))
        OR u.id::text = auth.uid()::text
      )
  );
$$;

CREATE POLICY library_items_select_own ON public.library_items
  FOR SELECT TO authenticated
  USING (public.owns_library_user(user_id));

CREATE POLICY library_items_insert_own ON public.library_items
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_library_user(user_id));

CREATE POLICY library_items_update_own ON public.library_items
  FOR UPDATE TO authenticated
  USING (public.owns_library_user(user_id));

CREATE POLICY library_items_delete_own ON public.library_items
  FOR DELETE TO authenticated
  USING (public.owns_library_user(user_id));

CREATE POLICY conversation_context_items_select_own ON public.conversation_context_items
  FOR SELECT TO authenticated
  USING (
    public.owns_library_user(attached_by_user_id)
    OR EXISTS (
      SELECT 1 FROM public.library_items li
      WHERE li.id = library_item_id AND public.owns_library_user(li.user_id)
    )
  );

CREATE POLICY conversation_context_items_insert_own ON public.conversation_context_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.owns_library_user(attached_by_user_id)
    AND EXISTS (
      SELECT 1 FROM public.library_items li
      WHERE li.id = library_item_id AND public.owns_library_user(li.user_id)
    )
  );

CREATE POLICY conversation_context_items_update_own ON public.conversation_context_items
  FOR UPDATE TO authenticated
  USING (
    public.owns_library_user(attached_by_user_id)
    OR EXISTS (
      SELECT 1 FROM public.library_items li
      WHERE li.id = library_item_id AND public.owns_library_user(li.user_id)
    )
  );

CREATE POLICY conversation_context_items_delete_own ON public.conversation_context_items
  FOR DELETE TO authenticated
  USING (
    public.owns_library_user(attached_by_user_id)
    OR EXISTS (
      SELECT 1 FROM public.library_items li
      WHERE li.id = library_item_id AND public.owns_library_user(li.user_id)
    )
  );
