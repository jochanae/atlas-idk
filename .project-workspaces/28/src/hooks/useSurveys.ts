import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSurveys(presentationId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["surveys", presentationId],
    queryFn: async () => {
      let q = supabase.from("presentation_surveys" as any).select("*").order("created_at", { ascending: false });
      if (presentationId) q = q.eq("presentation_id", presentationId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const create = useMutation({
    mutationFn: async (values: { title: string; questions?: any[]; presentation_id?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("presentation_surveys" as any).insert({ ...values, user_id: user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["surveys"] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...values }: { id: string; title?: string; questions?: any[]; is_active?: boolean }) => {
      const { error } = await supabase.from("presentation_surveys" as any).update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["surveys"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("presentation_surveys" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["surveys"] }),
  });

  return { ...query, create, update, remove };
}

export function useSurveyResponses(surveyId?: string) {
  return useQuery({
    queryKey: ["survey-responses", surveyId],
    enabled: !!surveyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("survey_responses" as any).select("*").eq("survey_id", surveyId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}
