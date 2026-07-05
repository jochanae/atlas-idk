-- Structured plan artifacts (see lib/db/drizzle/0003_plan_artifacts.sql)
CREATE TABLE IF NOT EXISTS public.plan_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  message_id integer REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  project_id integer NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id integer REFERENCES public.users(id) ON DELETE SET NULL,
  version integer DEFAULT 1 NOT NULL,
  parent_id uuid REFERENCES public.plan_artifacts(id) ON DELETE SET NULL,
  title text NOT NULL,
  intent text NOT NULL,
  steps jsonb DEFAULT '[]'::jsonb NOT NULL,
  open_questions jsonb,
  estimated_effort text NOT NULL,
  status text DEFAULT 'proposed' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  committed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_plan_artifacts_message_id ON public.plan_artifacts (message_id);
CREATE INDEX IF NOT EXISTS idx_plan_artifacts_project_user ON public.plan_artifacts (project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_plan_artifacts_parent_id ON public.plan_artifacts (parent_id);

GRANT SELECT, INSERT, UPDATE ON public.plan_artifacts TO authenticated;
GRANT ALL ON public.plan_artifacts TO service_role;

ALTER TABLE public.plan_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own plans" ON public.plan_artifacts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users update own plans" ON public.plan_artifacts
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
