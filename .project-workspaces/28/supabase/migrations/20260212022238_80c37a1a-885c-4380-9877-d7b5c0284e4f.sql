-- Fix infinite recursion between presentations and presentation_collaborators RLS policies

-- Step 1: Create a security definer function to check collaboration without triggering RLS
CREATE OR REPLACE FUNCTION public.is_collaborator(_presentation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.presentation_collaborators
    WHERE presentation_id = _presentation_id AND user_id = _user_id
  );
$$;

-- Step 2: Create a security definer function to check presentation ownership
CREATE OR REPLACE FUNCTION public.is_presentation_owner(_presentation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.presentations
    WHERE id = _presentation_id AND user_id = _user_id
  );
$$;

-- Step 3: Drop the problematic policies
DROP POLICY IF EXISTS "Collaborators can view presentations" ON public.presentations;
DROP POLICY IF EXISTS "Owners can manage collaborators" ON public.presentation_collaborators;

-- Step 4: Recreate policies using security definer functions (no cross-table RLS queries)
CREATE POLICY "Collaborators can view presentations"
ON public.presentations
FOR SELECT
USING (public.is_collaborator(id, auth.uid()));

CREATE POLICY "Owners can manage collaborators"
ON public.presentation_collaborators
FOR ALL
USING (public.is_presentation_owner(presentation_id, auth.uid()));
