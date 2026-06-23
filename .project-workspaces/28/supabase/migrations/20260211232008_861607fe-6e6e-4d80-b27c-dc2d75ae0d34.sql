
-- Table to track viewer engagement on shared/public presentations
CREATE TABLE public.presentation_views (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  presentation_id uuid NOT NULL REFERENCES public.presentations(id) ON DELETE CASCADE,
  slide_index integer NOT NULL DEFAULT 0,
  time_spent_seconds integer NOT NULL DEFAULT 0,
  viewer_session text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.presentation_views ENABLE ROW LEVEL SECURITY;

-- Anyone can insert views (anonymous viewers)
CREATE POLICY "Anyone can record views on public presentations"
ON public.presentation_views
FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.presentations WHERE id = presentation_id AND is_public = true)
);

-- Presentation owners can read their analytics
CREATE POLICY "Owners can view their presentation analytics"
ON public.presentation_views
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.presentations WHERE id = presentation_id AND user_id = auth.uid())
);

-- Index for fast lookups
CREATE INDEX idx_presentation_views_pres_id ON public.presentation_views(presentation_id);
CREATE INDEX idx_presentation_views_session ON public.presentation_views(viewer_session);
