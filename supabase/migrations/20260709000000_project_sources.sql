-- F2 Source Intelligence Foundation — per-project code index
-- Tables: project_sources, project_source_files, project_source_embeddings, project_source_snapshots
-- Storage bucket: project-sources
--
-- Note: project_id is integer to match public.projects(id) in atlas-idk (serial PK).
-- Handoff docs mentioned uuid; adapted to the live schema.

CREATE EXTENSION IF NOT EXISTS vector;

-- ── project_sources ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  project_id integer NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_primary boolean NOT NULL DEFAULT false,
  last_ingested_at timestamptz,
  last_ingest_status text NOT NULL DEFAULT 'pending',
  last_ingest_error text,
  file_count integer NOT NULL DEFAULT 0,
  total_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_sources_source_type_check
    CHECK (source_type IN ('zip', 'github', 'replit', 'generated', 'pasted')),
  CONSTRAINT project_sources_status_check
    CHECK (last_ingest_status IN ('pending', 'indexing', 'ready', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS one_primary_per_project
  ON public.project_sources (project_id)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS project_sources_project_id_idx
  ON public.project_sources (project_id);

CREATE INDEX IF NOT EXISTS project_sources_status_idx
  ON public.project_sources (last_ingest_status);

-- ── project_source_files ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_source_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  source_id uuid NOT NULL REFERENCES public.project_sources(id) ON DELETE CASCADE,
  path text NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  sha256 text NOT NULL,
  language text,
  content text,
  storage_key text,
  exports jsonb NOT NULL DEFAULT '[]'::jsonb,
  imports jsonb NOT NULL DEFAULT '[]'::jsonb,
  indexed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_source_files_source_path_uq
  ON public.project_source_files (source_id, path);

CREATE INDEX IF NOT EXISTS project_source_files_source_language_idx
  ON public.project_source_files (source_id, language);

CREATE INDEX IF NOT EXISTS project_source_files_exports_gin
  ON public.project_source_files USING gin (exports);

CREATE INDEX IF NOT EXISTS project_source_files_imports_gin
  ON public.project_source_files USING gin (imports);

-- ── project_source_embeddings ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_source_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  file_id uuid NOT NULL REFERENCES public.project_source_files(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  line_start integer NOT NULL,
  line_end integer NOT NULL,
  content text NOT NULL,
  embedding vector(1536)
);

CREATE UNIQUE INDEX IF NOT EXISTS project_source_embeddings_file_chunk_uq
  ON public.project_source_embeddings (file_id, chunk_index);

CREATE INDEX IF NOT EXISTS project_source_embeddings_file_id_idx
  ON public.project_source_embeddings (file_id);

-- ivfflat requires rows before build in some PG versions; create if possible
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS project_source_embeddings_embedding_ivfflat
    ON public.project_source_embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
EXCEPTION
  WHEN others THEN
    -- Fall back to HNSW if ivfflat cannot be created yet (empty table / version)
    BEGIN
      CREATE INDEX IF NOT EXISTS project_source_embeddings_embedding_hnsw
        ON public.project_source_embeddings
        USING hnsw (embedding vector_cosine_ops);
    EXCEPTION
      WHEN others THEN
        RAISE NOTICE 'Skipping vector index creation: %', SQLERRM;
    END;
END $$;

-- ── project_source_snapshots ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  source_id uuid NOT NULL REFERENCES public.project_sources(id) ON DELETE CASCADE,
  taken_at timestamptz NOT NULL DEFAULT now(),
  file_manifest jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS project_source_snapshots_source_id_idx
  ON public.project_source_snapshots (source_id);

-- ── Grants ───────────────────────────────────────────────────────────────────
-- Api-server uses service_role / direct DATABASE_URL. Authenticated clients
-- may read via RLS when project ownership can be established.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_sources TO authenticated;
GRANT ALL ON public.project_sources TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_source_files TO authenticated;
GRANT ALL ON public.project_source_files TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_source_embeddings TO authenticated;
GRANT ALL ON public.project_source_embeddings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_source_snapshots TO authenticated;
GRANT ALL ON public.project_source_snapshots TO service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Ownership: projects.user_id is integer (local users.id). Supabase auth.uid()
-- is uuid. Direct client access is limited; api-server enforces ownership in
-- application code. Policies allow SELECT when a matching projects row exists
-- for the caller's email-linked local user is not available here, so we use
-- service_role for writes and permissive authenticated SELECT scoped by
-- project membership via a SECURITY DEFINER helper when present.
--
-- Practical policy: authenticated users can SELECT rows for projects they own
-- when users.email matches auth.jwt() email (bridge used elsewhere).

ALTER TABLE public.project_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_source_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_source_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_source_snapshots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.owns_project(p_project_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.users u ON u.id = p.user_id
    WHERE p.id = p_project_id
      AND (
        u.email = lower(coalesce(auth.jwt() ->> 'email', ''))
        OR p.user_id::text = auth.uid()::text
      )
  );
$$;

CREATE POLICY project_sources_select_own ON public.project_sources
  FOR SELECT TO authenticated
  USING (public.owns_project(project_id));

CREATE POLICY project_sources_insert_own ON public.project_sources
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_project(project_id));

CREATE POLICY project_sources_update_own ON public.project_sources
  FOR UPDATE TO authenticated
  USING (public.owns_project(project_id));

CREATE POLICY project_sources_delete_own ON public.project_sources
  FOR DELETE TO authenticated
  USING (public.owns_project(project_id));

CREATE POLICY project_source_files_select_own ON public.project_source_files
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_sources s
      WHERE s.id = source_id AND public.owns_project(s.project_id)
    )
  );

