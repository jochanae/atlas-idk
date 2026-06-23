import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Slide } from "@/hooks/useSlides";

export interface SlideTag {
  id: string;
  slide_id: string;
  presentation_id: string;
  tag: string;
  confidence: number;
  source: string;
  created_at: string;
}

export function useSlideTags(presentationId: string | undefined) {
  return useQuery({
    queryKey: ["slide-tags", presentationId],
    enabled: !!presentationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slide_tags")
        .select("*")
        .eq("presentation_id", presentationId!);
      if (error) throw error;
      return (data || []) as SlideTag[];
    },
  });
}

export function useAutoTagSlides() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ presentationId, slides }: { presentationId: string; slides: Slide[] }) => {
      const { data, error } = await supabase.functions.invoke("auto-tag-slides", {
        body: { slides: slides.map(s => ({ block_type: s.block_type, content: s.content })) },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Save tags to database
      const tags = data.tags || [];
      const rows: any[] = [];

      for (const slideTag of tags) {
        const slide = slides[slideTag.slide_index];
        if (!slide) continue;
        for (const tag of slideTag.tags) {
          rows.push({
            slide_id: slide.id,
            presentation_id: presentationId,
            tag,
            source: "ai",
            confidence: 0.9,
          });
        }
      }

      if (rows.length > 0) {
        // Clear old AI tags first
        await supabase.from("slide_tags").delete()
          .eq("presentation_id", presentationId)
          .eq("source", "ai");

        await supabase.from("slide_tags").insert(rows);
      }

      return rows.length;
    },
    onSuccess: (count, { presentationId }) => {
      queryClient.invalidateQueries({ queryKey: ["slide-tags", presentationId] });
      toast.success(`Tagged ${count} slide attributes`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to auto-tag slides");
    },
  });
}

/** Search across all presentations by tag */
export function useSearchByTag(tag: string) {
  return useQuery({
    queryKey: ["search-by-tag", tag],
    enabled: tag.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("slide_tags")
        .select("*, slides(id, block_type, content, presentation_id), presentations(title)")
        .ilike("tag", `%${tag}%`)
        .limit(20);
      return data || [];
    },
  });
}
