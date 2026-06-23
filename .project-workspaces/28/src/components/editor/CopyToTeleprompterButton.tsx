import { useState } from "react";
import { Copy, Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Slide } from "@/hooks/useSlides";

interface CopyToTeleprompterButtonProps {
  slides: Slide[];
  onOpenTeleprompter: () => void;
}

function buildScript(slides: Slide[]): string {
  return slides.map((slide, i) => {
    const content =
      typeof slide.content === "object" && slide.content !== null && !Array.isArray(slide.content)
        ? (slide.content as Record<string, unknown>)
        : {};
    const heading = (content.heading as string) || `Slide ${i + 1}`;
    const script = (content.speaker_script as string) || "";
    const notes = slide.notes || "";
    const bullets = Array.isArray(content.bullets) ? (content.bullets as string[]).join("\n• ") : "";
    const body = script || notes || (bullets ? `• ${bullets}` : (content.body as string) || (content.subheading as string) || "");

    return `── SLIDE ${i + 1}: ${heading.toUpperCase()} ──\n${body || "(No script)"}\n`;
  }).join("\n");
}

export default function CopyToTeleprompterButton({ slides, onOpenTeleprompter }: CopyToTeleprompterButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const script = buildScript(slides);
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      toast.success("Full script copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={handleCopy} title="Copy full script to clipboard">
        {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
        <span className="text-xs">{copied ? "Copied" : "Copy Script"}</span>
      </Button>
      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onOpenTeleprompter} title="Open teleprompter with your script">
        <FileText className="w-3.5 h-3.5" />
        <span className="text-xs">Prompter</span>
      </Button>
    </div>
  );
}
