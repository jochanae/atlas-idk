import { ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";

interface DeepDiveButtonsProps {
  /** The topic/content to deep dive on */
  topic: string;
  /** Compact mode for inline use */
  compact?: boolean;
  className?: string;
}

/**
 * Deep Dive buttons for Gemini and ChatGPT.
 * - Gemini: copies topic to clipboard, opens Gemini in new tab
 * - ChatGPT: opens ChatGPT with the topic pre-filled via URL param
 */
export default function DeepDiveButtons({ topic, compact = false, className = "" }: DeepDiveButtonsProps) {
  const handleGemini = () => {
    // Open first (must happen synchronously to avoid popup blocker), then copy
    window.open("https://gemini.google.com/app", "_blank");
    navigator.clipboard.writeText(topic).then(() => {
      toast.success("Topic copied to clipboard — paste it into Gemini");
    });
  };

  const handleChatGPT = () => {
    const encoded = encodeURIComponent(topic.slice(0, 2000));
    window.open(`https://chatgpt.com/?q=${encoded}`, "_blank");
  };

  const handlePerplexity = () => {
    const encoded = encodeURIComponent(topic.slice(0, 2000));
    window.open(`https://www.perplexity.ai/search?q=${encoded}`, "_blank");
  };

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`}>
        <button
          onClick={handlePerplexity}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary/80 border border-border text-[10px] font-medium text-foreground hover:bg-secondary transition-colors"
          title="Deep dive with Perplexity AI"
        >
          <ExternalLink className="w-2.5 h-2.5" /> Perplexity
        </button>
        <button
          onClick={handleChatGPT}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary/80 border border-border text-[10px] font-medium text-foreground hover:bg-secondary transition-colors"
          title="Deep dive with ChatGPT"
        >
          <ExternalLink className="w-2.5 h-2.5" /> ChatGPT
        </button>
        <button
          onClick={handleGemini}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary/80 border border-border text-[10px] font-medium text-foreground hover:bg-secondary transition-colors"
          title="Deep dive with Google Gemini"
        >
          <Copy className="w-2.5 h-2.5" /> Gemini
        </button>
      </span>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Research:</span>
        <button
          onClick={handlePerplexity}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/80 border border-border text-[11px] font-medium text-foreground hover:bg-secondary transition-colors"
        >
          <ExternalLink className="w-3 h-3" /> Perplexity
        </button>
        <button
          onClick={handleChatGPT}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/80 border border-border text-[11px] font-medium text-foreground hover:bg-secondary transition-colors"
        >
          <ExternalLink className="w-3 h-3" /> ChatGPT
        </button>
        <button
          onClick={handleGemini}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/80 border border-border text-[11px] font-medium text-foreground hover:bg-secondary transition-colors"
        >
          <Copy className="w-3 h-3" /> Gemini
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        <strong>Perplexity</strong> &amp; <strong>ChatGPT</strong> open with your topic pre-filled. <strong>Gemini</strong> copies to clipboard — just paste when it opens.
      </p>
    </div>
  );
}
