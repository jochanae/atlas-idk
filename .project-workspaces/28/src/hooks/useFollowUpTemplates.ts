import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useFollowUpTemplates(presentationId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["follow-up-templates", presentationId],
    queryFn: async () => {
      let q = supabase.from("follow_up_templates" as any).select("*").order("created_at", { ascending: false });
      if (presentationId) q = q.eq("presentation_id", presentationId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const create = useMutation({
    mutationFn: async (values: { name: string; subject: string; body: string; template_type?: string; presentation_id?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("follow_up_templates" as any).insert({ ...values, user_id: user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["follow-up-templates"] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...values }: { id: string; name?: string; subject?: string; body?: string }) => {
      const { error } = await supabase.from("follow_up_templates" as any).update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["follow-up-templates"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("follow_up_templates" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["follow-up-templates"] }),
  });

  return { ...query, create, update, remove };
}
