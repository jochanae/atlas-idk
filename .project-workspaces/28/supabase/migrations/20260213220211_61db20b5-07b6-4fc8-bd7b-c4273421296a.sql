
-- Presentation recordings table
CREATE TABLE public.presentation_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  presentation_id UUID REFERENCES public.presentations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Recording',
  video_url TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  slide_timestamps JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'recording',
  file_size INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.presentation_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own recordings" ON public.presentation_recordings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own recordings" ON public.presentation_recordings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own recordings" ON public.presentation_recordings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own recordings" ON public.presentation_recordings FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket for recording videos
INSERT INTO storage.buckets (id, name, public) VALUES ('presentation-recordings', 'presentation-recordings', true);

CREATE POLICY "Users can upload their own recordings" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'presentation-recordings' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "Users can view their own recordings" ON storage.objects FOR SELECT USING (
  bucket_id = 'presentation-recordings' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "Users can delete their own recordings" ON storage.objects FOR DELETE USING (
  bucket_id = 'presentation-recordings' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "Public can view recordings" ON storage.objects FOR SELECT USING (
  bucket_id = 'presentation-recordings'
);
