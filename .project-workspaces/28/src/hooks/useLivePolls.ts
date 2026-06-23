import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface LivePoll {
  id: string;
  presentation_id: string;
  user_id: string;
  question: string;
  poll_type: string;
  options: string[];
  is_active: boolean;
  show_results: boolean;
  sort_order: number;
  created_at: string;
}

export interface PollVote {
  id: string;
  poll_id: string;
  option_index: number;
  voter_session: string;
  created_at: string;
}

export function usePolls(presentationId: string | undefined) {
  const qc = useQueryClient();

  // Subscribe to realtime changes
  useEffect(() => {
    if (!presentationId) return;
    const channel = supabase
      .channel(`polls-${presentationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_polls", filter: `presentation_id=eq.${presentationId}` }, () => {
        qc.invalidateQueries({ queryKey: ["live-polls", presentationId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [presentationId, qc]);

  return useQuery({
    queryKey: ["live-polls", presentationId],
    enabled: !!presentationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_polls")
        .select("*")
        .eq("presentation_id", presentationId!)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as LivePoll[];
    },
  });
}

export function usePollVotes(pollId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!pollId) return;
    const channel = supabase
      .channel(`votes-${pollId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "poll_votes", filter: `poll_id=eq.${pollId}` }, () => {
        qc.invalidateQueries({ queryKey: ["poll-votes", pollId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [pollId, qc]);

  return useQuery({
    queryKey: ["poll-votes", pollId],
    enabled: !!pollId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("poll_votes")
        .select("*")
        .eq("poll_id", pollId!);
      if (error) throw error;
      return (data || []) as unknown as PollVote[];
    },
  });
}

export function useCreatePoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { presentation_id: string; question: string; options: string[]; poll_type?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("live_polls").insert({
        presentation_id: input.presentation_id,
        user_id: user.id,
        question: input.question,
        options: input.options as any,
        poll_type: input.poll_type || "multiple_choice",
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["live-polls", data.presentation_id] });
    },
  });
}

export function useTogglePoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active, show_results, presentationId }: { id: string; is_active?: boolean; show_results?: boolean; presentationId: string }) => {
      const updates: any = {};
      if (is_active !== undefined) updates.is_active = is_active;
      if (show_results !== undefined) updates.show_results = show_results;
      const { error } = await supabase.from("live_polls").update(updates).eq("id", id);
      if (error) throw error;
      return presentationId;
    },
    onSuccess: (presId) => {
      qc.invalidateQueries({ queryKey: ["live-polls", presId] });
    },
  });
}

export function useDeletePoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, presentationId }: { id: string; presentationId: string }) => {
      const { error } = await supabase.from("live_polls").delete().eq("id", id);
      if (error) throw error;
      return presentationId;
    },
    onSuccess: (presId) => {
      qc.invalidateQueries({ queryKey: ["live-polls", presId] });
    },
  });
}

export function useCastVote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ poll_id, option_index, voter_session }: { poll_id: string; option_index: number; voter_session: string }) => {
      const { error } = await supabase.from("poll_votes").insert({ poll_id, option_index, voter_session });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["poll-votes", vars.poll_id] });
    },
  });
}
