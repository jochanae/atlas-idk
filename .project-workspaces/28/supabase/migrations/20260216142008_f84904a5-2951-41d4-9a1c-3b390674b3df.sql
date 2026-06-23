
-- Create a global file library table
CREATE TABLE public.file_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT '',
  file_size INTEGER DEFAULT 0,
  thumbnail_url TEXT,
  ai_summary TEXT,
  ai_key_points JSONB DEFAULT '[]'::jsonb,
  ai_suggested_slides JSONB DEFAULT '[]'::jsonb,
  annotations JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}'::text[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Junction table to link files to presentations
CREATE TABLE public.file_library_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES public.file_library(id) ON DELETE CASCADE,
  presentation_id UUID NOT NULL REFERENCES public.presentations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(file_id, presentation_id)
);

-- Enable RLS
ALTER TABLE public.file_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_library_links ENABLE ROW LEVEL SECURITY;

-- RLS policies for file_library
CREATE POLICY "Users can view own files" ON public.file_library FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own files" ON public.file_library FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own files" ON public.file_library FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own files" ON public.file_library FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for file_library_links
CREATE POLICY "Users can view own links" ON public.file_library_links FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own links" ON public.file_library_links FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own links" ON public.file_library_links FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_file_library_updated_at
  BEFORE UPDATE ON public.file_library
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for file library
INSERT INTO storage.buckets (id, name, public) VALUES ('file-library', 'file-library', true);

-- Storage policies
CREATE POLICY "Users can upload own files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'file-library' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own files" ON storage.objects FOR SELECT USING (bucket_id = 'file-library' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own files" ON storage.objects FOR DELETE USING (bucket_id = 'file-library' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own files" ON storage.objects FOR UPDATE USING (bucket_id = 'file-library' AND auth.uid()::text = (storage.foldername(name))[1]);
