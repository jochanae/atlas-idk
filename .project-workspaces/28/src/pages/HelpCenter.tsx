import { useState, useMemo } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { motion } from "framer-motion";
import { BookOpen, Search, Lightbulb, HelpCircle, ChevronRight } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useKnowledgeBase, type KnowledgeEntry } from "@/hooks/useKnowledgeBase";
import { AnimatePresence } from "framer-motion";

const categoryConfig: Record<string, { label: string; icon: typeof BookOpen; color: string }> = {
  glossary: { label: "Glossary", icon: BookOpen, color: "bg-blue-500/15 text-blue-400" },
  "how-to": { label: "How-To", icon: HelpCircle, color: "bg-emerald-500/15 text-emerald-400" },
  "pro-tip": { label: "Pro Tip", icon: Lightbulb, color: "bg-amber-500/15 text-amber-400" },
};

export default function HelpCenter() {
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

  const grouped = useMemo(() => {
    const groups: Record<string, KnowledgeEntry[]> = {};
    filtered.forEach((entry) => {
      if (!groups[entry.category]) groups[entry.category] = [];
      groups[entry.category].push(entry);
    });
    return groups;
  }, [filtered]);

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-6 overflow-hidden">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold">Help & Learn</h1>
              <p className="text-sm text-muted-foreground">Glossary, tips, and how-to guides</p>
            </div>
          </div>
        </motion.div>

        {/* Search + filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search terms, tips, how-tos…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5">
            <Badge
              variant={activeCategory === null ? "default" : "secondary"}
              className="cursor-pointer"
              onClick={() => setActiveCategory(null)}
            >
              All ({entries.length})
            </Badge>
            {Object.entries(categoryConfig).map(([key, cfg]) => {
              const count = entries.filter((e) => e.category === key).length;
              return (
                <Badge
                  key={key}
                  variant={activeCategory === key ? "default" : "secondary"}
                  className="cursor-pointer"
                  onClick={() => setActiveCategory(activeCategory === key ? null : key)}
                >
                  {cfg.label} ({count})
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Entries */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="md" text="Loading help articles…" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No entries match your search</p>
          </div>
        ) : (
          Object.entries(grouped).map(([category, items]) => {
            const cfg = categoryConfig[category] || categoryConfig.glossary;
            return (
              <div key={category} className="space-y-2">
                <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2 pt-2">
                  <cfg.icon className="w-3.5 h-3.5" />
                  {cfg.label}
                </h2>
                {items.map((entry, i) => {
                  const isExpanded = expandedId === entry.id;
                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <Card className="bg-card border-border overflow-hidden">
                        <button
                          className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/50 transition-colors"
                          onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                        >
                          <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${cfg.color}`}>
                            <cfg.icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{entry.title}</p>
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
                              <CardContent className="pt-0 pb-3 px-3">
                                <div className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed break-words overflow-hidden">
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
                              </CardContent>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </DashboardLayout>
  );
}
