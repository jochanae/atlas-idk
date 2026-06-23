-- Tighten bug_reports INSERT policy: replace WITH CHECK (true) with user_id check
-- This prevents anonymous/unauthenticated abuse while still allowing authenticated users
-- to submit bug reports (user_id can be null for unauthenticated error captures, 
-- but we restrict to authenticated users setting their own user_id)

DROP POLICY IF EXISTS "Anyone can insert bug reports" ON public.bug_reports;

-- Allow authenticated users to insert bug reports for themselves
CREATE POLICY "Authenticated users can insert own bug reports"
ON public.bug_reports
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow anonymous insert only when user_id is null (error boundary auto-reports)
CREATE POLICY "Anonymous error reports allowed"
ON public.bug_reports
FOR INSERT
TO anon
WITH CHECK (user_id IS NULL);