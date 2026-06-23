import { useState } from "react";
import { BookmarkPlus, Search, Loader2, HelpCircle, Plus, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card } from "@/components/ui/card";
import ScaledSlide from "@/components/editor/ScaledSlide";
import SlideRenderer from "@/components/editor/SlideRenderer";
import { useSavedBlocks } from "@/hooks/useSavedBlocks";
import { useSlideTemplates } from "@/hooks/useSlideTemplates";
import { useHasTier } from "@/hooks/useSubscription";
import { BLOCK_CATEGORIES, STARTER_BLOCKS, getCategoryByType } from "@/lib/blockCategories";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import type { Json } from "@/integrations/supabase/types";

interface InsertFromLibraryDialogProps {
  onInsert: (blockType: string, content: Json) => void;
  children: React.ReactNode;
}

export default function InsertFromLibraryDialog({ onInsert, children }: InsertFromLibraryDialogProps) {
  const { data: blocks = [], isLoading } = useSavedBlocks();
  const { data: templates = [] } = useSlideTemplates();
  const isPro = useHasTier("pro");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const allItems = [
    ...blocks.map((b) => ({ id: b.id, name: b.name, block_type: b.block_type, content: b.content, description: b.description, isStarter: false, isPremium: false })),
    ...templates.map((t) => ({ id: t.id, name: t.name, block_type: t.block_type, content: t.content, description: null, isStarter: false, isPremium: t.is_premium })),
    ...STARTER_BLOCKS.map((s, i) => ({ id: `starter-${i}`, name: s.name, block_type: s.block_type, content: s.content, description: s.description, isStarter: true, isPremium: false })),
  ];

  const filtered = allItems.filter((item) => {
    const matchesSearch = !search || item.name.toLowerCase().includes(search.toLowerCase()) || item.block_type.toLowerCase().includes(search.toLowerCase());
    const matchesTab = activeTab === "all" || item.block_type === activeTab;
    return matchesSearch && matchesTab;
  });

  const handleInsert = (item: typeof allItems[0]) => {
    if (item.isPremium && !isPro) {
      setUpgradeOpen(true);
      return;
    }
    onInsert(item.block_type, item.content);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <BookmarkPlus className="w-5 h-5 text-primary" />
            Insert from Library
          </DialogTitle>
        </DialogHeader>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search blocks..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0 mb-3">
            <TabsTrigger value="all" className="text-xs h-7 px-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full">
              All
            </TabsTrigger>
            {BLOCK_CATEGORIES.map((cat) => (
              <TabsTrigger key={cat.type} value={cat.type} className="text-xs h-7 px-2.5 gap-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full">
                <cat.icon className="w-3 h-3" />
                {cat.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Category description */}
          {activeTab !== "all" && (() => {
            const cat = getCategoryByType(activeTab);
            return cat ? (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-secondary/50 border border-border mb-3">
                <cat.icon className={`w-4 h-4 mt-0.5 shrink-0 ${cat.color}`} />
                <div>
                  <p className="text-sm font-medium">{cat.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                </div>
              </div>
            ) : null;
          })()}

          <div className="flex-1 overflow-y-auto min-h-0">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <BookmarkPlus className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No blocks found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map((item) => {
                  const cat = getCategoryByType(item.block_type);
                  return (
                    <Card
                      key={item.id}
                      className={`group overflow-hidden bg-card border-border hover:border-primary/30 transition-all cursor-pointer ${item.isPremium && !isPro ? "opacity-75" : ""}`}
                      onClick={() => handleInsert(item)}
                      draggable={!(item.isPremium && !isPro)}
                      onDragStart={(e) => {
                        if (item.isPremium && !isPro) { e.preventDefault(); return; }
                        e.dataTransfer.setData("application/x-presentq-block", JSON.stringify({ blockType: item.block_type, blockContent: item.content }));
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                    >
                      <div className="aspect-video bg-background border-b border-border relative">
                        <ScaledSlide>
                          <SlideRenderer blockType={item.block_type} content={item.content} />
                        </ScaledSlide>
                        {item.isPremium && !isPro && (
                          <div className="absolute inset-0 bg-background/40 flex items-center justify-center">
                            <Lock className="w-5 h-5 text-primary" />
                          </div>
                        )}
                      </div>
                      <div className="p-2.5">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs font-medium truncate">{item.name}</p>
                          {item.isPremium && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">Pro</span>
                          )}
                          {item.isStarter && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">Example</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          {cat && <cat.icon className={`w-3 h-3 ${cat.color}`} />}
                          <span className="text-[11px] text-muted-foreground capitalize">{cat?.label || item.block_type}</span>
                          {item.description && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="w-3 h-3 text-muted-foreground/50 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs text-xs">{item.description}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                      <div className="px-2.5 pb-2.5">
                        <Button size="sm" variant="ghost" className="w-full h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                          {item.isPremium && !isPro ? <Lock className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          {item.isPremium && !isPro ? "Upgrade" : "Insert"}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </Tabs>
        <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} feature="Premium slide blocks" />
      </DialogContent>
    </Dialog>
  );
}
