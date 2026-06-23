import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface LiveQuestion {
  id: string;
  presentation_id: string;
  author_name: string;
  body: string;
  is_answered: boolean;
  is_pinned: boolean;
  upvotes: number;
  created_at: string;
}

export function useLiveQuestions(presentationId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!presentationId) return;
    const channel = supabase
      .channel(`questions-${presentationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_questions", filter: `presentation_id=eq.${presentationId}` }, () => {
        qc.invalidateQueries({ queryKey: ["live-questions", presentationId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [presentationId, qc]);

  return useQuery({
    queryKey: ["live-questions", presentationId],
    enabled: !!presentationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_questions")
        .select("*")
        .eq("presentation_id", presentationId!)
        .order("is_pinned", { ascending: false })
        .order("upvotes", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as LiveQuestion[];
    },
  });
}

export function useSubmitQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { presentation_id: string; body: string; author_name?: string }) => {
      const { error } = await supabase.from("live_questions").insert({
        presentation_id: input.presentation_id,
        body: input.body,
        author_name: input.author_name || "Anonymous",
      });
      if (error) throw error;
      return input.presentation_id;
    },
    onSuccess: (presId) => {
      qc.invalidateQueries({ queryKey: ["live-questions", presId] });
    },
  });
}

export function useManageQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, presentationId, ...updates }: { id: string; presentationId: string; is_answered?: boolean; is_pinned?: boolean }) => {
      const { error } = await supabase.from("live_questions").update(updates).eq("id", id);
      if (error) throw error;
      return presentationId;
    },
    onSuccess: (presId) => {
      qc.invalidateQueries({ queryKey: ["live-questions", presId] });
    },
  });
}

export function useDeleteQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, presentationId }: { id: string; presentationId: string }) => {
      const { error } = await supabase.from("live_questions").delete().eq("id", id);
      if (error) throw error;
      return presentationId;
    },
    onSuccess: (presId) => {
      qc.invalidateQueries({ queryKey: ["live-questions", presId] });
    },
  });
}
