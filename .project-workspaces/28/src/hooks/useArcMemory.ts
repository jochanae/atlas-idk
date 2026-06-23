import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ArcMemory {
  id: string;
  user_id: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}

export function useArcMemories() {
  return useQuery({
    queryKey: ["arc-memories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("arc_memories")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as ArcMemory[];
    },
  });
}

export function useArcMemoriesMap() {
  const { data } = useArcMemories();
  if (!data) return {};
  return Object.fromEntries(data.map((m) => [m.key, m.value]));
}

export function useSaveArcMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Upsert - try update first, then insert
      const { data: existing } = await supabase
        .from("arc_memories")
        .select("id")
        .eq("user_id", user.id)
        .eq("key", key)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("arc_memories")
          .update({ value })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("arc_memories")
          .insert({ user_id: user.id, key, value });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arc-memories"] });
    },
  });
}
