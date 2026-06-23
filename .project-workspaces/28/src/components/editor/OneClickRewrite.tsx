import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wand2, Loader2, Scissors, Megaphone, BookOpen, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OneClickRewriteProps {
  text: string;
  onApply: (newText: string) => void;
}

type RewriteStyle = "concise" | "persuasive" | "storytelling";

const styles: { id: RewriteStyle; label: string; icon: typeof Scissors; desc: string }[] = [
  { id: "concise", label: "Concise", icon: Scissors, desc: "Shorter & punchier" },
  { id: "persuasive", label: "Persuasive", icon: Megaphone, desc: "Compelling & urgent" },
  { id: "storytelling", label: "Story", icon: BookOpen, desc: "Vivid & narrative" },
];

export default function OneClickRewrite({ text, onApply }: OneClickRewriteProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<RewriteStyle | null>(null);
  const [results, setResults] = useState<Partial<Record<RewriteStyle, string>>>({});

  const handleRewrite = async (style: RewriteStyle) => {
    if (!text.trim() || text.trim().length < 5) {
      toast.error("Add more text before rewriting");
      return;
    }
    setLoading(style);
    try {
      const { data, error } = await supabase.functions.invoke("rewrite-text", {
        body: { text, style },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      setResults(prev => ({ ...prev, [style]: data.rewritten }));
    } catch (err) {
      console.error(err);
      toast.error("Rewrite failed");
    } finally {
      setLoading(null);
    }
  };

  const handleApply = (style: RewriteStyle) => {
    const result = results[style];
    if (result) {
      onApply(result);
      setOpen(false);
      setResults({});
      toast.success(`Applied ${style} rewrite`);
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setResults({}); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-primary/70 hover:text-primary"
          title="AI Rewrite"
          disabled={!text.trim() || text.trim().length < 5}
        >
          <Wand2 className="w-3 h-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end" side="left">
        <div className="px-3 py-2.5 border-b border-border">
          <div className="flex items-center gap-1.5">
            <Wand2 className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">AI Rewrite</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">Choose a style to rewrite this text</p>
        </div>

        <div className="p-2 space-y-1.5">
          {styles.map(({ id, label, icon: Icon, desc }) => (
            <div key={id}>
              <button
                onClick={() => results[id] ? null : handleRewrite(id)}
                disabled={loading !== null}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-left ${
                  results[id] ? "bg-primary/5 border border-primary/20" : "hover:bg-secondary/60"
                }`}
              >
                <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center shrink-0">
                  {loading === id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  ) : (
                    <Icon className="w-3.5 h-3.5 text-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-foreground">{label}</span>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </div>
                {!results[id] && loading !== id && (
                  <span className="text-[9px] text-primary font-medium shrink-0">Generate</span>
                )}
              </button>

              <AnimatePresence>
                {results[id] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-2.5 py-2 ml-9">
                      <p className="text-xs text-foreground leading-relaxed mb-2">
                        {results[id]}
                      </p>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          className="h-6 text-[10px] gap-1 bg-primary text-primary-foreground"
                          onClick={() => handleApply(id)}
                        >
                          <Check className="w-3 h-3" /> Apply
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] gap-1"
                          onClick={() => handleRewrite(id)}
                          disabled={loading !== null}
                        >
                          Regenerate
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