CREATE POLICY project_source_files_write_own ON public.project_source_files
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_sources s
      WHERE s.id = source_id AND public.owns_project(s.project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_sources s
      WHERE s.id = source_id AND public.owns_project(s.project_id)
    )
  );

CREATE POLICY project_source_embeddings_select_own ON public.project_source_embeddings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_source_files f
      JOIN public.project_sources s ON s.id = f.source_id
      WHERE f.id = file_id AND public.owns_project(s.project_id)
    )
  );

CREATE POLICY project_source_embeddings_write_own ON public.project_source_embeddings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_source_files f
      JOIN public.project_sources s ON s.id = f.source_id
      WHERE f.id = file_id AND public.owns_project(s.project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.project_source_files f
      JOIN public.project_sources s ON s.id = f.source_id
      WHERE f.id = file_id AND public.owns_project(s.project_id)
    )
  );

CREATE POLICY project_source_snapshots_select_own ON public.project_source_snapshots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_sources s
      WHERE s.id = source_id AND public.owns_project(s.project_id)
    )
  );

CREATE POLICY project_source_snapshots_write_own ON public.project_source_snapshots
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_sources s
      WHERE s.id = source_id AND public.owns_project(s.project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_sources s
      WHERE s.id = source_id AND public.owns_project(s.project_id)
    )
  );

-- ── Storage bucket: project-sources ──────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('project-sources', 'project-sources', false, 52428800)
ON CONFLICT (id) DO NOTHING;

-- Path convention: project-sources/<projectId>/<sourceId>/<sha256>.txt
-- First folder segment is project id (integer as text).

CREATE POLICY project_sources_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-sources'
    AND public.owns_project((storage.foldername(name))[1]::integer)
  );

CREATE POLICY project_sources_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-sources'
    AND public.owns_project((storage.foldername(name))[1]::integer)
  );

CREATE POLICY project_sources_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-sources'
    AND public.owns_project((storage.foldername(name))[1]::integer)
  );

CREATE POLICY project_sources_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-sources'
    AND public.owns_project((storage.foldername(name))[1]::integer)
  );
