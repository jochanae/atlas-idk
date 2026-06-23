
-- Slide comments for collaborators
CREATE TABLE public.slide_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_id uuid NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  presentation_id uuid NOT NULL REFERENCES public.presentations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  body text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.slide_comments ENABLE ROW LEVEL SECURITY;

-- Owner can do everything
CREATE POLICY "Owners can manage comments" ON public.slide_comments
  FOR ALL USING (is_presentation_owner(presentation_id, auth.uid()));

-- Collaborators can view comments
CREATE POLICY "Collaborators can view comments" ON public.slide_comments
  FOR SELECT USING (is_collaborator(presentation_id, auth.uid()));

-- Collaborators can create comments
CREATE POLICY "Collaborators can create comments" ON public.slide_comments
  FOR INSERT WITH CHECK (is_collaborator(presentation_id, auth.uid()) AND auth.uid() = user_id);

-- Users can update/delete their own comments
CREATE POLICY "Users can update own comments" ON public.slide_comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments" ON public.slide_comments
  FOR DELETE USING (auth.uid() = user_id);

-- Slide version history
CREATE TABLE public.slide_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_id uuid NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  presentation_id uuid NOT NULL REFERENCES public.presentations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  block_type text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  version_number integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.slide_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own slide versions" ON public.slide_versions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own slide versions" ON public.slide_versions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own slide versions" ON public.slide_versions
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_slide_versions_slide ON public.slide_versions (slide_id, version_number DESC);
CREATE INDEX idx_slide_comments_slide ON public.slide_comments (slide_id, created_at);
