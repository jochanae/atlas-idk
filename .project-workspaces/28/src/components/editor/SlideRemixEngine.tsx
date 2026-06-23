import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Type, BookOpen, LayoutTemplate, BarChart3, Target, Quote,
  GitCompare, MessageSquareQuote, Video, BarChart2, Table2,
  Shuffle, Loader2, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { Slide } from "@/hooks/useSlides";

interface SlideRemixEngineProps {
  slide: Slide;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (blockType: string, content: Json) => void;
}

const blockOptions = [
  { type: "title", label: "Title", icon: Type },
  { type: "story", label: "Story", icon: BookOpen },
  { type: "framework", label: "Framework", icon: LayoutTemplate },
  { type: "data", label: "Data Point", icon: BarChart3 },
  { type: "cta", label: "Call to Action", icon: Target },
  { type: "quote", label: "Quote", icon: Quote },
  { type: "comparison", label: "Comparison", icon: GitCompare },
  { type: "testimonial", label: "Testimonial", icon: MessageSquareQuote },
  { type: "video", label: "Video", icon: Video },
  { type: "chart", label: "Chart", icon: BarChart2 },
  { type: "table", label: "Table", icon: Table2 },
];

export default function SlideRemixEngine({ slide, open, onOpenChange, onUpdate }: SlideRemixEngineProps) {
  const [converting, setConverting] = useState<string | null>(null);

  const content = (typeof slide.content === "object" && slide.content !== null && !Array.isArray(slide.content))
    ? slide.content as Record<string, unknown>
    : {};

  const handleConvert = async (targetType: string) => {
    if (targetType === slide.block_type) {
      toast.info("Slide is already this type");
      return;
    }

    setConverting(targetType);
    try {
      const session = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/remix-slide-type`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({
          currentBlockType: slide.block_type,
          targetBlockType: targetType,
          content,
        }),
      });

      if (resp.status === 429) { toast.error("Rate limited — try again later"); return; }
      if (resp.status === 402) { toast.error("Credits exhausted — please add funds"); return; }
      if (!resp.ok) throw new Error("Conversion failed");

      const { blockType, content: newContent } = await resp.json();
      onUpdate(blockType, newContent as Json);
      onOpenChange(false);
      toast.success(`Converted to ${blockOptions.find(b => b.type === targetType)?.label || targetType}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to convert slide");
    } finally {
      setConverting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Shuffle className="w-5 h-5 text-primary" />
            Remix Slide Type
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          AI will intelligently convert your content from <span className="font-semibold capitalize text-foreground">{slide.block_type}</span> to a new block type.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {blockOptions.map((bt) => {
            const isCurrent = bt.type === slide.block_type;
            const isLoading = converting === bt.type;
            return (
              <button
                key={bt.type}
                disabled={!!converting || isCurrent}
                onClick={() => handleConvert(bt.type)}
                className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left ${
                  isCurrent
                    ? "border-primary/50 bg-primary/5 opacity-60 cursor-default"
                    : "border-border hover:border-primary/30 hover:bg-secondary/50"
                } ${converting && !isLoading ? "opacity-40" : ""}`}
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  ) : (
                    <bt.icon className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div>
                  <span className="text-sm font-medium block">{bt.label}</span>
                  {isCurrent && <span className="text-[10px] text-muted-foreground">Current</span>}
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
