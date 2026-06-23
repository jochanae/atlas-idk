import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImageIcon, Loader2, Sparkles, Camera, Palette, Shapes, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

interface SmartImageSuggestionsProps {
  slideText: string;
  blockType: string;
  onGenerateImage: (prompt: string) => void;
}

interface ImageSuggestion {
  description: string;
  style: "photo" | "illustration" | "abstract" | "icon";
  mood: string;
}

const styleIcons: Record<string, React.ElementType> = {
  photo: Camera,
  illustration: Palette,
  abstract: Shapes,
  icon: ImageIcon,
};

export default function SmartImageSuggestions({ slideText, blockType, onGenerateImage }: SmartImageSuggestionsProps) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ImageSuggestion[]>([]);
  const [open, setOpen] = useState(false);

  const handleSuggest = async () => {
    if (!slideText.trim()) {
      toast.error("Add some text to your slide first");
      return;
    }
    setLoading(true);
    setSuggestions([]);
    setOpen(true);

    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/suggest-images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ text: slideText, blockType }),
      });

      if (resp.status === 429) { toast.error("Rate limited — try again later"); setOpen(false); return; }
      if (resp.status === 402) { toast.error("Credits exhausted — please add funds"); setOpen(false); return; }
      if (!resp.ok) throw new Error("Suggestion failed");

      const { suggestions: s } = await resp.json();
      setSuggestions(s);
    } catch (err) {
      console.error(err);
      toast.error("Failed to get image suggestions");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1.5 text-xs"
        onClick={handleSuggest}
        disabled={loading}
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        AI: Suggest Images
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-lg border border-primary/20 bg-card p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Image Ideas</span>
                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => setOpen(false)}>
                  <X className="w-2.5 h-2.5" />
                </Button>
              </div>

              {loading ? (
                <div className="flex items-center gap-2 py-3 justify-center">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  <span className="text-[10px] text-muted-foreground">Analyzing your content…</span>
                </div>
              ) : (
                suggestions.map((s, i) => {
                  const StyleIcon = styleIcons[s.style] || ImageIcon;
                  return (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      onClick={() => {
                        onGenerateImage(s.description);
                        setOpen(false);
                        toast.success("Generating image…");
                      }}
                      className="w-full flex items-start gap-2 p-2 rounded-md hover:bg-secondary/80 transition-colors text-left group"
                    >
                      <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <StyleIcon className="w-3 h-3 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] leading-tight text-foreground">{s.description}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] text-muted-foreground capitalize">{s.style}</span>
                          <span className="text-[9px] text-muted-foreground">·</span>
                          <span className="text-[9px] text-muted-foreground capitalize">{s.mood}</span>
                        </div>
                      </div>
                      <Sparkles className="w-3 h-3 text-primary/0 group-hover:text-primary/60 transition-colors shrink-0 mt-1" />
                    </motion.button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
