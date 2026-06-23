import { useMemo, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info } from "lucide-react";

// Tone types and their colors (HSL values matching design system)
export type SlideTone = "persuasive" | "informational" | "emotional" | "action" | "storytelling";

export interface SlideMetrics {
  id: string;
  title: string;
  tone: SlideTone;
  wordCount: number;
  estimatedSeconds: number;
  flowScore: number; // 0-1, how smooth the transition is to next slide
}

const toneColors: Record<SlideTone, { hue: number; sat: number; light: number; label: string; emoji: string }> = {
  persuasive: { hue: 38, sat: 92, light: 50, label: "Persuasive", emoji: "🟡" },
  informational: { hue: 217, sat: 91, light: 60, label: "Informational", emoji: "🔵" },
  emotional: { hue: 271, sat: 81, light: 56, label: "Emotional", emoji: "🟣" },
  action: { hue: 160, sat: 84, light: 39, label: "Call to Action", emoji: "🟢" },
  storytelling: { hue: 330, sat: 81, light: 60, label: "Storytelling", emoji: "🩷" },
};

// Analyze slide content to determine tone (heuristic-based)
export function analyzeSlideContent(content: any, blockType: string): SlideTone {
  const text = JSON.stringify(content).toLowerCase();

  if (blockType === "cta" || text.includes("call to action") || text.includes("sign up") || text.includes("get started")) return "action";
  if (text.includes("story") || text.includes("journey") || text.includes("once upon") || blockType === "quote") return "storytelling";
  if (text.includes("feel") || text.includes("impact") || text.includes("transform") || text.includes("imagine")) return "emotional";
  if (text.includes("data") || text.includes("chart") || text.includes("metrics") || text.includes("analysis") || blockType === "chart" || blockType === "table") return "informational";
  return "persuasive";
}

export function getSlideMetrics(slides: Array<{ id: string; content: any; block_type: string; notes?: string | null }>): SlideMetrics[] {
  return slides.map((slide, i) => {
    const text = JSON.stringify(slide.content);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const tone = analyzeSlideContent(slide.content, slide.block_type);
    const title = (slide.content as any)?.heading || (slide.content as any)?.title || `Slide ${i + 1}`;

    return {
      id: slide.id,
      title: typeof title === "string" ? title : `Slide ${i + 1}`,
      tone,
      wordCount,
      estimatedSeconds: Math.max(15, Math.round(wordCount / 2.5)), // ~150 WPM
      flowScore: 0.5 + Math.random() * 0.5, // placeholder until real analysis
    };
  });
}

interface SlideDNAProps {
  metrics: SlideMetrics[];
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onSlideClick?: (slideId: string) => void;
  className?: string;
  animated?: boolean;
  showLegend?: boolean;
  showInfo?: boolean;
}

