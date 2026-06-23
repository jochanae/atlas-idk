import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface SavedBlock {
  id: string;
  user_id: string;
  name: string;
  block_type: string;
  content: Json;
  tags: string[];
  description: string | null;
  created_at: string;
}

export function useSavedBlocks() {
  return useQuery({
    queryKey: ["saved-blocks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_blocks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SavedBlock[];
    },
  });
}

export function useSaveBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; block_type: string; content: Json; tags?: string[]; description?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("saved_blocks")
        .insert({ ...input, user_id: user.id, tags: input.tags || [] })
        .select()
        .single();
      if (error) throw error;
      return data as SavedBlock;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-blocks"] }),
  });
}

export function useDeleteSavedBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saved_blocks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-blocks"] }),
  });
}
