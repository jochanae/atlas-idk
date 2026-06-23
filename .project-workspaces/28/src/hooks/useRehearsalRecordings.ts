import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRehearsalRecordings(presentationId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["rehearsal-recordings", presentationId],
    queryFn: async () => {
      let q = supabase.from("rehearsal_recordings" as any).select("*").order("created_at", { ascending: false });
      if (presentationId) q = q.eq("presentation_id", presentationId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const create = useMutation({
    mutationFn: async (values: {
      title?: string;
      presentation_id?: string;
      duration_seconds?: number;
      audio_url?: string;
      wpm_average?: number;
      filler_word_count?: number;
      slide_timings?: any[];
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("rehearsal_recordings" as any).insert({ ...values, user_id: user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rehearsal-recordings"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rehearsal_recordings" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rehearsal-recordings"] }),
  });

  return { ...query, create, remove };
}
