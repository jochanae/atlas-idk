import { useState, useMemo } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Star, Download, Sparkles, Grid3X3, List, X, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ScaledSlide from "@/components/editor/ScaledSlide";
import SlideRenderer from "@/components/editor/SlideRenderer";
import { useSlideTemplates } from "@/hooks/useSlideTemplates";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PRESET_THEMES } from "@/lib/slideThemes";
import { toast } from "sonner";

interface Rating {
  id: string;
  template_id: string;
  user_id: string;
  rating: number;
  review: string | null;
  created_at: string;
}

function useTemplateRatings() {
  return useQuery({
    queryKey: ["template-ratings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("template_ratings" as any)
        .select("*");
      if (error) throw error;
      return (data || []) as unknown as Rating[];
    },
  });
}

function useRateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, rating, review }: { templateId: string; rating: number; review?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("template_ratings" as any)
        .upsert({ template_id: templateId, user_id: user.id, rating, review } as any, { onConflict: "template_id,user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["template-ratings"] });
      toast.success("Rating submitted!");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

function StarRating({ value, onChange, size = "sm" }: { value: number; onChange?: (v: number) => void; size?: "sm" | "md" }) {
  const s = size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          onClick={() => onChange?.(i)}
          disabled={!onChange}
          className={`${onChange ? "cursor-pointer hover:scale-110" : "cursor-default"} transition-transform`}
        >
          <Star className={`${s} ${i <= value ? "text-primary fill-primary" : "text-muted-foreground/30"}`} />
        </button>
      ))}
    </div>
  );
}

export default function MarketplacePage() {
  const navigate = useNavigate();
  const { data: templates = [], isLoading } = useSlideTemplates();
  const { data: ratings = [] } = useTemplateRatings();
  const rateTemplate = useRateTemplate();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [ratingDialog, setRatingDialog] = useState<string | null>(null);
  const [myRating, setMyRating] = useState(5);
  const [myReview, setMyReview] = useState("");

  // Group ratings by template
  const ratingMap = useMemo(() => {
    const map = new Map<string, { avg: number; count: number }>();
    const grouped = new Map<string, number[]>();
    ratings.forEach((r) => {
      const arr = grouped.get(r.template_id) || [];
      arr.push(r.rating);
      grouped.set(r.template_id, arr);
    });
    grouped.forEach((vals, id) => {
      map.set(id, { avg: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length });
    });
    return map;
  }, [ratings]);

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter((t) =>
      t.name.toLowerCase().includes(q) ||
      t.block_type.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    );
  }, [templates, search]);

  // Sort by rating
  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => {
      const ra = ratingMap.get(a.id)?.avg || 0;
      const rb = ratingMap.get(b.id)?.avg || 0;
      return rb - ra;
    }),
    [filtered, ratingMap]
  );

  const handleRate = async () => {
    if (!ratingDialog) return;
    await rateTemplate.mutateAsync({ templateId: ratingDialog, rating: myRating, review: myReview || undefined });
    setRatingDialog(null);
    setMyRating(5);
    setMyReview("");
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" /> Template Marketplace
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {templates.length} templates · Community rated & curated
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-8 h-8 text-sm w-48" />
              {search && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>
            <div className="flex border border-border rounded-md">
              <button className={`p-1.5 ${viewMode === "grid" ? "bg-secondary" : ""}`} onClick={() => setViewMode("grid")}>
                <Grid3X3 className="w-3.5 h-3.5" />
              </button>
              <button className={`p-1.5 ${viewMode === "list" ? "bg-secondary" : ""}`} onClick={() => setViewMode("list")}>
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner size="md" text="Loading marketplace…" /></div>
        ) : sorted.length === 0 ? (
          <Card className="p-12 text-center">
            <Sparkles className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="font-semibold mb-1">No templates found</h3>
            <p className="text-sm text-muted-foreground">Try a different search term.</p>
          </Card>
        ) : (
          <div className={viewMode === "grid" ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" : "space-y-2"}>
            {sorted.map((template, i) => {
              const rating = ratingMap.get(template.id);
              return viewMode === "grid" ? (
                <motion.div key={template.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
                  <Card className="overflow-hidden group hover:ring-2 hover:ring-primary/20 transition-all">
                    <div className="aspect-video bg-background">
                      <ScaledSlide>
                        <SlideRenderer blockType={template.block_type} content={template.content} theme={PRESET_THEMES[0]} />
                      </ScaledSlide>
                    </div>
                    <CardContent className="p-3 space-y-2">
                      <p className="text-sm font-medium truncate">{template.name}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <StarRating value={Math.round(rating?.avg || 0)} />
                          {rating && <span className="text-[10px] text-muted-foreground">({rating.count})</span>}
                        </div>
                        <Badge variant="secondary" className="text-[10px]">{template.category}</Badge>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs h-7"
                          onClick={() => { setRatingDialog(template.id); setMyRating(5); }}
                        >
                          <Star className="w-3 h-3 mr-1" /> Rate
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 text-xs h-7 bg-gradient-gold text-primary-foreground"
                          onClick={() => navigate(`/templates`)}
                        >
                          <Download className="w-3 h-3 mr-1" /> Use
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : (
                <motion.div key={template.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.01 }}>
                  <div className="flex items-center gap-3 rounded-lg border border-border p-2 hover:bg-secondary/30 transition-colors">
                    <div className="w-24 aspect-video rounded bg-background overflow-hidden shrink-0">
                      <ScaledSlide>
                        <SlideRenderer blockType={template.block_type} content={template.content} theme={PRESET_THEMES[0]} />
                      </ScaledSlide>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{template.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <StarRating value={Math.round(rating?.avg || 0)} />
                        {rating && <span className="text-[10px] text-muted-foreground">({rating.count})</span>}
                        <Badge variant="secondary" className="text-[10px]">{template.category}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setRatingDialog(template.id)}>
                        <Star className="w-3 h-3" />
                      </Button>
                      <Button size="sm" className="h-7 text-xs bg-gradient-gold text-primary-foreground" onClick={() => navigate("/templates")}>
                        Use
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Rating Dialog */}
        <Dialog open={!!ratingDialog} onOpenChange={(o) => !o && setRatingDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Rate Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="flex justify-center">
                <StarRating value={myRating} onChange={setMyRating} size="md" />
              </div>
              <div>
                <Label className="text-xs">Review (optional)</Label>
                <Textarea
                  value={myReview}
                  onChange={(e) => setMyReview(e.target.value)}
                  placeholder="Share your thoughts..."
                  className="mt-1"
                  rows={3}
                />
              </div>
              <Button onClick={handleRate} disabled={rateTemplate.isPending} className="w-full bg-gradient-gold text-primary-foreground">
                {rateTemplate.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Star className="w-4 h-4 mr-2" />}
                Submit Rating
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
