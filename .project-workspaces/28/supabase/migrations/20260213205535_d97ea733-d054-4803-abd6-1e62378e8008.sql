
-- 1. Rehearsal recordings
CREATE TABLE public.rehearsal_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  presentation_id UUID REFERENCES public.presentations(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Rehearsal',
  duration_seconds INT NOT NULL DEFAULT 0,
  audio_url TEXT,
  wpm_average INT,
  filler_word_count INT DEFAULT 0,
  slide_timings JSONB DEFAULT '[]'::jsonb,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rehearsal_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recordings" ON public.rehearsal_recordings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own recordings" ON public.rehearsal_recordings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own recordings" ON public.rehearsal_recordings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own recordings" ON public.rehearsal_recordings FOR DELETE USING (auth.uid() = user_id);

-- 2. Coaching reports (summaries per rehearsal)
CREATE TABLE public.coaching_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  presentation_id UUID REFERENCES public.presentations(id) ON DELETE CASCADE,
  rehearsal_id UUID REFERENCES public.rehearsal_recordings(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  strengths JSONB DEFAULT '[]'::jsonb,
  improvements JSONB DEFAULT '[]'::jsonb,
  pacing_analysis JSONB DEFAULT '{}'::jsonb,
  overall_score INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.coaching_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reports" ON public.coaching_reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own reports" ON public.coaching_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reports" ON public.coaching_reports FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reports" ON public.coaching_reports FOR DELETE USING (auth.uid() = user_id);

-- 3. Remote-control presets
CREATE TABLE public.remote_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  config JSONB NOT NULL DEFAULT '{"nextSlide":"ArrowRight","prevSlide":"ArrowLeft","toggleNotes":"n","togglePointer":"p","blackScreen":"b","endPresentation":"Escape"}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.remote_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own presets" ON public.remote_presets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own presets" ON public.remote_presets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own presets" ON public.remote_presets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own presets" ON public.remote_presets FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_remote_presets_updated_at BEFORE UPDATE ON public.remote_presets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
