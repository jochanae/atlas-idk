import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSchedulingLinks(presentationId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["scheduling-links", presentationId],
    queryFn: async () => {
      let q = supabase.from("scheduling_links" as any).select("*").order("created_at", { ascending: false });
      if (presentationId) q = q.eq("presentation_id", presentationId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const create = useMutation({
    mutationFn: async (values: { label: string; url: string; provider?: string; presentation_id?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("scheduling_links" as any).insert({ ...values, user_id: user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scheduling-links"] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...values }: { id: string; label?: string; url?: string; is_active?: boolean }) => {
      const { error } = await supabase.from("scheduling_links" as any).update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scheduling-links"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("scheduling_links" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scheduling-links"] }),
  });

  return { ...query, create, update, remove };
}
