import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useApprovedImages(teamId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["approved-images", teamId],
    queryFn: async () => {
      let q = supabase.from("approved_images" as any).select("*").order("created_at", { ascending: false });
      if (teamId) q = q.eq("team_id", teamId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const create = useMutation({
    mutationFn: async (values: { name: string; file_url: string; category?: string; tags?: string[]; team_id?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("approved_images" as any).insert({ ...values, user_id: user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["approved-images"] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...values }: { id: string; name?: string; category?: string; tags?: string[]; is_approved?: boolean }) => {
      const { error } = await supabase.from("approved_images" as any).update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["approved-images"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("approved_images" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["approved-images"] }),
  });

  return { ...query, create, update, remove };
}
