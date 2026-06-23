
-- Live polls table
CREATE TABLE public.live_polls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  presentation_id UUID REFERENCES public.presentations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  question TEXT NOT NULL,
  poll_type TEXT NOT NULL DEFAULT 'multiple_choice',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  show_results BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.live_polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own polls" ON public.live_polls FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own polls" ON public.live_polls FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own polls" ON public.live_polls FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can view own polls" ON public.live_polls FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anyone can view active polls of public presentations" ON public.live_polls FOR SELECT USING (
  is_active = true AND EXISTS (
    SELECT 1 FROM presentations WHERE presentations.id = live_polls.presentation_id AND presentations.is_public = true
  )
);

-- Poll votes table (anonymous audience votes)
CREATE TABLE public.poll_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id UUID NOT NULL REFERENCES public.live_polls(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  voter_session TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can vote on active polls" ON public.poll_votes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM live_polls WHERE live_polls.id = poll_votes.poll_id AND live_polls.is_active = true)
);
CREATE POLICY "Poll owners can view votes" ON public.poll_votes FOR SELECT USING (
  EXISTS (SELECT 1 FROM live_polls WHERE live_polls.id = poll_votes.poll_id AND live_polls.user_id = auth.uid())
);
CREATE POLICY "Anyone can view votes on active polls" ON public.poll_votes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM live_polls WHERE live_polls.id = poll_votes.poll_id AND live_polls.is_active = true AND live_polls.show_results = true
  )
);

-- Live Q&A questions from audience
CREATE TABLE public.live_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  presentation_id UUID NOT NULL REFERENCES public.presentations(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL DEFAULT 'Anonymous',
  body TEXT NOT NULL,
  is_answered BOOLEAN NOT NULL DEFAULT false,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  upvotes INTEGER NOT NULL DEFAULT 0,
  voter_session TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.live_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit questions to public presentations" ON public.live_questions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM presentations WHERE presentations.id = live_questions.presentation_id AND presentations.is_public = true)
);
CREATE POLICY "Presentation owners can manage questions" ON public.live_questions FOR ALL USING (
  EXISTS (SELECT 1 FROM presentations WHERE presentations.id = live_questions.presentation_id AND presentations.user_id = auth.uid())
);
CREATE POLICY "Anyone can view questions on public presentations" ON public.live_questions FOR SELECT USING (
  EXISTS (SELECT 1 FROM presentations WHERE presentations.id = live_questions.presentation_id AND presentations.is_public = true)
);

-- Enable realtime for live interaction
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_polls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_questions;

-- Unique constraint: one vote per session per poll
CREATE UNIQUE INDEX idx_poll_votes_unique ON public.poll_votes(poll_id, voter_session);
