-- Fix the infinite recursion in the collaborators policy
DROP POLICY "Collaborators can view presentations" ON public.presentations;

CREATE POLICY "Collaborators can view presentations" 
ON public.presentations 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM presentation_collaborators pc
    WHERE pc.presentation_id = presentations.id 
    AND pc.user_id = auth.uid()
  )
);