import { motion, AnimatePresence } from "framer-motion";
import {
  Type, Image, BarChart2, Quote, GitCompare, Target,
  BookOpen, MessageSquareQuote, Video, Table2, LayoutTemplate,
  Wand2, Palette, Copy, Sparkles, ArrowUpDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { useIsMobile } from "@/hooks/use-mobile";

interface ContextualToolbarProps {
  blockType: string;
  content: Record<string, unknown>;
  onUpdate: (content: Json, notes?: string) => void;
  notes?: string | null;
}

const blockMeta: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  title: { icon: Type, label: "Title Slide", color: "text-blue-500" },
  story: { icon: BookOpen, label: "Story", color: "text-emerald-500" },
  framework: { icon: LayoutTemplate, label: "Framework", color: "text-violet-500" },
  data: { icon: BarChart2, label: "Data Point", color: "text-amber-500" },
  cta: { icon: Target, label: "Call to Action", color: "text-rose-500" },
  quote: { icon: Quote, label: "Quote", color: "text-cyan-500" },
  comparison: { icon: GitCompare, label: "Comparison", color: "text-orange-500" },
  testimonial: { icon: MessageSquareQuote, label: "Testimonial", color: "text-pink-500" },
  video: { icon: Video, label: "Video", color: "text-red-500" },
  chart: { icon: BarChart2, label: "Chart", color: "text-indigo-500" },
  table: { icon: Table2, label: "Table", color: "text-teal-500" },
};

function QuickAction({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 text-xs"
      onClick={onClick}
    >
      <Icon className="w-3 h-3" />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

export default function ContextualToolbar({ blockType, content, onUpdate, notes }: ContextualToolbarProps) {
  const isMobile = useIsMobile();
  const meta = blockMeta[blockType] || blockMeta.title;
  const Icon = meta.icon;

  // Hide on mobile — too small
  if (isMobile) return null;

  const handleSwapLayout = () => {
    const layouts = ["center", "left", "right"];
    const current = (content.layout as string) || "center";
    const next = layouts[(layouts.indexOf(current) + 1) % layouts.length];
    onUpdate({ ...content, layout: next } as Json, notes ?? undefined);
    toast.success(`Layout: ${next}`);
  };

  const handleAddImage = () => {
    if (content.imageUrl) {
      const { imageUrl: _, ...rest } = content;
      onUpdate(rest as Json, notes ?? undefined);
      toast.success("Image removed");
    } else {
      toast.info("Use the Properties panel → Image section to add an image");
    }
  };

  const contextActions: Record<string, React.ReactNode> = {
    title: (
      <>
        <QuickAction icon={ArrowUpDown} label="Layout" onClick={handleSwapLayout} />
        <QuickAction icon={Image} label={content.imageUrl ? "Remove Image" : "Add Image"} onClick={handleAddImage} />
      </>
    ),
    story: (
      <>
        <QuickAction icon={ArrowUpDown} label="Layout" onClick={handleSwapLayout} />
        <QuickAction icon={Image} label={content.imageUrl ? "Remove Image" : "Add Image"} onClick={handleAddImage} />
      </>
    ),
    data: (
      <>
        <QuickAction icon={ArrowUpDown} label="Layout" onClick={handleSwapLayout} />
        <QuickAction icon={Sparkles} label="Format Metric" onClick={() => {
          const metric = content.metric as string || "";
          const num = parseFloat(metric.replace(/[^0-9.]/g, ""));
          if (!isNaN(num)) {
            onUpdate({ ...content, metric: num >= 1000 ? `${(num / 1000).toFixed(1)}K` : `${num}%` } as Json, notes ?? undefined);
          }
        }} />
      </>
    ),
    chart: (
      <>
        <QuickAction icon={Palette} label="Cycle Type" onClick={() => {
          const types = ["bar", "line", "pie", "donut"];
          const current = (content.chartType as string) || "bar";
          const next = types[(types.indexOf(current) + 1) % types.length];
          onUpdate({ ...content, chartType: next } as Json, notes ?? undefined);
          toast.success(`Chart: ${next}`);
        }} />
      </>
    ),
    comparison: (
      <>
        <QuickAction icon={Copy} label="Mirror" onClick={() => {
          const left = content.left as Record<string, unknown>;
          const right = content.right as Record<string, unknown>;
          if (left && right) {
            onUpdate({ ...content, left: right, right: left } as unknown as Json, notes ?? undefined);
            toast.success("Sides swapped");
          }
        }} />
      </>
    ),
    quote: (
      <>
        <QuickAction icon={ArrowUpDown} label="Layout" onClick={handleSwapLayout} />
      </>
    ),
    cta: (
      <>
        <QuickAction icon={ArrowUpDown} label="Layout" onClick={handleSwapLayout} />
      </>
    ),
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={blockType}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="absolute top-3 left-1/2 -translate-x-1/2 z-20"
      >
        <div className="flex items-center gap-1 bg-card/95 backdrop-blur-sm border border-border rounded-full px-3 py-1 shadow-lg">
          <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
          <span className="text-xs font-medium text-muted-foreground mr-1">{meta.label}</span>
          <div className="w-px h-4 bg-border" />
          {contextActions[blockType] || (
            <QuickAction icon={ArrowUpDown} label="Layout" onClick={handleSwapLayout} />
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
