import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, FileDown, BarChart3, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import ScaledSlide from "@/components/editor/ScaledSlide";
import SlideRenderer from "@/components/editor/SlideRenderer";
import { parseTheme } from "@/lib/slideThemes";
import type { Slide } from "@/hooks/useSlides";
import type { Presentation } from "@/hooks/usePresentations";

function getViewerSession(): string {
  let session = sessionStorage.getItem("viewer_session");
  if (!session) {
    session = crypto.randomUUID();
    sessionStorage.setItem("viewer_session", session);
  }
  return session;
}

export default function SharedPresentation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasResources, setHasResources] = useState(false);
  const slideEnteredAt = useRef(Date.now());
  const viewerSession = useRef(getViewerSession());

  useEffect(() => {
    if (!id) return;
    (async () => {
      // Try public first (works for anonymous viewers)
      let { data: pres } = await supabase
        .from("presentations")
        .select("*")
        .eq("id", id)
        .eq("is_public", true)
        .is("deleted_at", null)
        .maybeSingle();

      // If not public, check if current user is owner or collaborator
      if (!pres) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // RLS will allow if owner
          const { data: ownPres } = await supabase
            .from("presentations")
            .select("*")
            .eq("id", id)
            .is("deleted_at", null)
            .maybeSingle();
          pres = ownPres;
        }
      }

      if (!pres) {
        setError("This presentation doesn't exist or hasn't been shared publicly yet. Ask the owner to enable public access.");
        setLoading(false);
        return;
      }
      setPresentation(pres as Presentation);

      const { data: slidesData } = await supabase
        .from("slides")
        .select("*")
        .eq("presentation_id", id)
        .order("sort_order");
      setSlides((slidesData || []) as Slide[]);

      // Check if there are public resources
      const { data: resData } = await supabase
        .from("audience_resources" as any)
        .select("id")
        .eq("presentation_id", id)
        .eq("is_public", true)
        .limit(1);
      setHasResources((resData || []).length > 0);

      setLoading(false);
    })();
  }, [id]);

  // Record view time when changing slides
  const recordView = useCallback(() => {
    if (!id) return;
    const timeSpent = Math.round((Date.now() - slideEnteredAt.current) / 1000);
    if (timeSpent < 1) return;
    supabase.from("presentation_views").insert({
      presentation_id: id,
      slide_index: index,
      time_spent_seconds: timeSpent,
      viewer_session: viewerSession.current,
    }).then(() => {});
    slideEnteredAt.current = Date.now();
  }, [id, index]);

  const goNext = useCallback(() => {
    recordView();
    setIndex((i) => Math.min(i + 1, slides.length - 1));
  }, [slides.length, recordView]);

  const goPrev = useCallback(() => {
    recordView();
    setIndex((i) => Math.max(i - 1, 0));
  }, [recordView]);

  // Record on unmount
  useEffect(() => {
    return () => { recordView(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Loading presentation...</p>
    </div>
  );

  if (error) return (
    <div className="h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">{error}</p>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-black">
      <div className="flex-1 flex items-center justify-center">
        {currentSlide && (
          <div className="w-full h-full">
            <ScaledSlide>
              <SlideRenderer blockType={currentSlide.block_type} content={currentSlide.content} theme={theme} />
            </ScaledSlide>
          </div>
        )}
      </div>
      <div className="h-12 bg-card/80 backdrop-blur flex items-center justify-center gap-4 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goPrev} disabled={index === 0}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-display font-semibold tabular-nums text-foreground">{index + 1} / {slides.length}</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goNext} disabled={index === slides.length - 1}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        {hasResources && (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 ml-2" onClick={() => navigate(`/view/${id}/resources`)}>
            <FileDown className="w-3.5 h-3.5" /> Resources
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-8 gap-1.5 ml-2" onClick={() => navigate(`/view/${id}/interact`)}>
          <BarChart3 className="w-3.5 h-3.5" /> Interact
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => {
          const url = `${window.location.origin}/view/${id}/analytics`;
          navigator.clipboard.writeText(url);
          window.open(`/view/${id}/analytics`, "_blank");
        }}>
          <Share2 className="w-3.5 h-3.5" /> Analytics
        </Button>
      </div>
    </div>
  );
}
