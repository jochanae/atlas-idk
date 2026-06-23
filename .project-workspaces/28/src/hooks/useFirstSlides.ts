import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface FirstSlideData {
  id: string;
  block_type: string;
  content: Json;
}

/** Fetch the first slide for each presentation in a batch */
export function useFirstSlides(presentationIds: string[]) {
  return useQuery({
    queryKey: ["first-slides", presentationIds],
    enabled: presentationIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slides")
        .select("id, presentation_id, block_type, content, sort_order")
        .in("presentation_id", presentationIds)
        .order("sort_order", { ascending: true });

      if (error) throw error;

      // Keep only the first slide per presentation
      const map: Record<string, FirstSlideData> = {};
      for (const row of data || []) {
        if (!map[row.presentation_id]) {
          map[row.presentation_id] = {
            id: row.id,
            block_type: row.block_type,
            content: row.content,
          };
        }
      }
      return map;
    },
    staleTime: 60_000,
  });
}
