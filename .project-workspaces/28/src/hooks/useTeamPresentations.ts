import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TeamSharedPresentation {
  id: string;
  presentation_id: string;
  team_id: string;
  shared_by: string;
  created_at: string;
  presentation: {
    id: string;
    title: string;
    updated_at: string;
    goal: string | null;
    folder: string | null;
  };
  team: {
    id: string;
    name: string;
  };
}

export interface DeckCollaborator {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function useTeamSharedPresentations() {
  return useQuery({
    queryKey: ["team-shared-presentations"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Get user's teams
      const { data: memberships } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (!memberships?.length) return [];

      const teamIds = memberships.map((m) => m.team_id);

      // Get shared presentations for those teams
      const { data: shared, error } = await supabase
        .from("team_presentations")
        .select("*, presentations(*), teams(*)")
        .in("team_id", teamIds)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (shared ?? []).map((s: any) => ({
        id: s.id,
        presentation_id: s.presentation_id,
        team_id: s.team_id,
        shared_by: s.shared_by,
        created_at: s.created_at,
        presentation: s.presentations,
        team: s.teams,
      })) as TeamSharedPresentation[];
    },
  });
}

export function useDeckCollaborators(presentationId: string | undefined) {
  return useQuery({
    queryKey: ["deck-collaborators", presentationId],
    enabled: !!presentationId,
    queryFn: async () => {
      const { data: collabs } = await supabase
        .from("presentation_collaborators")
        .select("user_id")
        .eq("presentation_id", presentationId!);

      if (!collabs?.length) return [];

      const userIds = collabs.map((c) => c.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds);

      return (profiles ?? []).map((p) => ({
        user_id: p.id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
      })) as DeckCollaborator[];
    },
  });
}

/** Batch fetch collaborators for multiple presentations */
export function useBatchDeckCollaborators(presentationIds: string[]) {
  return useQuery({
    queryKey: ["batch-deck-collaborators", presentationIds],
    enabled: presentationIds.length > 0,
    queryFn: async () => {
      const { data: collabs } = await supabase
        .from("presentation_collaborators")
        .select("presentation_id, user_id")
        .in("presentation_id", presentationIds);

      if (!collabs?.length) return {} as Record<string, DeckCollaborator[]>;

      const userIds = [...new Set(collabs.map((c) => c.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

      const result: Record<string, DeckCollaborator[]> = {};
      collabs.forEach((c) => {
        const profile = profileMap.get(c.user_id);
        if (!result[c.presentation_id]) result[c.presentation_id] = [];
        if (profile) {
          result[c.presentation_id].push({
            user_id: profile.id,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
          });
        }
      });
      return result;
    },
  });
}
