import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useLowerThirds(presentationId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["lower-thirds", presentationId],
    queryFn: async () => {
      let q = supabase.from("lower_thirds" as any).select("*").order("sort_order");
      if (presentationId) q = q.eq("presentation_id", presentationId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const create = useMutation({
    mutationFn: async (values: { name: string; label: string; subtitle?: string; style?: any; presentation_id?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("lower_thirds" as any).insert({ ...values, user_id: user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lower-thirds"] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...values }: { id: string; name?: string; label?: string; subtitle?: string; style?: any; is_active?: boolean }) => {
      const { error } = await supabase.from("lower_thirds" as any).update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lower-thirds"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lower_thirds" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lower-thirds"] }),
  });

  return { ...query, create, update, remove };
}
