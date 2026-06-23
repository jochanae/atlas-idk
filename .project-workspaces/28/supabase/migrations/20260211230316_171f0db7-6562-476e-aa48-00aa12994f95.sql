
-- Saved blocks: user's personal content library of reusable slide blocks
CREATE TABLE public.saved_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  block_type TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saved blocks"
ON public.saved_blocks FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own saved blocks"
ON public.saved_blocks FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved blocks"
ON public.saved_blocks FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved blocks"
ON public.saved_blocks FOR DELETE
USING (auth.uid() = user_id);

-- Brand kits: user's brand settings
CREATE TABLE public.brand_kits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Brand',
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#D4AF37',
  secondary_color TEXT NOT NULL DEFAULT '#0A0A0A',
  accent_color TEXT NOT NULL DEFAULT '#FFFFFF',
  heading_font TEXT NOT NULL DEFAULT 'Inter',
  body_font TEXT NOT NULL DEFAULT 'Inter',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own brand kits"
ON public.brand_kits FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own brand kits"
ON public.brand_kits FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own brand kits"
ON public.brand_kits FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own brand kits"
ON public.brand_kits FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_brand_kits_updated_at
BEFORE UPDATE ON public.brand_kits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed slide_templates with pre-built templates
INSERT INTO public.slide_templates (name, block_type, category, content, is_premium) VALUES
('Startup Pitch — Title', 'title', 'Startup Pitch', '{"heading": "Company Name", "subheading": "Tagline that captures your mission", "layout": "center"}', false),
('Startup Pitch — Problem', 'story', 'Startup Pitch', '{"heading": "The Problem", "body": "Describe the pain point your target customers face every day. Make it relatable and urgent.", "layout": "left"}', false),
('Startup Pitch — Solution', 'framework', 'Startup Pitch', '{"heading": "Our Solution", "steps": ["Simple to use", "Saves 10x time", "Works everywhere"], "layout": "columns"}', false),
('Startup Pitch — Traction', 'data', 'Startup Pitch', '{"heading": "Traction", "metric": "10,000+", "description": "Active users in the first 6 months", "layout": "center"}', false),
('Startup Pitch — Ask', 'cta', 'Startup Pitch', '{"heading": "Join Us", "body": "We are raising $2M to scale our platform globally.", "buttonText": "Let''s Talk", "layout": "center"}', false),

('Sales Deck — Hook', 'title', 'Sales Deck', '{"heading": "Stop Losing Deals", "subheading": "The modern way to close faster", "layout": "center"}', false),
('Sales Deck — Pain Points', 'comparison', 'Sales Deck', '{"heading": "Without Us vs With Us", "left": {"title": "Without Us", "points": ["Manual follow-ups", "Lost leads", "Slow pipeline"]}, "right": {"title": "With Us", "points": ["Automated outreach", "100% follow-through", "3x faster close"]}, "layout": "split"}', false),
('Sales Deck — Social Proof', 'testimonial', 'Sales Deck', '{"quote": "We closed 40% more deals in Q1 after switching.", "name": "Sarah Chen", "role": "VP Sales, Acme Corp", "layout": "center"}', false),
('Sales Deck — ROI', 'data', 'Sales Deck', '{"heading": "Return on Investment", "metric": "340%", "description": "Average ROI within the first year", "layout": "center"}', false),
('Sales Deck — Next Steps', 'cta', 'Sales Deck', '{"heading": "Ready to Close More?", "body": "Book a 15-minute demo and see results in week one.", "buttonText": "Book Demo", "layout": "center"}', false),

('Training — Welcome', 'title', 'Training', '{"heading": "Onboarding Guide", "subheading": "Everything you need to get started", "layout": "center"}', false),
('Training — Agenda', 'framework', 'Training', '{"heading": "Today''s Agenda", "steps": ["Introduction", "Core Concepts", "Hands-on Practice", "Q&A"], "layout": "columns"}', false),
('Training — Key Concept', 'story', 'Training', '{"heading": "Core Principle", "body": "Explain the fundamental concept clearly. Use simple language and real examples.", "layout": "left"}', false),
('Training — Key Stat', 'data', 'Training', '{"heading": "Why This Matters", "metric": "92%", "description": "of teams see improvement after proper training", "layout": "center"}', false),
('Training — Takeaway', 'quote', 'Training', '{"quote": "Tell me and I forget. Teach me and I remember. Involve me and I learn.", "attribution": "Benjamin Franklin", "layout": "center"}', false),

('Keynote — Opening', 'title', 'Keynote', '{"heading": "The Future of Work", "subheading": "How technology is reshaping everything", "layout": "center"}', false),
('Keynote — Big Idea', 'quote', 'Keynote', '{"quote": "The best way to predict the future is to create it.", "attribution": "Peter Drucker", "layout": "center"}', true),
('Keynote — Framework', 'framework', 'Keynote', '{"heading": "Three Pillars of Change", "steps": ["Automation", "Collaboration", "Intelligence"], "layout": "columns"}', true),
('Keynote — Impact', 'data', 'Keynote', '{"heading": "The Scale of Change", "metric": "4.5B", "description": "knowledge workers affected by AI in the next decade", "layout": "center"}', true),
('Keynote — Closing', 'cta', 'Keynote', '{"heading": "Start Today", "body": "The transformation has already begun. The question is: will you lead it or follow?", "buttonText": "Lead the Change", "layout": "center"}', true);
