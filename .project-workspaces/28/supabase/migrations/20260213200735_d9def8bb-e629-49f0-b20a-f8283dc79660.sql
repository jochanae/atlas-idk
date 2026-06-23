
-- Create audience_resources table
CREATE TABLE public.audience_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  presentation_id UUID REFERENCES public.presentations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  resource_type TEXT NOT NULL DEFAULT 'pdf',
  file_url TEXT,
  external_url TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audience_resources ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own resources"
ON public.audience_resources FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own resources"
ON public.audience_resources FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own resources"
ON public.audience_resources FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own resources"
ON public.audience_resources FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view public resources"
ON public.audience_resources FOR SELECT
USING (is_public = true);

-- Updated_at trigger
CREATE TRIGGER update_audience_resources_updated_at
BEFORE UPDATE ON public.audience_resources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for resource files
INSERT INTO storage.buckets (id, name, public) VALUES ('audience-resources', 'audience-resources', true);

-- Storage policies
CREATE POLICY "Users can upload their own resource files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'audience-resources' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own resource files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'audience-resources' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own resource files"
ON storage.objects FOR DELETE
USING (bucket_id = 'audience-resources' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view resource files"
ON storage.objects FOR SELECT
USING (bucket_id = 'audience-resources');
