
-- Fix overly permissive INSERT policy
DROP POLICY "Authenticated users can insert notifications" ON public.notifications;

CREATE POLICY "Users can insert own notifications"
ON public.notifications FOR INSERT
WITH CHECK (auth.uid() = user_id);
