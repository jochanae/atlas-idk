-- Capacity metering pools (production Supabase)
-- DB: osuasytymbzurjvklhde

CREATE TABLE IF NOT EXISTS public.capacity_pools (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'explorer',
  monthly_allotment integer NOT NULL DEFAULT 30,
  daily_allotment integer,
  used_this_period integer NOT NULL DEFAULT 0,
  used_today integer NOT NULL DEFAULT 0,
  topup_balance integer NOT NULL DEFAULT 0,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  day_start timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.capacity_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY capacity_pools_select_own ON public.capacity_pools
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY capacity_pools_update_own ON public.capacity_pools
  FOR UPDATE USING (auth.uid() = user_id);

GRANT SELECT ON public.capacity_pools TO authenticated;
GRANT ALL ON public.capacity_pools TO service_role;

CREATE OR REPLACE FUNCTION public.bootstrap_capacity_pool(p_user_id uuid, p_tier text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_monthly integer;
  v_daily integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_day_start timestamptz;
BEGIN
  v_period_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_period_end := (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC';
  v_day_start := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  CASE p_tier
    WHEN 'explorer' THEN v_monthly := 30; v_daily := 5;
    WHEN 'pro' THEN v_monthly := 150; v_daily := 5;
    WHEN 'studio' THEN v_monthly := 600; v_daily := NULL;
    WHEN 'teams' THEN v_monthly := 600; v_daily := NULL;
    ELSE v_monthly := 30; v_daily := 5;
  END CASE;

  INSERT INTO public.capacity_pools (
    user_id, tier, monthly_allotment, daily_allotment,
    used_this_period, used_today, topup_balance,
    period_start, period_end, day_start
  ) VALUES (
    p_user_id, p_tier, v_monthly, v_daily,
    0, 0, 0,
    v_period_start, v_period_end, v_day_start
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tier = EXCLUDED.tier,
    monthly_allotment = EXCLUDED.monthly_allotment,
    daily_allotment = EXCLUDED.daily_allotment,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.capacity_pools_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capacity_pools_updated_at ON public.capacity_pools;
CREATE TRIGGER capacity_pools_updated_at
  BEFORE UPDATE ON public.capacity_pools
  FOR EACH ROW
  EXECUTE FUNCTION public.capacity_pools_set_updated_at();
