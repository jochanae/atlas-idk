
-- Add description field to saved_blocks for beginner-friendly explanations
ALTER TABLE public.saved_blocks ADD COLUMN IF NOT EXISTS description text;
