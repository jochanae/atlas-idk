-- Restrict premium templates to subscribers only
-- Drop the existing overly-permissive policy
DROP POLICY IF EXISTS "Templates are viewable by everyone" ON public.slide_templates;

-- Allow viewing non-premium templates by everyone
CREATE POLICY "Non-premium templates are viewable by everyone"
ON public.slide_templates
FOR SELECT
USING (is_premium = false);

-- Allow premium templates only for users with active paid subscriptions
CREATE POLICY "Premium templates for subscribers only"
ON public.slide_templates
FOR SELECT
USING (
  is_premium = true
  AND EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE subscriptions.user_id = auth.uid()
      AND subscriptions.plan != 'free'
      AND subscriptions.status = 'active'
  )
);