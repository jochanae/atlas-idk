import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCoachingReports(presentationId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["coaching-reports", presentationId],
    queryFn: async () => {
      let q = supabase.from("coaching_reports" as any).select("*").order("created_at", { ascending: false });
      if (presentationId) q = q.eq("presentation_id", presentationId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const create = useMutation({
    mutationFn: async (values: {
      presentation_id?: string;
      rehearsal_id?: string;
      summary: string;
      strengths?: string[];
      improvements?: string[];
      pacing_analysis?: any;
      overall_score?: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("coaching_reports" as any).insert({ ...values, user_id: user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coaching-reports"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coaching_reports" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coaching-reports"] }),
  });

  return { ...query, create, remove };
}
