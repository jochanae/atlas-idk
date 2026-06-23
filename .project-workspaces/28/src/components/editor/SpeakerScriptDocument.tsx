import { useState } from "react";
import { FileText, Printer, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Slide } from "@/hooks/useSlides";
import { toast } from "sonner";

function extractSlideData(slide: Slide, index: number) {
  const content =
    typeof slide.content === "object" && slide.content !== null && !Array.isArray(slide.content)
      ? (slide.content as Record<string, unknown>)
      : {};
  return {
    number: index + 1,
    heading: (content.heading as string) || `Slide ${index + 1}`,
    script: (content.speaker_script as string) || "",
    notes: slide.notes || "",
    blockType: slide.block_type,
  };
}

function buildFullScript(slides: Slide[], title: string): string {
  const lines: string[] = [];
  lines.push(`SPEAKER SCRIPT — ${title}`);
  lines.push(`${"═".repeat(50)}`);
  lines.push("");

  slides.forEach((slide, i) => {
    const data = extractSlideData(slide, i);
    lines.push(`SLIDE ${data.number}: ${data.heading}`);
    lines.push(`${"─".repeat(40)}`);
    if (data.script) {
      lines.push(data.script);
    } else if (data.notes) {
      lines.push(`[Notes] ${data.notes}`);
    } else {
      lines.push("[No script written for this slide]");
    }
    lines.push("");
    lines.push("");
  });

  return lines.join("\n");
}

interface SpeakerScriptDocumentProps {
  slides: Slide[];
  title: string;
}

export default function SpeakerScriptDocument({ slides, title }: SpeakerScriptDocumentProps) {
  const [open, setOpen] = useState(false);
  const fullScript = buildFullScript(slides, title);
  const slideData = slides.map((s, i) => extractSlideData(s, i));
  const hasAnyScript = slideData.some((d) => d.script || d.notes);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullScript);
    toast.success("Full script copied to clipboard");
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Speaker Script — ${title}</title>
<style>
  @media print { @page { margin: 1in 0.75in; } }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; line-height: 1.7; padding: 40px; max-width: 800px; margin: 0 auto; }
  .doc-title { font-size: 22px; font-weight: bold; margin-bottom: 4px; }
  .doc-subtitle { font-size: 13px; color: #666; margin-bottom: 32px; border-bottom: 2px solid #333; padding-bottom: 12px; }
  .slide-block { margin-bottom: 28px; page-break-inside: avoid; }
  .slide-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
  .slide-number { font-size: 11px; font-weight: bold; color: #fff; background: #333; padding: 2px 8px; border-radius: 4px; letter-spacing: 0.5px; }
  .slide-title { font-size: 16px; font-weight: 600; }
  .slide-type { font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 1px; }
  .script-text { font-size: 15px; line-height: 1.8; white-space: pre-wrap; padding: 12px 0 12px 16px; border-left: 3px solid #e5e5e5; }
  .script-text .cue { color: #888; font-style: italic; }
  .no-script { font-size: 13px; color: #aaa; font-style: italic; padding: 8px 0; }
  .page-break { page-break-before: always; }
</style></head><body>`);

    printWindow.document.write(`<div class="doc-title">${title}</div>`);
    printWindow.document.write(`<div class="doc-subtitle">Speaker Script · ${slideData.length} slides · Generated ${new Date().toLocaleDateString()}</div>`);

    slideData.forEach((data) => {
      printWindow.document.write(`<div class="slide-block">`);
      printWindow.document.write(`<div class="slide-header">
        <span class="slide-number">SLIDE ${data.number}</span>
        <span class="slide-title">${data.heading}</span>
        <span class="slide-type">${data.blockType}</span>
      </div>`);

      if (data.script) {
        // Highlight delivery cues like [pause], [emphasize], etc.
        const highlighted = data.script.replace(
          /\[([^\]]+)\]/g,
          '<span class="cue">[$1]</span>'
        );
        printWindow.document.write(`<div class="script-text">${highlighted}</div>`);
      } else if (data.notes) {
        printWindow.document.write(`<div class="script-text">${data.notes}</div>`);
      } else {
        printWindow.document.write(`<div class="no-script">No script for this slide</div>`);
      }
      printWindow.document.write(`</div>`);
    });

    printWindow.document.write(`</body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 300);
  };

  const handleDownload = () => {
    const blob = new Blob([fullScript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}_Speaker_Script.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Script downloaded");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          <span className="text-xs">Script</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Speaker Script — {title}
          </DialogTitle>
        </DialogHeader>

        {/* Actions */}
        <div className="flex gap-2 pb-2 border-b border-border">
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
            <Copy className="w-3.5 h-3.5" /> Copy All
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> Download .txt
          </Button>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {!hasAnyScript && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No speaker scripts or notes yet.</p>
              <p className="text-xs mt-1">Add scripts to your slides using the Script tab in the editor.</p>
            </div>
          )}
          {slideData.map((data) => (
            <div key={data.number} className="border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold bg-foreground text-background px-2 py-0.5 rounded">
                  SLIDE {data.number}
                </span>
                <span className="text-sm font-semibold truncate">{data.heading}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider ml-auto">{data.blockType}</span>
              </div>
              {data.script ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap pl-3 border-l-2 border-primary/30">
                  {data.script}
                </p>
              ) : data.notes ? (
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap pl-3 border-l-2 border-border">
                  {data.notes}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground/50 italic">No script</p>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
