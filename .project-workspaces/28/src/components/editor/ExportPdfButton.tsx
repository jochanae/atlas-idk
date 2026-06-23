import React, { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Slide } from "@/hooks/useSlides";
import type { SlideTheme } from "@/lib/slideThemes";

interface ExportPdfButtonProps {
  slides: Slide[];
  title: string;
  theme?: SlideTheme;
}

export default function ExportPdfButton({ slides, title, theme }: ExportPdfButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (slides.length === 0) { toast.error("No slides to export"); return; }
    setExporting(true);
    toast.info("Generating PDF... this may take a moment.");

    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: html2canvas } = await import("html2canvas");

      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1920, 1080] });

      // We need to render each slide off-screen and capture it
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.style.width = "1920px";
      container.style.height = "1080px";
      container.style.overflow = "hidden";
      document.body.appendChild(container);

      // Import the render functions dynamically
      const { createRoot } = await import("react-dom/client");
      const { default: SlideRenderer } = await import("@/components/editor/SlideRenderer");
      // React is already imported statically above

      for (let i = 0; i < slides.length; i++) {
        if (i > 0) pdf.addPage([1920, 1080], "landscape");

        // Render slide into container
        const slideEl = document.createElement("div");
        slideEl.style.width = "1920px";
        slideEl.style.height = "1080px";
        container.innerHTML = "";
        container.appendChild(slideEl);

        const root = createRoot(slideEl);
        root.render(
          React.createElement(SlideRenderer, {
            blockType: slides[i].block_type,
            content: slides[i].content,
            theme,
          })
        );

        // Wait for render
        await new Promise((r) => setTimeout(r, 300));

        const canvas = await html2canvas(slideEl, {
          width: 1920,
          height: 1080,
          scale: 1,
          useCORS: true,
          allowTaint: true,
          backgroundColor: null,
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.92);
        pdf.addImage(imgData, "JPEG", 0, 0, 1920, 1080);
        root.unmount();
      }

      document.body.removeChild(container);
      pdf.save(`${title || "presentation"}.pdf`);
      toast.success("PDF exported!");
    } catch (err) {
      console.error("PDF export error:", err);
      toast.error("Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={handleExport} disabled={exporting}>
      {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      <span className="text-xs">PDF</span>
    </Button>
  );
}
