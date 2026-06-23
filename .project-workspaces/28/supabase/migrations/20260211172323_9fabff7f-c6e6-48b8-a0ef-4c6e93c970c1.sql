
-- Create presentations table
CREATE TABLE public.presentations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Presentation',
  description TEXT,
  goal TEXT DEFAULT 'Teach',
  theme JSONB DEFAULT '{"primary": "#D4AF37", "background": "#0A0A0A", "font": "Inter"}'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT false,
  slide_order UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create slides table
CREATE TABLE public.slides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  presentation_id UUID NOT NULL REFERENCES public.presentations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL DEFAULT 'blank',
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create slide_assets table for file storage references
CREATE TABLE public.slide_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_id UUID NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create subscriptions table for Stripe
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create slide_templates table
CREATE TABLE public.slide_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  block_type TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview_url TEXT,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.presentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slide_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slide_templates ENABLE ROW LEVEL SECURITY;

-- Presentations policies
CREATE POLICY "Users can view their own presentations" ON public.presentations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view public presentations" ON public.presentations FOR SELECT USING (is_public = true);
CREATE POLICY "Users can create their own presentations" ON public.presentations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own presentations" ON public.presentations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own presentations" ON public.presentations FOR DELETE USING (auth.uid() = user_id);

-- Slides policies
CREATE POLICY "Users can view their own slides" ON public.slides FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own slides" ON public.slides FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own slides" ON public.slides FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own slides" ON public.slides FOR DELETE USING (auth.uid() = user_id);

-- Slide assets policies
CREATE POLICY "Users can view their own assets" ON public.slide_assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upload their own assets" ON public.slide_assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own assets" ON public.slide_assets FOR DELETE USING (auth.uid() = user_id);

-- Subscriptions policies
CREATE POLICY "Users can view their own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own subscription" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own subscription" ON public.subscriptions FOR UPDATE USING (auth.uid() = user_id);

-- Templates are viewable by everyone
CREATE POLICY "Templates are viewable by everyone" ON public.slide_templates FOR SELECT USING (true);

-- Auto-create subscription on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_subscription();

-- Update timestamp triggers
CREATE TRIGGER update_presentations_updated_at
  BEFORE UPDATE ON public.presentations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_slides_updated_at
  BEFORE UPDATE ON public.slides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for slide assets
INSERT INTO storage.buckets (id, name, public) VALUES ('slide-assets', 'slide-assets', false);

CREATE POLICY "Users can upload their own slide assets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'slide-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view their own slide assets" ON storage.objects FOR SELECT USING (bucket_id = 'slide-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own slide assets" ON storage.objects FOR DELETE USING (bucket_id = 'slide-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Indexes for performance
CREATE INDEX idx_presentations_user_id ON public.presentations(user_id);
CREATE INDEX idx_slides_presentation_id ON public.slides(presentation_id);
CREATE INDEX idx_slides_user_id ON public.slides(user_id);
CREATE INDEX idx_slide_assets_slide_id ON public.slide_assets(slide_id);
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);

-- Seed some starter templates
INSERT INTO public.slide_templates (name, category, block_type, content, is_premium) VALUES
  ('Title Slide', 'General', 'title', '{"heading": "Your Title Here", "subheading": "Subtitle goes here", "layout": "center"}', false),
  ('Story Opening', 'Story', 'story', '{"heading": "Once upon a time...", "body": "Start with a compelling story that hooks your audience.", "layout": "left"}', false),
  ('Framework', 'Teaching', 'framework', '{"heading": "The 3-Step Framework", "steps": ["Step 1", "Step 2", "Step 3"], "layout": "columns"}', false),
  ('Data Visualization', 'Data', 'data', '{"heading": "The Numbers Speak", "metric": "85%", "description": "Of audiences retain visual data better", "layout": "center"}', false),
  ('Call to Action', 'CTA', 'cta', '{"heading": "Ready to Transform?", "body": "Take the next step today.", "buttonText": "Get Started", "layout": "center"}', false),
  ('Quote Slide', 'Inspire', 'quote', '{"quote": "The only way to do great work is to love what you do.", "attribution": "Steve Jobs", "layout": "center"}', false),
  ('Comparison', 'Teaching', 'comparison', '{"heading": "Before vs After", "left": {"title": "Before", "points": ["Point 1", "Point 2"]}, "right": {"title": "After", "points": ["Point 1", "Point 2"]}, "layout": "split"}', true),
  ('Testimonial', 'CTA', 'testimonial', '{"quote": "This changed everything for me.", "name": "Jane Doe", "role": "CEO", "layout": "center"}', true);
