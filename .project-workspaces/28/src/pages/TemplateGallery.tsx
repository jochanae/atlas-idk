import { useState, useMemo } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { motion } from "framer-motion";
import { Loader2, LayoutTemplate, Lock, Sparkles, Search, Grid3X3, List, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ScaledSlide from "@/components/editor/ScaledSlide";
import SlideRenderer from "@/components/editor/SlideRenderer";
import { useSlideTemplates } from "@/hooks/useSlideTemplates";
import { useCreatePresentation } from "@/hooks/usePresentations";
import { useCreateSlide } from "@/hooks/useSlides";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { PRESET_THEMES, type SlideTheme } from "@/lib/slideThemes";
import { DEMO_LECTURE_DECKS } from "@/lib/demoLectureTemplates";

const CATEGORY_THEMES: Record<string, SlideTheme> = {
  "Keynote": PRESET_THEMES.find(t => t.id === "royal-purple")!,
  "Sales Deck": PRESET_THEMES.find(t => t.id === "ocean-dark")!,
  "Startup Pitch": PRESET_THEMES.find(t => t.id === "charcoal-amber")!,
  "CTA": PRESET_THEMES.find(t => t.id === "warm-coral")!,
  "Data": PRESET_THEMES.find(t => t.id === "deep-navy")!,
  "Inspire": PRESET_THEMES.find(t => t.id === "forest-green")!,
  "General": PRESET_THEMES.find(t => t.id === "clean-white")!,
  "Story": PRESET_THEMES.find(t => t.id === "warm-sunset")!,
  "Title Slides": PRESET_THEMES.find(t => t.id === "charcoal-amber") || PRESET_THEMES[0],
  "Charts": PRESET_THEMES.find(t => t.id === "deep-navy") || PRESET_THEMES[0],
  "Tables": PRESET_THEMES.find(t => t.id === "ocean-dark") || PRESET_THEMES[0],
  "Video Embeds": PRESET_THEMES.find(t => t.id === "royal-purple") || PRESET_THEMES[0],
  "Onboarding Course": PRESET_THEMES.find(t => t.id === "forest-green") || PRESET_THEMES[0],
  "Product Workshop": PRESET_THEMES.find(t => t.id === "ocean-dark") || PRESET_THEMES[0],
  "Skill Masterclass": PRESET_THEMES.find(t => t.id === "royal-purple") || PRESET_THEMES[0],
};

function getThemeForCategory(category: string): SlideTheme {
  return CATEGORY_THEMES[category] || PRESET_THEMES[0];
}

export default function TemplateGalleryPage() {
  const navigate = useNavigate();
  const { data: templates = [], isLoading } = useSlideTemplates();
  const createPres = useCreatePresentation();
  const createSlide = useCreateSlide();
  const { data: subscription } = useSubscription();
  const [creatingCategory, setCreatingCategory] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const isPro = subscription?.subscribed ?? false;

  // Group by category (including demo lecture decks)
  const categories = useMemo(() => {
    const acc = templates.reduce<Record<string, typeof templates>>((a, t) => {
      (a[t.category] = a[t.category] || []).push(t);
      return a;
    }, {});
    // Add demo lecture decks as categories
    for (const deck of DEMO_LECTURE_DECKS) {
      acc[deck.category] = deck.slides.map((s, i) => ({
        id: `${deck.id}-${i}`,
        name: `${deck.category} — ${(s.content as any)?.heading || s.block_type}`,
        block_type: s.block_type,
        category: deck.category,
        content: s.content,
        is_premium: false,
        preview_url: null,
        created_at: new Date().toISOString(),
      }));
    }
    return acc;
  }, [templates]);

  const categoryNames = useMemo(() => Object.keys(categories).sort(), [categories]);

  // Filter
  const filteredCategories = useMemo(() => {
    let entries = Object.entries(categories);
    if (activeCategory) entries = entries.filter(([cat]) => cat === activeCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      entries = entries.map(([cat, slides]) => [
        cat,
        slides.filter((s) => s.name.toLowerCase().includes(q) || s.block_type.toLowerCase().includes(q) || cat.toLowerCase().includes(q)),
      ] as [string, typeof templates]).filter(([, slides]) => slides.length > 0);
    }
    return entries;
  }, [categories, activeCategory, searchQuery]);

  const totalTemplates = templates.length;
  const premiumCount = templates.filter((t) => t.is_premium).length;

  const handleUseTemplate = async (category: string) => {
    const categoryTemplates = categories[category];
    if (!categoryTemplates) return;

    const hasPremium = categoryTemplates.some((t) => t.is_premium);
    if (hasPremium && !isPro) {
      setUpgradeOpen(true);
      return;
    }

    setCreatingCategory(category);
    try {
      const pres = await createPres.mutateAsync({ title: category });
      for (let i = 0; i < categoryTemplates.length; i++) {
        const t = categoryTemplates[i];
        await createSlide.mutateAsync({
          presentation_id: pres.id,
          block_type: t.block_type,
          content: t.content as Json,
          sort_order: i,
        });
      }
      toast.success(`"${category}" deck created with ${categoryTemplates.length} slides`);
      navigate(`/editor/${pres.id}`);
    } catch {
      toast.error("Failed to create presentation");
    } finally {
      setCreatingCategory(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Template Gallery</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {totalTemplates} templates across {categoryNames.length} categories
              {premiumCount > 0 && <span> · {premiumCount} premium</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="pl-8 h-8 text-sm w-48"
              />
              {searchQuery && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearchQuery("")}>
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>
            <div className="flex border border-border rounded-md">
              <button
                className={`p-1.5 ${viewMode === "grid" ? "bg-secondary" : ""}`}
                onClick={() => setViewMode("grid")}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
              </button>
              <button
                className={`p-1.5 ${viewMode === "list" ? "bg-secondary" : ""}`}
                onClick={() => setViewMode("list")}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant={!activeCategory ? "default" : "secondary"}
            className="cursor-pointer text-[11px] px-2.5 py-0.5"
            onClick={() => setActiveCategory(null)}
          >
            All
          </Badge>
          {categoryNames.map((cat) => (
            <Badge
              key={cat}
              variant={activeCategory === cat ? "default" : "secondary"}
              className="cursor-pointer text-[11px] px-2.5 py-0.5"
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            >
              {cat}
              <span className="ml-1 opacity-60">{categories[cat].length}</span>
            </Badge>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <LoadingSpinner size="md" text="Loading templates…" />
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
              <LayoutTemplate className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="font-display font-semibold mb-1">
              {searchQuery ? "No matching templates" : "No templates available"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? "Try a different search term." : "Templates are being added soon."}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {filteredCategories.map(([category, slides]) => {
              const hasPremium = slides.some((s) => s.is_premium);
              return (
                <div key={category}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-lg font-semibold">{category}</h2>
                      <Badge variant="secondary" className="text-xs">
                        {slides.length} slide{slides.length !== 1 ? "s" : ""}
                      </Badge>
                      {hasPremium && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Sparkles className="w-3 h-3" /> Premium
                        </Badge>
                      )}
                    </div>
                    <Button
                      onClick={() => handleUseTemplate(category)}
                      disabled={creatingCategory === category}
                      className="bg-gradient-gold text-primary-foreground"
                      size="sm"
                    >
                      {creatingCategory === category ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      ) : hasPremium && !isPro ? (
                        <Lock className="w-3.5 h-3.5 mr-1.5" />
                      ) : null}
                      Use This Deck
                    </Button>
                  </div>

                  {viewMode === "grid" ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                      {slides.map((template, i) => (
                        <motion.div
                          key={template.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.03 }}
                        >
                          <Card className="overflow-hidden bg-card border-border relative group hover:ring-2 hover:ring-primary/20 transition-all">
                            <div className="aspect-video bg-background">
                              <ScaledSlide>
                                <SlideRenderer blockType={template.block_type} content={template.content} theme={getThemeForCategory(category)} />
                              </ScaledSlide>
                            </div>
                            <div className="p-2">
                              <p className="text-xs font-medium truncate">{template.name.replace(`${category} — `, "")}</p>
                              <p className="text-[10px] text-muted-foreground capitalize">{template.block_type}</p>
                            </div>
                            {template.is_premium && (
                              <div className="absolute top-1.5 right-1.5">
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                                  <Sparkles className="w-2.5 h-2.5" /> Pro
                                </Badge>
                              </div>
                            )}
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {slides.map((template, i) => (
                        <motion.div
                          key={template.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.02 }}
                        >
                          <div className="flex items-center gap-3 rounded-lg border border-border p-2 hover:bg-secondary/30 transition-colors">
                            <div className="w-24 aspect-video rounded bg-background overflow-hidden shrink-0">
                              <ScaledSlide>
                                <SlideRenderer blockType={template.block_type} content={template.content} theme={getThemeForCategory(category)} />
                              </ScaledSlide>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{template.name.replace(`${category} — `, "")}</p>
                              <p className="text-[11px] text-muted-foreground capitalize">{template.block_type}</p>
                            </div>
                            {template.is_premium && (
                              <Badge variant="secondary" className="text-[10px] gap-0.5 shrink-0">
                                <Sparkles className="w-2.5 h-2.5" /> Pro
                              </Badge>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} feature="Premium templates" />
      </div>
    </DashboardLayout>
  );
}
