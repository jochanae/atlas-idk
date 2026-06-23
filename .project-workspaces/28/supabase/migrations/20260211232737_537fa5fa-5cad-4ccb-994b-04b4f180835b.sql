
-- Referrals table
CREATE TABLE public.referrals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id uuid NOT NULL,
  referred_email text NOT NULL,
  referred_user_id uuid,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed_up', 'converted')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own referrals"
ON public.referrals FOR SELECT
USING (auth.uid() = referrer_id);

CREATE POLICY "Users can create referrals"
ON public.referrals FOR INSERT
WITH CHECK (auth.uid() = referrer_id);

CREATE POLICY "Users can update their own referrals"
ON public.referrals FOR UPDATE
USING (auth.uid() = referrer_id);
