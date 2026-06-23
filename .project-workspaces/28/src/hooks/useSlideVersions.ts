import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface SlideVersion {
  id: string;
  slide_id: string;
  presentation_id: string;
  user_id: string;
  block_type: string;
  content: Json;
  notes: string | null;
  version_number: number;
  created_at: string;
}

export function useSlideVersions(slideId: string | undefined) {
  return useQuery({
    queryKey: ["slide-versions", slideId],
    enabled: !!slideId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slide_versions")
        .select("*")
        .eq("slide_id", slideId!)
        .order("version_number", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as SlideVersion[];
    },
  });
}

export function useSaveVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      slide_id: string;
      presentation_id: string;
      block_type: string;
      content: Json;
      notes: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get next version number
      const { data: existing } = await supabase
        .from("slide_versions")
        .select("version_number")
        .eq("slide_id", input.slide_id)
        .order("version_number", { ascending: false })
        .limit(1);

      const nextVersion = (existing?.[0]?.version_number ?? 0) + 1;

      const { data, error } = await supabase
        .from("slide_versions")
        .insert({ ...input, user_id: user.id, version_number: nextVersion })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["slide-versions", vars.slide_id] });
    },
  });
}
