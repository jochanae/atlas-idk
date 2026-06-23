import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface KnowledgeEntry {
  id: string;
  title: string;
  body: string;
  category: string;
  tags: string[] | null;
  sort_order: number | null;
  is_published: boolean | null;
  created_at: string;
  updated_at: string;
}

export function useKnowledgeBase(category?: string) {
  return useQuery({
    queryKey: ["knowledge-base", category],
    queryFn: async () => {
      let query = supabase
        .from("knowledge_base")
        .select("*")
        .order("sort_order", { ascending: true });
      if (category) query = query.eq("category", category);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as KnowledgeEntry[];
    },
  });
}
