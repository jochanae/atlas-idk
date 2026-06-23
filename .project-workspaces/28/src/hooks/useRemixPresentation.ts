import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Presentation } from "@/hooks/usePresentations";
import type { BrandKit } from "@/hooks/useBrandKits";
import type { Json } from "@/integrations/supabase/types";

export function useRemixPresentation() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ sourceId, brandKitId }: { sourceId: string; brandKitId: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get source presentation
      const { data: source, error: srcErr } = await supabase
        .from("presentations")
        .select("*")
        .eq("id", sourceId)
        .single();
      if (srcErr) throw srcErr;

      // Get brand kit if selected
      let brandKit: BrandKit | null = null;
      if (brandKitId) {
        const { data, error } = await supabase
          .from("brand_kits")
          .select("*")
          .eq("id", brandKitId)
          .single();
        if (error) throw error;
        brandKit = data as BrandKit;
      }

      // Build new theme from brand kit
      const newTheme: Json = brandKit
        ? {
            font: brandKit.heading_font,
            bodyFont: brandKit.body_font,
            primary: brandKit.primary_color,
            background: brandKit.secondary_color,
            accent: brandKit.accent_color,
          }
        : source.theme ?? { font: "Inter", primary: "#D4AF37", background: "#0A0A0A" };

      // Create remixed copy
      const { data: copy, error: copyErr } = await supabase
        .from("presentations")
        .insert({
          user_id: user.id,
          title: `${source.title} (Remix)`,
          description: source.description,
          goal: source.goal,
          theme: newTheme,
          folder: source.folder,
        })
        .select()
        .single();
      if (copyErr) throw copyErr;

      // Copy slides
      const { data: slides } = await supabase
        .from("slides")
        .select("*")
        .eq("presentation_id", sourceId)
        .order("sort_order");

      if (slides?.length) {
        const newSlides = slides.map((s) => ({
          presentation_id: copy.id,
          user_id: user.id,
          block_type: s.block_type,
          content: s.content,
          notes: s.notes,
          sort_order: s.sort_order,
        }));
        await supabase.from("slides").insert(newSlides);
      }

      return copy as Presentation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["presentations"] });
      toast({ title: "Remixed!", description: "A new deck has been created with your brand style." });
    },
    onError: (err) => {
      toast({ title: "Remix failed", description: err.message, variant: "destructive" });
    },
  });
}
