
-- Knowledge base table for glossary, how-tos, pro tips
CREATE TABLE public.knowledge_base (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'glossary',
  tags TEXT[] DEFAULT '{}'::text[],
  sort_order INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

-- Anyone can read published entries
CREATE POLICY "Anyone can view published knowledge base entries"
ON public.knowledge_base
FOR SELECT
USING (is_published = true);

-- Admins can manage all entries
CREATE POLICY "Admins can manage knowledge base"
ON public.knowledge_base
FOR ALL
USING (is_admin(auth.uid()));

-- Timestamp trigger
CREATE TRIGGER update_knowledge_base_updated_at
BEFORE UPDATE ON public.knowledge_base
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
