
-- Arc memory: store user presentation preferences across sessions
CREATE TABLE public.arc_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

ALTER TABLE public.arc_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own memories" ON public.arc_memories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own memories" ON public.arc_memories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own memories" ON public.arc_memories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own memories" ON public.arc_memories FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_arc_memories_updated_at BEFORE UPDATE ON public.arc_memories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
