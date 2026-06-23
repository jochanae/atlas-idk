CREATE TABLE public.bug_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  error_message TEXT,
  error_stack TEXT,
  component_stack TEXT,
  page_url TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  admin_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert bug reports" ON public.bug_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view own bug reports" ON public.bug_reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all bug reports" ON public.bug_reports FOR ALL USING (is_admin(auth.uid()));