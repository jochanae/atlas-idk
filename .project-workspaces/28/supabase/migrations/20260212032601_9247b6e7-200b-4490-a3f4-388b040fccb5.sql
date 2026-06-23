
-- Teams table
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'My Team',
  slug text UNIQUE,
  owner_id uuid NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Team members table
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invited_email text,
  invited_at timestamptz DEFAULT now(),
  joined_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Team presentations (shared decks)
CREATE TABLE public.team_presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  presentation_id uuid NOT NULL REFERENCES public.presentations(id) ON DELETE CASCADE,
  shared_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, presentation_id)
);

ALTER TABLE public.team_presentations ENABLE ROW LEVEL SECURITY;

-- Security definer: check if user is member of a team
CREATE OR REPLACE FUNCTION public.is_team_member(_team_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id AND status = 'active'
  );
$$;

-- Security definer: check if user is team admin/owner
CREATE OR REPLACE FUNCTION public.is_team_admin(_team_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id AND status = 'active' AND role IN ('owner', 'admin')
  );
$$;

-- RLS for teams
CREATE POLICY "Members can view their teams"
  ON public.teams FOR SELECT
  USING (is_team_member(id, auth.uid()));

CREATE POLICY "Authenticated users can create teams"
  ON public.teams FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Team admins can update team"
  ON public.teams FOR UPDATE
  USING (is_team_admin(id, auth.uid()));

CREATE POLICY "Team owners can delete team"
  ON public.teams FOR DELETE
  USING (auth.uid() = owner_id);

-- RLS for team_members
CREATE POLICY "Members can view team members"
  ON public.team_members FOR SELECT
  USING (is_team_member(team_id, auth.uid()));

CREATE POLICY "Invited users can see their pending invites"
  ON public.team_members FOR SELECT
  USING (user_id = auth.uid() AND status = 'pending');

CREATE POLICY "Team admins can add members"
  ON public.team_members FOR INSERT
  WITH CHECK (is_team_admin(team_id, auth.uid()));

CREATE POLICY "Team admins can update members"
  ON public.team_members FOR UPDATE
  USING (is_team_admin(team_id, auth.uid()));

CREATE POLICY "Users can accept their own invites"
  ON public.team_members FOR UPDATE
  USING (user_id = auth.uid() AND status = 'pending');

CREATE POLICY "Team admins can remove members"
  ON public.team_members FOR DELETE
  USING (is_team_admin(team_id, auth.uid()));

-- RLS for team_presentations
CREATE POLICY "Team members can view shared presentations"
  ON public.team_presentations FOR SELECT
  USING (is_team_member(team_id, auth.uid()));

CREATE POLICY "Team members can share presentations"
  ON public.team_presentations FOR INSERT
  WITH CHECK (is_team_member(team_id, auth.uid()));

CREATE POLICY "Team admins can remove shared presentations"
  ON public.team_presentations FOR DELETE
  USING (is_team_admin(team_id, auth.uid()));

-- Trigger for updated_at on teams
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
