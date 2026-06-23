
-- Audience reactions table for live emoji/pulse feedback
CREATE TABLE public.audience_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  presentation_id UUID NOT NULL REFERENCES public.presentations(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL DEFAULT 'emoji',
  value TEXT NOT NULL,
  viewer_session TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.audience_reactions ENABLE ROW LEVEL SECURITY;

-- Anyone can react on public presentations
CREATE POLICY "Anyone can react on public presentations"
ON public.audience_reactions FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM presentations WHERE id = presentation_id AND is_public = true
));

-- Presentation owners can view reactions
CREATE POLICY "Owners can view reactions"
ON public.audience_reactions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM presentations WHERE id = presentation_id AND user_id = auth.uid()
));

-- Anyone can view reactions on public presentations
CREATE POLICY "Anyone can view reactions on public presentations"
ON public.audience_reactions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM presentations WHERE id = presentation_id AND is_public = true
));

-- Enable realtime for audience_reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.audience_reactions;

-- AI content tags table
CREATE TABLE public.slide_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_id UUID NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  presentation_id UUID NOT NULL REFERENCES public.presentations(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  source TEXT NOT NULL DEFAULT 'ai',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.slide_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own slide tags"
ON public.slide_tags FOR SELECT
USING (EXISTS (SELECT 1 FROM presentations WHERE id = presentation_id AND user_id = auth.uid()));

CREATE POLICY "Users can create own slide tags"
ON public.slide_tags FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM presentations WHERE id = presentation_id AND user_id = auth.uid()));

CREATE POLICY "Users can delete own slide tags"
ON public.slide_tags FOR DELETE
USING (EXISTS (SELECT 1 FROM presentations WHERE id = presentation_id AND user_id = auth.uid()));

CREATE INDEX idx_slide_tags_presentation ON public.slide_tags(presentation_id);
CREATE INDEX idx_slide_tags_tag ON public.slide_tags(tag);
