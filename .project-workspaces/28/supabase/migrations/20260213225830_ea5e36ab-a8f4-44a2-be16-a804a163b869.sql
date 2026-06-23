
-- Team Activity Feed
CREATE TABLE public.team_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  activity_type TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  description TEXT,
  link TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.team_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view team activity" ON public.team_activity FOR SELECT USING (is_team_member(team_id, auth.uid()));
CREATE POLICY "Team members can create activity" ON public.team_activity FOR INSERT WITH CHECK (is_team_member(team_id, auth.uid()) AND auth.uid() = user_id);

-- Template Ratings for marketplace
CREATE TABLE public.template_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.slide_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(template_id, user_id)
);
ALTER TABLE public.template_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view ratings" ON public.template_ratings FOR SELECT USING (true);
CREATE POLICY "Users can create own ratings" ON public.template_ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ratings" ON public.template_ratings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ratings" ON public.template_ratings FOR DELETE USING (auth.uid() = user_id);

-- Add community fields to slide_templates
ALTER TABLE public.slide_templates ADD COLUMN IF NOT EXISTS creator_id UUID;
ALTER TABLE public.slide_templates ADD COLUMN IF NOT EXISTS is_community BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.slide_templates ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.slide_templates ADD COLUMN IF NOT EXISTS downloads INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.slide_templates ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'::text[];

-- Allow authenticated users to create community templates
CREATE POLICY "Users can create community templates" ON public.slide_templates FOR INSERT WITH CHECK (auth.uid() = creator_id AND is_community = true);
CREATE POLICY "Users can update own community templates" ON public.slide_templates FOR UPDATE USING (auth.uid() = creator_id);

-- Enable realtime for team activity
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_activity;
