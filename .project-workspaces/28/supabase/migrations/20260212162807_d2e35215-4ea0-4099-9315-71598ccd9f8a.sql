
-- Learning content (videos, tutorials, spotlights)
CREATE TABLE public.learning_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'tutorial' CHECK (category IN ('tutorial', 'tips', 'spotlight', 'announcement')),
  is_featured BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Events table
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'webinar' CHECK (event_type IN ('webinar', 'workshop', 'seminar', 'meetup', 'livestream')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  join_url TEXT,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event reminders (user-specific)
CREATE TABLE public.event_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_id)
);

-- RLS for learning_content (public read, admin write)
ALTER TABLE public.learning_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view learning content" ON public.learning_content FOR SELECT USING (true);
CREATE POLICY "Admins can manage learning content" ON public.learning_content FOR ALL USING (public.is_admin(auth.uid()));

-- RLS for events (public read, admin write)
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view published events" ON public.events FOR SELECT USING (is_published = true);
CREATE POLICY "Admins can manage events" ON public.events FOR ALL USING (public.is_admin(auth.uid()));

-- RLS for event_reminders (user-specific)
ALTER TABLE public.event_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own reminders" ON public.event_reminders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own reminders" ON public.event_reminders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own reminders" ON public.event_reminders FOR DELETE USING (auth.uid() = user_id);

-- Timestamp triggers
CREATE TRIGGER update_learning_content_updated_at BEFORE UPDATE ON public.learning_content FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
