import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, BookOpen, Lightbulb, HelpCircle, X, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useKnowledgeBase, type KnowledgeEntry } from "@/hooks/useKnowledgeBase";

interface KnowledgePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const categoryConfig: Record<string, { label: string; icon: typeof BookOpen; color: string }> = {
  glossary: { label: "Glossary", icon: BookOpen, color: "bg-blue-500/15 text-blue-400" },
  "how-to": { label: "How-To", icon: HelpCircle, color: "bg-emerald-500/15 text-emerald-400" },
  "pro-tip": { label: "Pro Tip", icon: Lightbulb, color: "bg-amber-500/15 text-amber-400" },
};

export default function KnowledgePanel({ open, onOpenChange }: KnowledgePanelProps) {
  const { data: entries = [], isLoading } = useKnowledgeBase();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let items = entries;
    if (activeCategory) items = items.filter((e) => e.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.body.toLowerCase().includes(q) ||
          e.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }
    return items;
  }, [entries, search, activeCategory]);

  const categories = Object.entries(categoryConfig);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 pb-3 border-b border-border">
          <SheetTitle className="flex items-center gap-2 font-display">
            <BookOpen className="w-5 h-5 text-primary" />
            Knowledge Base
          </SheetTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search terms, tips, how-tos…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
              autoFocus
            />
          </div>
          <div className="flex gap-1.5 mt-2">
            <Badge
              variant={activeCategory === null ? "default" : "secondary"}
              className="cursor-pointer text-xs"
              onClick={() => setActiveCategory(null)}
            >
              All
            </Badge>
            {categories.map(([key, cfg]) => (
              <Badge
                key={key}
                variant={activeCategory === key ? "default" : "secondary"}
                className="cursor-pointer text-xs"
                onClick={() => setActiveCategory(activeCategory === key ? null : key)}
              >
                {cfg.label}
              </Badge>
            ))}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 p-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No entries found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((entry) => {
                const cfg = categoryConfig[entry.category] || categoryConfig.glossary;
                const isExpanded = expandedId === entry.id;

                return (
                  <motion.div
                    key={entry.id}
                    layout
                    className="rounded-lg border border-border bg-card overflow-hidden"
                  >
                    <button
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/50 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    >
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${cfg.color}`}>
                        <cfg.icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{entry.title}</p>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          {cfg.label}
                        </span>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="px-3 pb-3 pt-0">
                            <div className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                              {entry.body}
                            </div>
                            {entry.tags && entry.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {entry.tags.map((tag) => (
                                  <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
