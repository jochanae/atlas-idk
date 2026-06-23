
-- Create table for Arc conversation history
CREATE TABLE public.arc_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  mode TEXT NOT NULL DEFAULT 'guided',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.arc_conversations ENABLE ROW LEVEL SECURITY;

-- Users can only access their own conversations
CREATE POLICY "Users can view their own arc conversations"
ON public.arc_conversations FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own arc conversations"
ON public.arc_conversations FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own arc conversations"
ON public.arc_conversations FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own arc conversations"
ON public.arc_conversations FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_arc_conversations_updated_at
BEFORE UPDATE ON public.arc_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast user lookups
CREATE INDEX idx_arc_conversations_user_id ON public.arc_conversations(user_id);
