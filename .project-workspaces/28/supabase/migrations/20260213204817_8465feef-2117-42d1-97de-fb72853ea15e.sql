
-- 1. Follow-up email templates
CREATE TABLE public.follow_up_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  presentation_id UUID REFERENCES public.presentations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Template',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  template_type TEXT NOT NULL DEFAULT 'follow_up',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.follow_up_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own templates" ON public.follow_up_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own templates" ON public.follow_up_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own templates" ON public.follow_up_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own templates" ON public.follow_up_templates FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_follow_up_templates_updated_at BEFORE UPDATE ON public.follow_up_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. CTA links
CREATE TABLE public.presentation_ctas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  presentation_id UUID REFERENCES public.presentations(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Learn More',
  url TEXT NOT NULL DEFAULT '',
  cta_type TEXT NOT NULL DEFAULT 'link',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.presentation_ctas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ctas" ON public.presentation_ctas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own ctas" ON public.presentation_ctas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ctas" ON public.presentation_ctas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ctas" ON public.presentation_ctas FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Public ctas visible on public presentations" ON public.presentation_ctas FOR SELECT USING (
  is_active = true AND EXISTS (SELECT 1 FROM presentations WHERE presentations.id = presentation_ctas.presentation_id AND presentations.is_public = true)
);

CREATE TRIGGER update_presentation_ctas_updated_at BEFORE UPDATE ON public.presentation_ctas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Scheduling links
CREATE TABLE public.scheduling_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  presentation_id UUID REFERENCES public.presentations(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Book a Call',
  url TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT 'calendly',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduling_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scheduling links" ON public.scheduling_links FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own scheduling links" ON public.scheduling_links FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own scheduling links" ON public.scheduling_links FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own scheduling links" ON public.scheduling_links FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Public scheduling links visible" ON public.scheduling_links FOR SELECT USING (
  is_active = true AND EXISTS (SELECT 1 FROM presentations WHERE presentations.id = scheduling_links.presentation_id AND presentations.is_public = true)
);

CREATE TRIGGER update_scheduling_links_updated_at BEFORE UPDATE ON public.scheduling_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Lead magnets
CREATE TABLE public.lead_magnets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  presentation_id UUID REFERENCES public.presentations(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Free Download',
  description TEXT DEFAULT '',
  file_url TEXT,
  external_url TEXT,
  magnet_type TEXT NOT NULL DEFAULT 'pdf',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_magnets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lead magnets" ON public.lead_magnets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own lead magnets" ON public.lead_magnets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own lead magnets" ON public.lead_magnets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own lead magnets" ON public.lead_magnets FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Public lead magnets visible" ON public.lead_magnets FOR SELECT USING (
  is_active = true AND EXISTS (SELECT 1 FROM presentations WHERE presentations.id = lead_magnets.presentation_id AND presentations.is_public = true)
);

CREATE TRIGGER update_lead_magnets_updated_at BEFORE UPDATE ON public.lead_magnets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Download gates
CREATE TABLE public.download_gates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  resource_id UUID REFERENCES public.audience_resources(id) ON DELETE CASCADE,
  lead_magnet_id UUID REFERENCES public.lead_magnets(id) ON DELETE CASCADE,
  gate_type TEXT NOT NULL DEFAULT 'email',
  require_name BOOLEAN NOT NULL DEFAULT false,
  custom_message TEXT DEFAULT 'Enter your email to download',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.download_gates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gates" ON public.download_gates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own gates" ON public.download_gates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own gates" ON public.download_gates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own gates" ON public.download_gates FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Public gates readable" ON public.download_gates FOR SELECT USING (is_active = true);

CREATE TRIGGER update_download_gates_updated_at BEFORE UPDATE ON public.download_gates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Gate submissions (captures leads)
CREATE TABLE public.gate_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gate_id UUID NOT NULL REFERENCES public.download_gates(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gate_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit to active gates" ON public.gate_submissions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM download_gates WHERE download_gates.id = gate_submissions.gate_id AND download_gates.is_active = true)
);
CREATE POLICY "Gate owners can view submissions" ON public.gate_submissions FOR SELECT USING (
  EXISTS (SELECT 1 FROM download_gates WHERE download_gates.id = gate_submissions.gate_id AND download_gates.user_id = auth.uid())
);

-- 7. Surveys / feedback forms
CREATE TABLE public.presentation_surveys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  presentation_id UUID REFERENCES public.presentations(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'How was the presentation?',
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.presentation_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own surveys" ON public.presentation_surveys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own surveys" ON public.presentation_surveys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own surveys" ON public.presentation_surveys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own surveys" ON public.presentation_surveys FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Public surveys visible" ON public.presentation_surveys FOR SELECT USING (
  is_active = true AND EXISTS (SELECT 1 FROM presentations WHERE presentations.id = presentation_surveys.presentation_id AND presentations.is_public = true)
);

CREATE TRIGGER update_presentation_surveys_updated_at BEFORE UPDATE ON public.presentation_surveys FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Survey responses
CREATE TABLE public.survey_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id UUID NOT NULL REFERENCES public.presentation_surveys(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  respondent_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit survey responses" ON public.survey_responses FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM presentation_surveys WHERE presentation_surveys.id = survey_responses.survey_id AND presentation_surveys.is_active = true)
);
CREATE POLICY "Survey owners can view responses" ON public.survey_responses FOR SELECT USING (
  EXISTS (SELECT 1 FROM presentation_surveys WHERE presentation_surveys.id = survey_responses.survey_id AND presentation_surveys.user_id = auth.uid())
);
