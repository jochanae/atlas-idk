import { useState, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { motion } from "framer-motion";
import { Search, Shapes, Star, Heart, ArrowRight, Zap, Shield, Trophy, Users, Globe, Rocket, Target, Lightbulb, TrendingUp, CheckCircle2, Clock, BarChart3, PieChart, Layers, Settings, BookOpen, MessageSquare, Phone, Mail, MapPin, Calendar, Camera, Music, Play, Wifi, Cloud, Database, Lock, Unlock, Eye, ThumbsUp, Award, Flag, Compass, Anchor, Feather, Sun, Moon, Loader2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { useApprovedImages } from "@/hooks/useApprovedImages";

interface VisualAssetLibraryProps {
  open: boolean;
  onClose: () => void;
  onInsertSvg: (svgDataUrl: string) => void;
  onSelectImage?: (imageUrl: string) => void;
}

type AssetCategory = "popular" | "business" | "data" | "social" | "nature" | "tech" | "shapes" | "approved";

interface IconAsset {
  name: string;
  icon: React.ElementType;
  category: AssetCategory;
  tags: string[];
}

const ICON_ASSETS: IconAsset[] = [
  // Popular
  { name: "Star", icon: Star, category: "popular", tags: ["star", "favorite", "rating"] },
  { name: "Heart", icon: Heart, category: "popular", tags: ["heart", "love", "like"] },
  { name: "Arrow Right", icon: ArrowRight, category: "popular", tags: ["arrow", "next", "forward"] },
  { name: "Zap", icon: Zap, category: "popular", tags: ["lightning", "energy", "fast"] },
  { name: "Check", icon: CheckCircle2, category: "popular", tags: ["check", "done", "success"] },
  { name: "Target", icon: Target, category: "popular", tags: ["target", "goal", "aim"] },
  { name: "Lightbulb", icon: Lightbulb, category: "popular", tags: ["idea", "light", "innovation"] },
  { name: "Rocket", icon: Rocket, category: "popular", tags: ["rocket", "launch", "growth"] },
  // Business
  { name: "Trophy", icon: Trophy, category: "business", tags: ["trophy", "win", "achievement"] },
  { name: "Award", icon: Award, category: "business", tags: ["award", "medal", "recognition"] },
  { name: "Users", icon: Users, category: "business", tags: ["team", "people", "group"] },
  { name: "Trending Up", icon: TrendingUp, category: "business", tags: ["growth", "trending", "increase"] },
  { name: "Shield", icon: Shield, category: "business", tags: ["security", "protection", "safe"] },
  { name: "Flag", icon: Flag, category: "business", tags: ["flag", "milestone", "mark"] },
  { name: "Compass", icon: Compass, category: "business", tags: ["compass", "direction", "navigate"] },
  { name: "Globe", icon: Globe, category: "business", tags: ["globe", "world", "international"] },
  // Data
  { name: "Bar Chart", icon: BarChart3, category: "data", tags: ["chart", "bar", "analytics"] },
  { name: "Pie Chart", icon: PieChart, category: "data", tags: ["chart", "pie", "data"] },
  { name: "Layers", icon: Layers, category: "data", tags: ["layers", "stack", "levels"] },
  { name: "Database", icon: Database, category: "data", tags: ["database", "storage", "data"] },
  { name: "Clock", icon: Clock, category: "data", tags: ["clock", "time", "schedule"] },
  { name: "Settings", icon: Settings, category: "data", tags: ["settings", "gear", "config"] },
  // Social
  { name: "Message", icon: MessageSquare, category: "social", tags: ["message", "chat", "comment"] },
  { name: "Phone", icon: Phone, category: "social", tags: ["phone", "call", "contact"] },
  { name: "Mail", icon: Mail, category: "social", tags: ["email", "mail", "message"] },
  { name: "Location", icon: MapPin, category: "social", tags: ["location", "map", "pin"] },
  { name: "Calendar", icon: Calendar, category: "social", tags: ["calendar", "date", "event"] },
  { name: "Thumbs Up", icon: ThumbsUp, category: "social", tags: ["like", "approve", "good"] },
  { name: "Eye", icon: Eye, category: "social", tags: ["eye", "view", "watch"] },
  // Nature
  { name: "Sun", icon: Sun, category: "nature", tags: ["sun", "bright", "day"] },
  { name: "Moon", icon: Moon, category: "nature", tags: ["moon", "night", "dark"] },
  { name: "Cloud", icon: Cloud, category: "nature", tags: ["cloud", "weather", "sky"] },
  { name: "Feather", icon: Feather, category: "nature", tags: ["feather", "light", "nature"] },
  { name: "Anchor", icon: Anchor, category: "nature", tags: ["anchor", "ship", "stable"] },
  // Tech
  { name: "Wifi", icon: Wifi, category: "tech", tags: ["wifi", "internet", "connected"] },
  { name: "Lock", icon: Lock, category: "tech", tags: ["lock", "secure", "private"] },
  { name: "Unlock", icon: Unlock, category: "tech", tags: ["unlock", "open", "access"] },
  { name: "Camera", icon: Camera, category: "tech", tags: ["camera", "photo", "image"] },
  { name: "Music", icon: Music, category: "tech", tags: ["music", "audio", "sound"] },
  { name: "Play", icon: Play, category: "tech", tags: ["play", "video", "start"] },
  { name: "Book", icon: BookOpen, category: "tech", tags: ["book", "read", "learn"] },
  // Shapes
  { name: "Circle", icon: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg>, category: "shapes", tags: ["circle", "shape"] },
  { name: "Square", icon: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>, category: "shapes", tags: ["square", "shape"] },
  { name: "Triangle", icon: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12,2 22,22 2,22" /></svg>, category: "shapes", tags: ["triangle", "shape"] },
  { name: "Diamond", icon: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12,2 22,12 12,22 2,12" /></svg>, category: "shapes", tags: ["diamond", "shape"] },
  { name: "Hexagon", icon: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12,2 21,7 21,17 12,22 3,17 3,7" /></svg>, category: "shapes", tags: ["hexagon", "shape"] },
  { name: "Pentagon", icon: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12,2 22,9 19,21 5,21 2,9" /></svg>, category: "shapes", tags: ["pentagon", "shape"] },
];

const CATEGORIES: { id: AssetCategory; label: string }[] = [
  { id: "popular", label: "Popular" },
  { id: "business", label: "Business" },
  { id: "data", label: "Data" },
  { id: "social", label: "Social" },
  { id: "nature", label: "Nature" },
  { id: "tech", label: "Tech" },
  { id: "shapes", label: "Shapes" },
  { id: "approved", label: "My Library" },
];

const ICON_COLORS = [
  "#D4AF37", "#ffffff", "#000000", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899",
];

export default function VisualAssetLibrary({ open, onClose, onInsertSvg, onSelectImage }: VisualAssetLibraryProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<AssetCategory>("popular");
  const [iconColor, setIconColor] = useState("#D4AF37");
  const [iconSize, setIconSize] = useState(64);
  const isMobile = useIsMobile();
  const { data: approvedImages = [] } = useApprovedImages();

  const filtered = useMemo(() => {
    let items = ICON_ASSETS;
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((a) => a.name.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q)));
    } else if (category !== "approved") {
      items = items.filter((a) => a.category === category);
    } else {
      return []; // Approved images handled separately
    }
    return items;
  }, [search, category]);

  const renderAssetToDataUrl = (asset: IconAsset): Promise<string> => {
    return new Promise((resolve) => {
      const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="${iconColor === "#ffffff" ? "white" : iconColor}" stroke="${iconColor === "#ffffff" ? "white" : iconColor}" stroke-width="0">
        ${getIconPath(asset)}
      </svg>`;

      const img = new window.Image();
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = iconSize * 2;
        canvas.height = iconSize * 2;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(""); return; }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/png");
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      };
      img.src = url;
    });
  };

  const handleInsert = async (asset: IconAsset) => {
    const dataUrl = await renderAssetToDataUrl(asset);
    if (dataUrl) {
      onInsertSvg(dataUrl);
      onClose();
      toast.success(`${asset.name} added — tap it on the slide to move or resize`);
    }
  };

  const handleDragStart = (e: React.DragEvent, asset: IconAsset) => {
    // Build an inline SVG data URL synchronously for drag transfer
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="${iconColor === "#ffffff" ? "white" : iconColor}" stroke="${iconColor === "#ffffff" ? "white" : iconColor}" stroke-width="0">${getIconPath(asset)}</svg>`;
    const dataUrl = `data:image/svg+xml;base64,${btoa(svgString)}`;
    e.dataTransfer.setData("application/x-presentq-overlay", JSON.stringify({ src: dataUrl, width: 300, height: 300 }));
    e.dataTransfer.effectAllowed = "copy";
  };

  const getIconPath = (asset: IconAsset): string => {
    const shapePathMap: Record<string, string> = {
      "Circle": '<circle cx="12" cy="12" r="10" />',
      "Square": '<rect x="3" y="3" width="18" height="18" rx="2" />',
      "Triangle": '<polygon points="12,2 22,22 2,22" />',
      "Diamond": '<polygon points="12,2 22,12 12,22 2,12" />',
      "Hexagon": '<polygon points="12,2 21,7 21,17 12,22 3,17 3,7" />',
      "Pentagon": '<polygon points="12,2 22,9 19,21 5,21 2,9" />',
      "Star": '<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />',
      "Heart": '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />',
      "Arrow Right": '<path d="M5 12h14M12 5l7 7-7 7" />',
      "Zap": '<polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />',
      "Check": '<path d="M20 6L9 17l-5-5" />',
      "Target": '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
      "Lightbulb": '<path d="M9 18h6M10 22h4M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>',
      "Rocket": '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
      "Trophy": '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z"/>',
      "Users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
      "Trending Up": '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
      "Globe": '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
      "Bar Chart": '<path d="M12 20V10M18 20V4M6 20v-4"/>',
      "Pie Chart": '<path d="M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z"/>',
      "Message": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
      "Mail": '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
      "Location": '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="12" r="3"/>',
      "Settings": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      "Sun": '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    };
    return shapePathMap[asset.name] || '<circle cx="12" cy="12" r="8" />';
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side={isMobile ? "bottom" : "right"} className={isMobile ? "h-[85dvh] rounded-t-2xl p-0" : "w-80 p-0"}>
        <SheetHeader className="p-3 border-b border-border">
          <SheetTitle className="text-sm flex items-center gap-2">
            <Shapes className="w-4 h-4 text-primary" />
            Visual Asset Library
          </SheetTitle>
        </SheetHeader>

        <div className="p-3 space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search icons & shapes..."
            className="h-8 text-xs"
          />

          {!search && (
            <div className="flex gap-1 flex-wrap">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`text-[10px] px-2 py-1 rounded-full transition-all ${
                    category === c.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {/* Color picker (only for icons/shapes) */}
          {category !== "approved" && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Color:</span>
              {ICON_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setIconColor(c)}
                  className={`w-4 h-4 rounded-full border transition-all ${
                    iconColor === c ? "border-primary scale-125" : "border-border"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}
        </div>

        <ScrollArea className="h-[calc(100vh-220px)]">
          <div className="grid grid-cols-4 gap-2 p-3">
            {category === "approved" ? (
              approvedImages.map((img: any) => (
                <motion.button
                  key={img.id}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    if (onSelectImage) {
                      onSelectImage(img.file_url);
                      onClose();
                      toast.success("Image added to slide");
                    } else {
                      // If no onSelectImage, insert as draggable overlay
                      onInsertSvg(img.file_url);
                      onClose();
                      toast.success("Image added as overlay");
                    }
                  }}
                  className="flex flex-col items-center gap-1 p-1 rounded-lg border border-border hover:border-primary/50 hover:bg-secondary/50 transition-all group w-full"
                >
                  <div className="aspect-square w-full rounded overflow-hidden bg-muted">
                    <img src={img.file_url} alt={img.name} className="w-full h-full object-cover" />
                  </div>
                  <span className="text-[8px] text-muted-foreground group-hover:text-foreground truncate w-full text-center">
                    {img.name}
                  </span>
                </motion.button>
              ))
            ) : (
              filtered.map((asset) => {
                const Icon = asset.icon;
                return (
                  <div
                    key={asset.name}
                    draggable
                    onDragStart={(e) => handleDragStart(e, asset)}
                  >
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleInsert(asset)}
                      className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-secondary/50 transition-all group w-full"
                      title={asset.name}
                    >
                      <Icon className="w-6 h-6" style={{ color: iconColor }} />
                      <span className="text-[8px] text-muted-foreground group-hover:text-foreground truncate w-full text-center">
                        {asset.name}
                      </span>
                    </motion.button>
                  </div>
                );
              })
            )}
          </div>
          {category === "approved" && approvedImages.length === 0 && (
            <div className="text-center py-12 px-4">
              <ImageIcon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No approved images found.</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Add them in Dashboard → Resources → Visual Assets</p>
            </div>
          )}
          {category !== "approved" && filtered.length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground">No assets found for "{search}"</div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
