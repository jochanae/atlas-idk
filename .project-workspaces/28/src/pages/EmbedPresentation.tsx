import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ScaledSlide from "@/components/editor/ScaledSlide";
import SlideRenderer from "@/components/editor/SlideRenderer";
import { parseTheme } from "@/lib/slideThemes";
import type { Slide } from "@/hooks/useSlides";
import type { Presentation } from "@/hooks/usePresentations";

export default function EmbedPresentation() {
  const { id } = useParams<{ id: string }>();
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: pres } = await supabase
        .from("presentations")
        .select("*")
        .eq("id", id)
        .eq("is_public", true)
        .single();
      if (!pres) { setLoading(false); return; }
      setPresentation(pres as Presentation);
      const { data: slidesData } = await supabase
        .from("slides")
        .select("*")
        .eq("presentation_id", id)
        .order("sort_order");
      setSlides((slidesData || []) as Slide[]);
      setLoading(false);
    })();
  }, [id]);

  const goNext = useCallback(() => setIndex((i) => Math.min(i + 1, slides.length - 1)), [slides.length]);
  const goPrev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [goNext, goPrev]);

  const theme = parseTheme(presentation?.theme);
  const currentSlide = slides[index];

  if (loading) return <div className="h-screen flex items-center justify-center bg-background"><p className="text-muted-foreground text-sm">Loading...</p></div>;
  if (!presentation) return <div className="h-screen flex items-center justify-center bg-background"><p className="text-muted-foreground text-sm">Not found</p></div>;

  return (
    <div className="h-screen flex flex-col bg-black relative group">
      <div className="flex-1 flex items-center justify-center">
        {currentSlide && (
          <div className="w-full h-full">
            <ScaledSlide>
              <SlideRenderer blockType={currentSlide.block_type} content={currentSlide.content} theme={theme} />
            </ScaledSlide>
          </div>
        )}
      </div>
      {/* Minimal navigation — appears on hover */}
      <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-center pb-2 gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={goPrev} disabled={index === 0} className="text-white/70 hover:text-white disabled:opacity-30 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-white/70 text-xs font-medium tabular-nums">{index + 1}/{slides.length}</span>
        <button onClick={goNext} disabled={index === slides.length - 1} className="text-white/70 hover:text-white disabled:opacity-30 transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
