import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Slide } from "@/hooks/useSlides";
import type { SlideTheme } from "@/lib/slideThemes";

interface ExportPptxButtonProps {
  slides: Slide[];
  title: string;
  theme?: SlideTheme;
}

export default function ExportPptxButton({ slides, title, theme }: ExportPptxButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (slides.length === 0) { toast.error("No slides to export"); return; }
    setExporting(true);
    toast.info("Generating PowerPoint...");

    try {
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
        const quote = (content.quote as string) || "";
        const imageUrl = (content.imageUrl as string) || "";

        // Add heading
        if (heading) {
          pptSlide.addText(heading, {
            x: 0.8, y: slide.block_type === "title" ? 2.5 : 0.5,
            w: "85%",
            fontSize: slide.block_type === "title" ? 44 : 32,
            fontFace: fontFamily,
            color: primaryColor,
            bold: true,
            align: slide.block_type === "title" ? "center" : "left",
          });
        }

        // Add subheading
        if (subheading) {
          pptSlide.addText(subheading, {
            x: 0.8, y: slide.block_type === "title" ? 4.0 : 1.5,
            w: "85%",
            fontSize: 18,
            fontFace: fontFamily,
            color: "CCCCCC",
            align: slide.block_type === "title" ? "center" : "left",
          });
        }

        // Add bullets
        if (bullets.length > 0) {
          pptSlide.addText(
            bullets.map(b => ({ text: b, options: { bullet: true, color: "EEEEEE" } })),
            {
              x: 0.8, y: heading ? 2.2 : 0.8,
              w: imageUrl ? "50%" : "85%",
              fontSize: 18,
              fontFace: fontFamily,
              color: "EEEEEE",
              lineSpacingMultiple: 1.5,
            }
          );
        }

        // Add quote
        if (quote) {
          pptSlide.addText(`"${quote}"`, {
            x: 1.5, y: 2.0, w: "75%",
            fontSize: 28,
            fontFace: fontFamily,
            color: primaryColor,
            italic: true,
            align: "center",
          });
          const author = (content.author as string);
          if (author) {
            pptSlide.addText(`— ${author}`, {
              x: 1.5, y: 4.0, w: "75%",
              fontSize: 16, fontFace: fontFamily, color: "999999", align: "center",
            });
          }
        }

        // Add image
        if (imageUrl) {
          try {
            pptSlide.addImage({
              path: imageUrl,
              x: bullets.length > 0 ? 7.0 : 2.5,
              y: 1.5,
              w: bullets.length > 0 ? 5.0 : 8.0,
              h: bullets.length > 0 ? 4.0 : 4.5,
            });
          } catch { /* skip image if it fails */ }
        }

        // Add speaker notes
        if (slide.notes) {
          pptSlide.addNotes(slide.notes);
        }
      }

      await pptx.writeFile({ fileName: `${title || "presentation"}.pptx` });
      toast.success("PowerPoint exported!");
    } catch (err) {
      console.error("PPTX export error:", err);
      toast.error("Failed to export PowerPoint");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={handleExport} disabled={exporting}>
      {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
      <span className="text-xs">PPTX</span>
    </Button>
  );
}
