import { useState } from "react";
import { motion } from "framer-motion";
import { Layers, Play, MoreHorizontal, Trash2, Copy, FolderInput, Sparkles, Link2, Download, FileText, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import AvatarStack from "./AvatarStack";
import ScaledSlide from "@/components/editor/ScaledSlide";
import SlideRenderer from "@/components/editor/SlideRenderer";
import SlideDNA, { type SlideMetrics } from "@/components/SlideDNA";
import type { DeckCollaborator } from "@/hooks/useTeamPresentations";
import type { FirstSlideData } from "@/hooks/useFirstSlides";
import { parseTheme } from "@/lib/slideThemes";
import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

interface PresentationCardProps {
  pres: {
    id: string;
    title: string;
    updated_at: string;
    goal: string | null;
    folder?: string | null;
    theme?: Json | null;
  };
  index: number;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onRemix?: (id: string) => void;
  collaborators?: DeckCollaborator[];
  firstSlide?: FirstSlideData;
  slideMetrics?: SlideMetrics[];
}

const PresentationCard = ({ pres, index, onOpen, onDelete, onDuplicate, onRemix, collaborators = [], firstSlide, slideMetrics }: PresentationCardProps) => {
  const [downloading, setDownloading] = useState<"pdf" | "pptx" | null>(null);

  const fetchSlides = async () => {
    const { data, error } = await supabase
      .from("slides")
      .select("*")
      .eq("presentation_id", pres.id)
      .order("sort_order");
    if (error) throw error;
    return data || [];
  };

  const handleDownloadPdf = async () => {
    setDownloading("pdf");
    try {
      const slides = await fetchSlides();
      if (slides.length === 0) { toast.error("No slides to export"); return; }
      toast.info("Generating PDF...");

      const { default: jsPDF } = await import("jspdf");
      const { default: html2canvas } = await import("html2canvas");
      const { createRoot } = await import("react-dom/client");
      const { default: SlideRendererComp } = await import("@/components/editor/SlideRenderer");
      const React = await import("react");

      const theme = parseTheme(pres.theme);
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1920, 1080] });
      const container = document.createElement("div");
      container.style.cssText = "position:fixed;left:-9999px;top:0;width:1920px;height:1080px;overflow:hidden;";
      document.body.appendChild(container);

      for (let i = 0; i < slides.length; i++) {
        if (i > 0) pdf.addPage([1920, 1080], "landscape");
        const slideEl = document.createElement("div");
        slideEl.style.cssText = "width:1920px;height:1080px;";
        container.innerHTML = "";
        container.appendChild(slideEl);
        const root = createRoot(slideEl);
        root.render(React.createElement(SlideRendererComp, { blockType: slides[i].block_type, content: slides[i].content, theme }));
        await new Promise(r => setTimeout(r, 300));
        const canvas = await html2canvas(slideEl, { width: 1920, height: 1080, scale: 1, useCORS: true, allowTaint: true, backgroundColor: null });
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 1920, 1080);
        root.unmount();
      }

      document.body.removeChild(container);
      pdf.save(`${pres.title || "presentation"}.pdf`);
      toast.success("PDF exported!");
    } catch (err) {
      console.error("PDF export error:", err);
      toast.error("Failed to export PDF");
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadPptx = async () => {
    setDownloading("pptx");
    try {
      const slides = await fetchSlides();
      if (slides.length === 0) { toast.error("No slides to export"); return; }
      toast.info("Generating PowerPoint...");

      const PptxGenJS = (await import("pptxgenjs")).default;
      const theme = parseTheme(pres.theme);
      const pptx = new PptxGenJS();
      pptx.title = pres.title || "Presentation";
      pptx.layout = "LAYOUT_WIDE";

      const bgColor = theme?.background?.replace("#", "") || "0A0A0A";
      const primaryColor = theme?.primary?.replace("#", "") || "D4AF37";
      const fontFamily = theme?.headingFont || "Inter";

      for (const slide of slides) {
        const pptSlide = pptx.addSlide();
        pptSlide.background = { color: bgColor };
        const content = (typeof slide.content === "object" && slide.content !== null && !Array.isArray(slide.content))
          ? slide.content as Record<string, unknown> : {};
        const heading = (content.heading as string) || "";
        const subheading = (content.subheading as string) || "";
        const bullets = Array.isArray(content.bullets) ? content.bullets as string[] : [];

        if (heading) pptSlide.addText(heading, { x: 0.8, y: 0.5, w: "85%", fontSize: 32, fontFace: fontFamily, color: primaryColor, bold: true });
        if (subheading) pptSlide.addText(subheading, { x: 0.8, y: 1.5, w: "85%", fontSize: 18, fontFace: fontFamily, color: "CCCCCC" });
        if (bullets.length > 0) pptSlide.addText(bullets.map(b => ({ text: b, options: { bullet: true, color: "EEEEEE" } })), { x: 0.8, y: heading ? 2.2 : 0.8, w: "85%", fontSize: 18, fontFace: fontFamily, color: "EEEEEE", lineSpacingMultiple: 1.5 });
        if (slide.notes) pptSlide.addNotes(slide.notes);
      }

      await pptx.writeFile({ fileName: `${pres.title || "presentation"}.pptx` });
      toast.success("PowerPoint exported!");
    } catch (err) {
      console.error("PPTX export error:", err);
      toast.error("Failed to export PowerPoint");
    } finally {
      setDownloading(null);
    }
  };

  return (
  <motion.div
    initial={{ opacity: 0, y: 16, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ delay: index * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
  >
    <Card
      className="group relative bg-card border-border/60 hover:border-primary/40 transition-all duration-300 cursor-pointer hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 overflow-hidden rounded-xl"
      onClick={() => onOpen(pres.id)}
    >
      {/* Thumbnail with gradient overlay */}
      <div className="relative w-full aspect-[16/10] bg-secondary/30 overflow-hidden">
        {firstSlide ? (
          <ScaledSlide>
            <SlideRenderer blockType={firstSlide.block_type} content={firstSlide.content} theme={parseTheme(pres.theme)} />
          </ScaledSlide>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary/60 to-secondary/20">
            <Layers className="w-8 h-8 text-muted-foreground/15" />
          </div>
        )}
        {/* Bottom fade for text readability */}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card/80 to-transparent pointer-events-none" />
        
        {/* Hover play overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-300 shadow-lg">
            <Play className="w-4 h-4 text-primary-foreground ml-0.5" />
          </div>
        </div>

        {/* Goal badge floating */}
        {pres.goal && (
          <span className="absolute top-2 left-2 inline-flex items-center px-2 py-0.5 rounded-md bg-card/80 backdrop-blur-sm text-[10px] font-medium text-foreground/80 border border-border/40">
            {pres.goal}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-1.5">
          <h3 className="font-display font-semibold text-sm truncate flex-1 min-w-0 leading-snug">{pres.title}</h3>
          <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            {onRemix && (
              <Button variant="ghost" size="sm" className="h-6 px-1.5 gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onRemix(pres.id)} title="Remix">
                <Sparkles className="w-3 h-3 text-primary" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  const url = `${window.location.origin}/view/${pres.id}`;
                  navigator.clipboard.writeText(url);
                  toast.success("Link copied!");
                }}>
                  <Link2 className="w-3.5 h-3.5 mr-2" /> Copy Link
                </DropdownMenuItem>
                {onDuplicate && (
                  <DropdownMenuItem onClick={() => onDuplicate(pres.id)}>
                    <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate
                  </DropdownMenuItem>
                )}
                {onRemix && (
                  <DropdownMenuItem onClick={() => onRemix(pres.id)}>
                    <Sparkles className="w-3.5 h-3.5 mr-2" /> Remix
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    {downloading ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-2" />} Download
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={handleDownloadPdf} disabled={!!downloading}>
                      <FileText className="w-3.5 h-3.5 mr-2" /> PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownloadPptx} disabled={!!downloading}>
                      <FileDown className="w-3.5 h-3.5 mr-2" /> PowerPoint
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDelete(pres.id)} className="text-destructive">
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Trash
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[10px] text-muted-foreground/70">
            {formatDistanceToNow(new Date(pres.updated_at), { addSuffix: true })}
          </span>
          {pres.folder && (
            <>
              <span className="text-muted-foreground/20">·</span>
              <span className="inline-flex items-center gap-0.5 text-[10px] text-primary/70 truncate">
                <FolderInput className="w-2.5 h-2.5" /> {pres.folder}
              </span>
            </>
          )}
          {collaborators.length > 0 && (
            <div className="ml-auto"><AvatarStack collaborators={collaborators} /></div>
          )}
        </div>

        {slideMetrics && slideMetrics.length > 1 && (
          <div className="mt-1.5 -mx-1">
            <SlideDNA metrics={slideMetrics} size="sm" animated={false} />
          </div>
        )}
      </div>
    </Card>
  </motion.div>
  );
};

export default PresentationCard;
