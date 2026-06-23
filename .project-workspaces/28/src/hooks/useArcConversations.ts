import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Message, ArcMode } from "@/components/arc/ArcProvider";

export interface ArcConversation {
  id: string;
  user_id: string;
  title: string;
  messages: Message[];
  mode: ArcMode;
  created_at: string;
  updated_at: string;
}

export function useArcConversations() {
  return useQuery({
    queryKey: ["arc-conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("arc_conversations")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ArcConversation[];
    },
  });
}

export function useSaveArcConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      title,
      messages,
      mode,
    }: {
      id?: string;
      title: string;
      messages: Message[];
      mode: ArcMode;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (id) {
        const { data, error } = await supabase
          .from("arc_conversations")
          .update({ title, messages: JSON.parse(JSON.stringify(messages)), mode })
          .eq("id", id)
          .eq("user_id", user.id)
          .select()
          .single();
        if (error) throw error;
        return data as ArcConversation;
      } else {
        const { data, error } = await supabase
          .from("arc_conversations")
          .insert({ user_id: user.id, title, messages: JSON.parse(JSON.stringify(messages)), mode })
          .select()
          .single();
        if (error) throw error;
        return data as ArcConversation;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arc-conversations"] });
    },
  });
}

export function useDeleteArcConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("arc_conversations")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arc-conversations"] });
    },
  });
}

export function useDeleteAllArcConversations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("arc_conversations")
        .delete()
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arc-conversations"] });
    },
  });
}
