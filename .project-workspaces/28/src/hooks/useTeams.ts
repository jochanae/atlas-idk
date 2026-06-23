import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Team {
  id: string;
  name: string;
  slug: string | null;
  owner_id: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  invited_email: string | null;
  invited_at: string | null;
  joined_at: string | null;
  status: string;
  created_at: string;
  profile?: { display_name: string | null; avatar_url: string | null } | null;
}

export function useTeams() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Team[];
    },
  });
}

export function useTeamMembers(teamId: string | undefined) {
  return useQuery({
    queryKey: ["team-members", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members" as any)
        .select("*")
        .eq("team_id", teamId!)
        .order("created_at", { ascending: true });
      if (error) throw error;

      // Fetch profiles for active members
      const members = (data ?? []) as unknown as TeamMember[];
      const userIds = members.filter((m) => m.user_id).map((m) => m.user_id);
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", userIds);
        const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
        members.forEach((m) => {
          m.profile = profileMap.get(m.user_id) ?? null;
        });
      }
      return members;
    },
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      // Create the team
      const { data: team, error } = await supabase
        .from("teams" as any)
        .insert({ name, slug, owner_id: user.id } as any)
        .select()
        .single();
      if (error) throw error;

      // Add owner as active member
      const { error: memberError } = await supabase
        .from("team_members" as any)
        .insert({
          team_id: (team as any).id,
          user_id: user.id,
          role: "owner",
          status: "active",
          joined_at: new Date().toISOString(),
        } as any);
      if (memberError) throw memberError;

      return team as unknown as Team;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      toast.success("Team created!");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useInviteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, email, role = "member" }: { teamId: string; email: string; role?: string }) => {
      // Check if a user with this email exists
      // We'll store the invite with invited_email for now
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // For simplicity, create a placeholder member entry
      // In production you'd send an invite email
      const { error } = await supabase
        .from("team_members" as any)
        .insert({
          team_id: teamId,
          user_id: user.id, // placeholder — will be replaced when invite is accepted
          invited_email: email,
          role,
          status: "pending",
        } as any);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["team-members", vars.teamId] });
      toast.success("Invite sent!");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useRemoveTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, teamId }: { memberId: string; teamId: string }) => {
      const { error } = await supabase
        .from("team_members" as any)
        .delete()
        .eq("id", memberId);
      if (error) throw error;
      return teamId;
    },
    onSuccess: (teamId) => {
      qc.invalidateQueries({ queryKey: ["team-members", teamId] });
      toast.success("Member removed");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, name }: { teamId: string; name: string }) => {
      const { error } = await supabase
        .from("teams" as any)
        .update({ name } as any)
        .eq("id", teamId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      toast.success("Team updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
