-- Add folder and soft-delete columns to presentations
ALTER TABLE public.presentations
ADD COLUMN folder text DEFAULT NULL,
ADD COLUMN deleted_at timestamp with time zone DEFAULT NULL;

-- Index for fast folder filtering and trash queries
CREATE INDEX idx_presentations_folder ON public.presentations (user_id, folder);
CREATE INDEX idx_presentations_deleted_at ON public.presentations (user_id, deleted_at);
