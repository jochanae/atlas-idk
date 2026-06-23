import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface SlideTemplate {
  id: string;
  name: string;
  block_type: string;
  category: string;
  content: Json;
  is_premium: boolean;
  preview_url: string | null;
  created_at: string;
}

export function useSlideTemplates() {
  return useQuery({
    queryKey: ["slide-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slide_templates")
        .select("*")
        .order("category", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as SlideTemplate[];
    },
  });
}
