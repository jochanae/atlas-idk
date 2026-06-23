
-- 1. Lower thirds / overlays
CREATE TABLE public.lower_thirds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  presentation_id UUID REFERENCES public.presentations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled',
  label TEXT NOT NULL DEFAULT '',
  subtitle TEXT DEFAULT '',
  style JSONB NOT NULL DEFAULT '{"position":"bottom-left","bg":"#000000","text":"#FFFFFF","opacity":0.85}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lower_thirds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lower thirds" ON public.lower_thirds FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own lower thirds" ON public.lower_thirds FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own lower thirds" ON public.lower_thirds FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own lower thirds" ON public.lower_thirds FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_lower_thirds_updated_at BEFORE UPDATE ON public.lower_thirds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Approved imagery library
CREATE TABLE public.approved_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled',
  file_url TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  tags TEXT[] DEFAULT '{}'::text[],
  is_approved BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.approved_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own images" ON public.approved_images FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Team members can view team images" ON public.approved_images FOR SELECT USING (
  team_id IS NOT NULL AND is_team_member(team_id, auth.uid())
);
CREATE POLICY "Users can create own images" ON public.approved_images FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own images" ON public.approved_images FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own images" ON public.approved_images FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_approved_images_updated_at BEFORE UPDATE ON public.approved_images FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
