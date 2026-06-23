import { useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { motion } from "framer-motion";
import { BookmarkPlus, Trash2, Loader2, Search, HelpCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ScaledSlide from "@/components/editor/ScaledSlide";
import SlideRenderer from "@/components/editor/SlideRenderer";
import { useSavedBlocks, useDeleteSavedBlock } from "@/hooks/useSavedBlocks";
import { BLOCK_CATEGORIES, STARTER_BLOCKS, getCategoryByType } from "@/lib/blockCategories";
import { toast } from "sonner";

export default function ContentLibraryPage() {
  const { data: blocks = [], isLoading } = useSavedBlocks();
  const deleteBlock = useDeleteSavedBlock();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  // Combine saved blocks with starter blocks (starters shown when library is sparse)
  const showStarters = blocks.length < 3;

  const starterItems = STARTER_BLOCKS.map((s, i) => ({
    id: `starter-${i}`,
    name: s.name,
    block_type: s.block_type,
    content: s.content,
    description: s.description,
    isStarter: true,
    tags: s.tags,
  }));

  const savedItems = blocks.map((b) => ({
    id: b.id,
    name: b.name,
    block_type: b.block_type,
    content: b.content,
    description: b.description || "",
    isStarter: false,
    tags: b.tags || [],
  }));

  const allItems = [...savedItems, ...(showStarters ? starterItems : [])];

  const filtered = allItems.filter((item) => {
    const matchesSearch =
      !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.block_type.toLowerCase().includes(search.toLowerCase()) ||
      (item.description || "").toLowerCase().includes(search.toLowerCase());
    const matchesTab = activeTab === "all" || item.block_type === activeTab;
    return matchesSearch && matchesTab;
  });

  const handleDelete = (id: string) => {
    deleteBlock.mutate(id, {
      onSuccess: () => toast.success("Block removed from library"),
    });
  };

  // Active category info
  const activeCat = activeTab !== "all" ? getCategoryByType(activeTab) : null;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold">Content Library</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Save and reuse modular content blocks across all your presentations.
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search blocks by name, type, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Category Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0">
            <TabsTrigger value="all" className="text-xs h-7 px-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full">
              All Blocks
            </TabsTrigger>
            {BLOCK_CATEGORIES.map((cat) => (
              <TabsTrigger key={cat.type} value={cat.type} className="text-xs h-7 px-2.5 gap-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full">
                <cat.icon className="w-3 h-3" />
                {cat.label}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 text-muted-foreground/50 ml-0.5" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    {cat.tooltip}
                  </TooltipContent>
                </Tooltip>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Category description banner */}
        {activeCat && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 p-4 rounded-xl bg-secondary/50 border border-border mb-6"
          >
            <div className={`w-10 h-10 rounded-xl bg-background flex items-center justify-center shrink-0`}>
              <activeCat.icon className={`w-5 h-5 ${activeCat.color}`} />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{activeCat.label}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{activeCat.description}</p>
              <p className="text-[11px] text-primary mt-1.5 flex items-center gap-1">
                <HelpCircle className="w-3 h-3" />
                {activeCat.tooltip}
              </p>
            </div>
          </motion.div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <LoadingSpinner size="md" text="Loading library…" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
              <BookmarkPlus className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="font-display font-semibold mb-1">No blocks found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {search
                ? "Try a different search term."
                : 'Open any presentation, click "⋮" on a slide, and choose "Save to Library" to add blocks.'}
            </p>
          </div>
        ) : (
          <>
            {/* Starter blocks section label */}
            {showStarters && savedItems.length === 0 && activeTab === "all" && (
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Example Blocks — save your own to replace these
                </span>
              </div>
            )}

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((item, i) => {
                const cat = getCategoryByType(item.block_type);
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <Card className="group overflow-hidden bg-card border-border hover:border-primary/30 transition-all">
                      <div className="aspect-video bg-background border-b border-border">
                        <ScaledSlide>
                          <SlideRenderer blockType={item.block_type} content={item.content} />
                        </ScaledSlide>
                      </div>
                      <div className="p-3">
                        <div className="flex items-center justify-between gap-1">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              {cat && <cat.icon className={`w-3 h-3 ${cat.color}`} />}
                              <span className="text-[11px] text-muted-foreground">{cat?.label || item.block_type}</span>
                              {item.isStarter && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary ml-1">Example</span>
                              )}
                            </div>
                          </div>
                          {!item.isStarter && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive shrink-0"
                              onClick={() => handleDelete(item.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">{item.description}</p>
                        )}
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