export default function SlideDNA({
  metrics,
  size = "md",
  interactive = false,
  onSlideClick,
  className = "",
  animated = true,
  showLegend = false,
  showInfo = false,
}: SlideDNAProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tappedIndex, setTappedIndex] = useState<number | null>(null);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(300);

  // Measure container width for responsive rendering
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const heights = { sm: 36, md: 64, lg: 120 };
  const height = heights[size];
  const padding = 12;
  const availableWidth = containerWidth - padding * 2;
  const segmentWidth = metrics.length > 0 ? Math.max(8, Math.min(60, availableWidth / metrics.length)) : 20;
  const svgWidth = padding * 2 + metrics.length * segmentWidth;

  // Use a unique ID per instance to avoid SVG gradient conflicts
  const instanceId = useRef(`dna-${Math.random().toString(36).slice(2, 8)}`).current;

  const ribbonPath = useMemo(() => {
    if (metrics.length === 0) return { path: "", gradientStops: [], segments: [] };

    const maxWords = Math.max(...metrics.map((m) => m.wordCount), 1);
    const midY = height / 2;
    const points: Array<{ x: number; y1: number; y2: number; color: typeof toneColors.persuasive }> = [];

    metrics.forEach((m, i) => {
      const x = padding + i * segmentWidth + segmentWidth / 2;
      const thickness = 4 + (m.wordCount / maxWords) * (height * 0.35);
      const color = toneColors[m.tone];
      points.push({ x, y1: midY - thickness, y2: midY + thickness, color });
    });

    // Build smooth top path
    let topPath = `M ${points[0].x} ${points[0].y1}`;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      topPath += ` C ${cpx} ${prev.y1}, ${cpx} ${curr.y1}, ${curr.x} ${curr.y1}`;
    }

    // Close the shape: top forward, bottom backward
    const reversedBottom = [...points].reverse();
    let closingPath = ` L ${reversedBottom[0].x} ${reversedBottom[0].y2}`;
    for (let i = 1; i < reversedBottom.length; i++) {
      const prev = reversedBottom[i - 1];
      const curr = reversedBottom[i];
      const cpx = (prev.x + curr.x) / 2;
      closingPath += ` C ${cpx} ${prev.y2}, ${cpx} ${curr.y2}, ${curr.x} ${curr.y2}`;
    }
    closingPath += " Z";

    const fullPath = topPath + closingPath;

    const gradientStops = points.map((p, i) => ({
      offset: `${(i / Math.max(points.length - 1, 1)) * 100}%`,
      color: `hsl(${p.color.hue}, ${p.color.sat}%, ${p.color.light}%)`,
    }));

    const segments = points.map((p, i) => ({
      x: p.x,
      y: midY,
      metric: metrics[i],
    }));

    return { path: fullPath, gradientStops, segments };
  }, [metrics, height, segmentWidth]);

  const activeIndex = tappedIndex ?? hoveredIndex;

  // Clear tap on outside interaction
  const handleTap = (i: number) => {
    if (tappedIndex === i) {
      // Tapping same segment again navigates
      onSlideClick?.(metrics[i].id);
      setTappedIndex(null);
    } else {
      setTappedIndex(i);
    }
  };

  if (metrics.length === 0) {
    return (
      <div className={`flex items-center justify-center text-muted-foreground text-xs ${className}`} style={{ height }}>
        No slides to analyze
      </div>
    );
  }

  // Compute tone distribution for info panel
  const toneCounts = metrics.reduce((acc, m) => {
    acc[m.tone] = (acc[m.tone] || 0) + 1;
    return acc;
  }, {} as Record<SlideTone, number>);

  const totalTime = metrics.reduce((sum, m) => sum + m.estimatedSeconds, 0);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Info button */}
      {showInfo && (
        <button
          onClick={() => setShowInfoPanel((v) => !v)}
          className="absolute -top-1 right-0 z-20 w-5 h-5 rounded-full bg-secondary/80 border border-border flex items-center justify-center hover:bg-secondary transition-colors"
          aria-label="What is Slide DNA?"
        >
          <Info className="w-3 h-3 text-muted-foreground" />
        </button>
      )}

      {/* Info panel */}
      <AnimatePresence>
        {showInfoPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-2"
          >
            <div className="rounded-lg bg-card border border-border p-3 text-xs space-y-2.5">
              <p className="font-semibold text-foreground text-[11px]">📊 What is Slide DNA?</p>
              <p className="text-muted-foreground leading-relaxed">
                This ribbon visualizes the <span className="text-foreground font-medium">tone and pacing</span> of your entire presentation at a glance. Each segment represents one slide — the <span className="text-foreground font-medium">color</span> shows its detected tone and the <span className="text-foreground font-medium">thickness</span> shows how content-heavy it is.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                A good deck has <span className="text-foreground font-medium">color variety</span> (mixed tones) and <span className="text-foreground font-medium">balanced thickness</span> (even pacing). Tap a segment to see details, tap again to jump to that slide.
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 border-t border-border">
                {Object.entries(toneColors).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground py-0.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: `hsl(${val.hue}, ${val.sat}%, ${val.light}%)` }}
                    />
                    <span>{val.label}</span>
                    {toneCounts[key as SlideTone] && (
                      <span className="ml-auto text-foreground font-medium">{toneCounts[key as SlideTone]}</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">
                Est. total time: <span className="text-foreground font-medium">{Math.round(totalTime / 60)}m {totalTime % 60}s</span> · {metrics.length} slides
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SVG Ribbon — horizontally scrollable on overflow */}
      <div className="w-full overflow-x-auto scrollbar-none rounded-lg">
        <svg
          viewBox={`0 0 ${svgWidth} ${height}`}
          className="w-full min-w-0"
          style={{ height, minWidth: metrics.length > 15 ? svgWidth : undefined }}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`${instanceId}-grad`} x1="0%" y1="0%" x2="100%" y2="0%">
              {ribbonPath.gradientStops.map((stop, i) => (
                <stop key={i} offset={stop.offset} stopColor={stop.color} stopOpacity={0.85} />
              ))}
            </linearGradient>
            <linearGradient id={`${instanceId}-glow`} x1="0%" y1="0%" x2="100%" y2="0%">
              {ribbonPath.gradientStops.map((stop, i) => (
                <stop key={i} offset={stop.offset} stopColor={stop.color} stopOpacity={0.3} />
              ))}
            </linearGradient>
            <filter id={`${instanceId}-blur`}>
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Glow layer */}
          <motion.path
            d={ribbonPath.path}
            fill={`url(#${instanceId}-glow)`}
            filter={`url(#${instanceId}-blur)`}
            initial={animated ? { pathLength: 0, opacity: 0 } : undefined}
            animate={animated ? { pathLength: 1, opacity: 1 } : undefined}
            transition={{ duration: 1.5, ease: "easeInOut" }}
          />

          {/* Main ribbon */}
          <motion.path
            d={ribbonPath.path}
            fill={`url(#${instanceId}-grad)`}
            initial={animated ? { pathLength: 0, opacity: 0 } : undefined}
            animate={animated ? { pathLength: 1, opacity: 1 } : undefined}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          />

          {/* Interactive hit zones */}
          {interactive &&
            ribbonPath.segments.map((seg, i) => (
              <g key={seg.metric.id}>
                <rect
                  x={seg.x - segmentWidth / 2}
                  y={0}
                  width={segmentWidth}
                  height={height}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => handleTap(i)}
                />
                {/* Node dot */}
                <motion.circle
                  cx={seg.x}
                  cy={seg.y}
                  r={activeIndex === i ? 5 : 3}
                  fill="white"
                  opacity={activeIndex === i ? 1 : 0.6}
                  initial={animated ? { scale: 0 } : undefined}
                  animate={animated ? { scale: 1 } : undefined}
                  transition={{ delay: 0.3 + i * 0.05 }}
                />
              </g>
            ))}
        </svg>
      </div>

      {/* Active segment detail (touch-friendly) */}
      <AnimatePresence>
        {interactive && activeIndex !== null && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-1.5 px-2.5 py-2 rounded-lg bg-card border border-border shadow-lg text-xs flex items-center gap-3"
          >
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{
                backgroundColor: `hsl(${toneColors[metrics[activeIndex].tone].hue}, ${toneColors[metrics[activeIndex].tone].sat}%, ${toneColors[metrics[activeIndex].tone].light}%)`,
              }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">
                {metrics[activeIndex].title}
              </p>
              <p className="text-muted-foreground">
                {toneColors[metrics[activeIndex].tone].label} · {metrics[activeIndex].wordCount} words · ~{Math.round(metrics[activeIndex].estimatedSeconds / 60)}m {metrics[activeIndex].estimatedSeconds % 60}s
              </p>
            </div>
            {tappedIndex !== null && (
              <span className="text-[9px] text-primary font-medium whitespace-nowrap">Tap again to go →</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline legend */}
      {(showLegend || size === "lg") && (
        <div className="flex flex-wrap items-center gap-2.5 mt-2 px-1">
          {Object.entries(toneColors).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: `hsl(${val.hue}, ${val.sat}%, ${val.light}%)` }}
              />
              {val.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Demo data for landing page showcase
export const demoSlideMetrics: SlideMetrics[] = [
  { id: "1", title: "Opening Hook", tone: "storytelling", wordCount: 45, estimatedSeconds: 30, flowScore: 0.9 },
  { id: "2", title: "The Problem", tone: "emotional", wordCount: 80, estimatedSeconds: 45, flowScore: 0.85 },
  { id: "3", title: "Market Size", tone: "informational", wordCount: 120, estimatedSeconds: 60, flowScore: 0.7 },
  { id: "4", title: "Our Solution", tone: "persuasive", wordCount: 95, estimatedSeconds: 50, flowScore: 0.9 },
  { id: "5", title: "How It Works", tone: "informational", wordCount: 150, estimatedSeconds: 75, flowScore: 0.8 },
  { id: "6", title: "Traction", tone: "persuasive", wordCount: 70, estimatedSeconds: 40, flowScore: 0.75 },
  { id: "7", title: "Team", tone: "storytelling", wordCount: 55, estimatedSeconds: 35, flowScore: 0.85 },
  { id: "8", title: "The Vision", tone: "emotional", wordCount: 60, estimatedSeconds: 40, flowScore: 0.9 },
  { id: "9", title: "Financials", tone: "informational", wordCount: 130, estimatedSeconds: 65, flowScore: 0.7 },
  { id: "10", title: "The Ask", tone: "action", wordCount: 40, estimatedSeconds: 25, flowScore: 0.95 },
];
