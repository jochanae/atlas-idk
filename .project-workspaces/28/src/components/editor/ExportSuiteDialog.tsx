import { useState } from "react";
import { Download, FileText, Presentation, FileVideo, Package, Loader2, Rocket } from "lucide-react";
import CrossPromoCard from "@/components/shared/CrossPromoCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Slide } from "@/hooks/useSlides";
import type { SlideTheme } from "@/lib/slideThemes";

interface ExportSuiteDialogProps {
  slides: Slide[];
  title: string;
  theme?: SlideTheme;
  children: React.ReactNode;
}

type ExportFormat = "pdf" | "pdf-notes" | "pptx" | "scorm";

export default function ExportSuiteDialog({ slides, title, theme, children }: ExportSuiteDialogProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeBranding, setIncludeBranding] = useState(true);

  const formats = [
    { id: "pdf" as const, label: "Slides PDF", desc: "High-res slides, 1 per page", icon: FileText },
    { id: "pdf-notes" as const, label: "Speaker Notes PDF", desc: "Slides with speaker notes below", icon: FileText },
    { id: "pptx" as const, label: "PowerPoint", desc: "Editable .pptx with notes", icon: Presentation },
    { id: "scorm" as const, label: "SCORM Package", desc: "LMS-ready ZIP bundle", icon: Package, premium: true },
  ];

  const handleExport = async (format: ExportFormat) => {
    if (slides.length === 0) { toast.error("No slides to export"); return; }
    setExporting(format);

    try {
      if (format === "pdf" || format === "pdf-notes") {
        const { default: jsPDF } = await import("jspdf");
        const { default: html2canvas } = await import("html2canvas");
        const { createRoot } = await import("react-dom/client");
        const { default: SlideRenderer } = await import("@/components/editor/SlideRenderer");
        const React = await import("react");

        const isNotes = format === "pdf-notes";
        const pageH = isNotes ? 1500 : 1080;
        const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1920, pageH] });

        const container = document.createElement("div");
        container.style.cssText = "position:fixed;left:-9999px;top:0;width:1920px;overflow:hidden;";
        document.body.appendChild(container);

        for (let i = 0; i < slides.length; i++) {
          if (i > 0) pdf.addPage([1920, pageH], "landscape");

          const slideEl = document.createElement("div");
          slideEl.style.cssText = "width:1920px;height:1080px;";
          container.innerHTML = "";
          container.appendChild(slideEl);

          const root = createRoot(slideEl);
          root.render(React.createElement(SlideRenderer, {
            blockType: slides[i].block_type,
            content: slides[i].content,
            theme,
          }));

          await new Promise(r => setTimeout(r, 300));

          const canvas = await html2canvas(slideEl, {
            width: 1920, height: 1080, scale: 1, useCORS: true, allowTaint: true, backgroundColor: null,
          });

          pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 1920, 1080);
          root.unmount();

          // Add speaker notes below slide
          if (isNotes && slides[i].notes) {
            pdf.setFontSize(16);
            pdf.setTextColor(200, 200, 200);
            pdf.text(`Speaker Notes:`, 40, 1120);
            pdf.setFontSize(14);
            pdf.setTextColor(170, 170, 170);
            const noteLines = pdf.splitTextToSize(slides[i].notes || "", 1840);
            pdf.text(noteLines, 40, 1150);
          }

          if (includeBranding) {
            pdf.setFontSize(10);
            pdf.setTextColor(120, 120, 120);
            pdf.text(`${title} — Slide ${i + 1}/${slides.length}`, 40, pageH - 20);
          }
        }

        document.body.removeChild(container);
        pdf.save(`${title || "presentation"}${isNotes ? "-notes" : ""}.pdf`);
        toast.success(`${isNotes ? "Notes PDF" : "PDF"} exported!`);
      } else if (format === "pptx") {
        const PptxGenJS = (await import("pptxgenjs")).default;
        const pptx = new PptxGenJS();
        pptx.title = title || "Presentation";
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

          if (heading) {
            pptSlide.addText(heading, {
              x: 0.8, y: 0.5, w: "85%", fontSize: 32, fontFace: fontFamily, color: primaryColor, bold: true,
            });
          }
          if (subheading) {
            pptSlide.addText(subheading, {
              x: 0.8, y: 1.5, w: "85%", fontSize: 18, fontFace: fontFamily, color: "CCCCCC",
            });
          }
          if (bullets.length > 0) {
            pptSlide.addText(
              bullets.map(b => ({ text: b, options: { bullet: true, color: "EEEEEE" } })),
              { x: 0.8, y: heading ? 2.2 : 0.8, w: "85%", fontSize: 18, fontFace: fontFamily, color: "EEEEEE", lineSpacingMultiple: 1.5 }
            );
          }
          if (slide.notes) pptSlide.addNotes(slide.notes);
        }

        await pptx.writeFile({ fileName: `${title || "presentation"}.pptx` });
        toast.success("PowerPoint exported!");
      } else if (format === "scorm") {
        toast.info("SCORM export is a Pro feature — upgrade to unlock!");
      }
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Export failed");
    } finally {
      setExporting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            Export Suite
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {formats.map(fmt => (
            <button
              key={fmt.id}
              onClick={() => handleExport(fmt.id)}
              disabled={!!exporting}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-accent/50 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                {exporting === fmt.id ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <fmt.icon className="w-5 h-5 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{fmt.label}</span>
                  {fmt.premium && <Badge variant="secondary" className="text-[10px]">Pro</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{fmt.desc}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <Switch id="branding" checked={includeBranding} onCheckedChange={setIncludeBranding} />
            <Label htmlFor="branding" className="text-xs">Include branding</Label>
          </div>
        </div>

        <CrossPromoCard
          title="Turn this into a live funnel"
          description="IntoIQ builds a lead-capturing landing page from your presentation content in minutes"
          ctaText="Build My Funnel"
          ctaUrl="https://intoiq.app"
          icon={<Rocket className="w-4 h-4 text-primary" />}
          dismissKey="promo-intoiq-export"
        />
      </DialogContent>
    </Dialog>
  );
}
