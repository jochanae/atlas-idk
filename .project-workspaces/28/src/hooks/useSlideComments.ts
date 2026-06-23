import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SlideComment {
  id: string;
  slide_id: string;
  presentation_id: string;
  user_id: string;
  body: string;
  resolved: boolean;
  created_at: string;
  updated_at: string;
}

export function useSlideComments(slideId: string | undefined) {
  return useQuery({
    queryKey: ["slide-comments", slideId],
    enabled: !!slideId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slide_comments")
        .select("*")
        .eq("slide_id", slideId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as SlideComment[];
    },
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { slide_id: string; presentation_id: string; body: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("slide_comments")
        .insert({ ...input, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["slide-comments", vars.slide_id] });
    },
  });
}

export function useResolveComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, slideId, resolved }: { id: string; slideId: string; resolved: boolean }) => {
      const { error } = await supabase
        .from("slide_comments")
        .update({ resolved })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["slide-comments", vars.slideId] });
    },
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, slideId }: { id: string; slideId: string }) => {
      const { error } = await supabase.from("slide_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["slide-comments", vars.slideId] });
    },
  });
}
