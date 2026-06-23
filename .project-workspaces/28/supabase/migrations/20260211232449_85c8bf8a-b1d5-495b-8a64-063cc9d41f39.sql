
-- Allow anyone to view slides of public presentations (needed for shared viewer)
CREATE POLICY "Anyone can view slides of public presentations"
ON public.slides
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.presentations WHERE id = presentation_id AND is_public = true)
);

-- Collaboration table
CREATE TABLE public.presentation_collaborators (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  presentation_id uuid NOT NULL REFERENCES public.presentations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('viewer', 'editor')),
  invited_email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(presentation_id, user_id)
);

ALTER TABLE public.presentation_collaborators ENABLE ROW LEVEL SECURITY;

-- Presentation owner can manage collaborators
CREATE POLICY "Owners can manage collaborators"
ON public.presentation_collaborators
FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.presentations WHERE id = presentation_id AND user_id = auth.uid())
);

-- Collaborators can see their own invites
CREATE POLICY "Users can see their own collaborations"
ON public.presentation_collaborators
FOR SELECT
USING (user_id = auth.uid());

-- Collaborators with 'editor' role can view/edit slides
CREATE POLICY "Collaborators can view slides"
ON public.slides
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.presentation_collaborators WHERE presentation_id = slides.presentation_id AND user_id = auth.uid())
);

CREATE POLICY "Editor collaborators can update slides"
ON public.slides
FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM public.presentation_collaborators WHERE presentation_id = slides.presentation_id AND user_id = auth.uid() AND role = 'editor')
);

-- Collaborators can view the presentation
CREATE POLICY "Collaborators can view presentations"
ON public.presentations
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.presentation_collaborators WHERE presentation_id = id AND user_id = auth.uid())
);
