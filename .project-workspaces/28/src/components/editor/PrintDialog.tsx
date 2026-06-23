import { useState } from "react";
import { Printer, FileText, Users, Mic, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { Slide } from "@/hooks/useSlides";

type PrintMode = "slides" | "notes" | "handouts";

interface PrintDialogProps {
  slides: Slide[];
  title: string;
}

function getSlideText(slide: Slide) {
  const content =
    typeof slide.content === "object" && slide.content !== null && !Array.isArray(slide.content)
      ? (slide.content as Record<string, unknown>)
      : {};
  const heading = (content.heading as string) || "";
  const subheading = (content.subheading as string) || "";
  const body = (content.body as string) || "";
  const quote = (content.quote as string) || "";
  const bullets = Array.isArray(content.bullets) ? (content.bullets as string[]).join("\n• ") : "";
  return { heading, subheading, body: body || quote || (bullets ? `• ${bullets}` : ""), notes: slide.notes || "", script: (content.speaker_script as string) || "" };
}

export default function PrintDialog({ slides, title }: PrintDialogProps) {
  const [mode, setMode] = useState<PrintMode>("slides");
  const [isPrinting, setIsPrinting] = useState(false);
  const [open, setOpen] = useState(false);

  const handlePrint = () => {
    setIsPrinting(true);

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setIsPrinting(false);
      return;
    }

    const styles = `
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; color: #1a1a1a; }
        @page { margin: 0.75in; }
        .page-break { page-break-after: always; }
        .header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e5e5e5; }
        .header h1 { font-size: 20px; font-weight: 700; }
        .header p { font-size: 12px; color: #666; margin-top: 4px; }
        
        /* Slide mode */
        .slide-page { display: flex; align-items: center; justify-content: center; min-height: 90vh; }
        .slide-card { width: 100%; aspect-ratio: 16/9; border: 1px solid #ddd; border-radius: 8px; padding: 48px; display: flex; flex-direction: column; justify-content: center; background: #fafafa; }
        .slide-card .slide-num { font-size: 11px; color: #999; margin-bottom: 12px; }
        .slide-card h2 { font-size: 28px; font-weight: 700; margin-bottom: 12px; }
        .slide-card .sub { font-size: 16px; color: #555; margin-bottom: 8px; }
        .slide-card .body { font-size: 14px; line-height: 1.6; color: #333; white-space: pre-wrap; }
        
        /* Notes mode */
        .notes-row { margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid #eee; }
        .notes-row .slide-label { font-size: 12px; font-weight: 600; color: #d4af37; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
        .notes-row h3 { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
        .notes-row .content-preview { font-size: 12px; color: #888; margin-bottom: 8px; font-style: italic; }
        .notes-row .notes-text { font-size: 14px; line-height: 1.7; white-space: pre-wrap; background: #f8f8f8; padding: 12px 16px; border-radius: 6px; border-left: 3px solid #d4af37; }
        .notes-row .no-notes { font-size: 13px; color: #aaa; font-style: italic; }
        
        /* Handouts mode */
        .handout-grid { display: grid; gap: 24px; }
        .handout-item { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding-bottom: 20px; border-bottom: 1px solid #eee; }
        .handout-item .mini-slide { aspect-ratio: 16/9; border: 1px solid #ddd; border-radius: 6px; padding: 16px; background: #fafafa; display: flex; flex-direction: column; justify-content: center; }
        .handout-item .mini-slide .slide-num { font-size: 9px; color: #999; margin-bottom: 6px; }
        .handout-item .mini-slide h4 { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
        .handout-item .mini-slide .body { font-size: 10px; color: #555; }
        .handout-item .note-lines { display: flex; flex-direction: column; justify-content: flex-start; padding-top: 8px; }
        .handout-item .note-lines .line { height: 1px; background: #ddd; margin-bottom: 20px; width: 100%; }
        .handout-item .note-lines .label { font-size: 10px; color: #aaa; margin-bottom: 8px; }
      </style>
    `;

    let body = "";

    if (mode === "slides") {
      body = slides.map((slide, i) => {
        const s = getSlideText(slide);
        return `
          <div class="slide-page ${i < slides.length - 1 ? "page-break" : ""}">
            <div class="slide-card">
              <div class="slide-num">Slide ${i + 1} of ${slides.length}</div>
              <h2>${escHtml(s.heading)}</h2>
              ${s.subheading ? `<div class="sub">${escHtml(s.subheading)}</div>` : ""}
              <div class="body">${escHtml(s.body)}</div>
            </div>
          </div>`;
      }).join("");
    } else if (mode === "notes") {
      body = `<div class="header"><h1>${escHtml(title)} — Speaker Notes</h1><p>${slides.length} slides • ${new Date().toLocaleDateString()}</p></div>`;
      body += slides.map((slide, i) => {
        const s = getSlideText(slide);
        const notesContent = s.script || s.notes;
        return `
          <div class="notes-row">
            <div class="slide-label">Slide ${i + 1}</div>
            <h3>${escHtml(s.heading)}</h3>
            ${s.body ? `<div class="content-preview">${escHtml(s.body.slice(0, 100))}${s.body.length > 100 ? "..." : ""}</div>` : ""}
            ${notesContent ? `<div class="notes-text">${escHtml(notesContent)}</div>` : `<div class="no-notes">No notes for this slide</div>`}
          </div>`;
      }).join("");
    } else {
      body = `<div class="header"><h1>${escHtml(title)} — Handout</h1><p>${slides.length} slides • ${new Date().toLocaleDateString()}</p></div>`;
      body += `<div class="handout-grid">`;
      body += slides.map((slide, i) => {
        const s = getSlideText(slide);
        return `
          <div class="handout-item">
            <div class="mini-slide">
              <div class="slide-num">Slide ${i + 1}</div>
              <h4>${escHtml(s.heading)}</h4>
              <div class="body">${escHtml((s.body || s.subheading).slice(0, 80))}</div>
            </div>
            <div class="note-lines">
              <div class="label">Notes</div>
              ${Array(6).fill('<div class="line"></div>').join("")}
            </div>
          </div>`;
      }).join("");
      body += `</div>`;
    }

    printWindow.document.write(`<!DOCTYPE html><html><head><title>${escHtml(title)}</title>${styles}</head><body>${body}</body></html>`);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.print();
      setIsPrinting(false);
      setOpen(false);
    }, 500);
  };

  const modes: { value: PrintMode; label: string; desc: string; icon: React.ReactNode }[] = [
    { value: "slides", label: "Slides", desc: "One slide per page, full size", icon: <FileText className="w-4 h-4" /> },
    { value: "notes", label: "Speaker Notes", desc: "Slides with notes for rehearsal", icon: <Mic className="w-4 h-4" /> },
    { value: "handouts", label: "Audience Handouts", desc: "Mini slides with note lines", icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5">
          <Printer className="w-3.5 h-3.5" />
          <span className="text-xs">Print</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Print Presentation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as PrintMode)} className="space-y-3">
            {modes.map((m) => (
              <label
                key={m.value}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  mode === m.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                }`}
              >
                <RadioGroupItem value={m.value} className="mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {m.icon}
                    <Label className="font-medium cursor-pointer">{m.label}</Label>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
                </div>
              </label>
            ))}
          </RadioGroup>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" className="gap-1.5 bg-gradient-gold text-primary-foreground" onClick={handlePrint} disabled={isPrinting || slides.length === 0}>
              {isPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
              Print {modes.find((m) => m.value === mode)?.label}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
