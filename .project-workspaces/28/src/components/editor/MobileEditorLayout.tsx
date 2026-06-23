import { useState, useCallback, useRef, useEffect, useMemo, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Plus, Play, Palette, Mic,
  FileText, Edit3, MoreHorizontal, Copy, Trash2, BookmarkPlus,
  Sparkles, Grid3X3, Brain, List, MessageSquare, BarChart3,
  History, X, Volume2, Timer, Video, ExternalLink, ScrollText,
  Image, Quote, BarChart2, Table2, Type, Send, Loader2, BookOpen,
  Pencil, Shapes, Clapperboard, Check, GripVertical, Layers, GraduationCap,
  ArrowUpDown, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ScaledSlide from "@/components/editor/ScaledSlide";
import SlideRenderer from "@/components/editor/SlideRenderer";
import ContentRadar from "@/components/editor/ContentRadar";
import AutoSuggestSlide from "@/components/editor/AutoSuggestSlide";
import QuickCapture from "@/components/editor/QuickCapture";
import SlideCommentsPanel from "@/components/editor/SlideCommentsPanel";
import VersionHistoryPanel from "@/components/editor/VersionHistoryPanel";
import ThemePanel from "@/components/editor/ThemePanel";
import SlideCoachPanel from "@/components/editor/SlideCoachPanel";
import SlideAudioControls from "@/components/editor/SlideAudioControls";
import PresentationAnalytics from "@/components/editor/PresentationAnalytics";
import SlideResourcesPanel from "@/components/editor/SlideResourcesPanel";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { useArc } from "@/components/arc/ArcProvider";
import type { Slide } from "@/hooks/useSlides";
import { parseArcActions, stripArcActionsBlock, getActionLabel, useApplyArcActions, type ArcAction } from "@/hooks/useArcActions";
import type { SlideTheme, TransitionType } from "@/lib/slideThemes";
import type { Json } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import SlideDNA, { getSlideMetrics } from "@/components/SlideDNA";

// Element options based on current slide type
interface ElementOption {
  key: string;
  label: string;
  icon: React.ElementType;
  defaults: Record<string, unknown>;
}

function getElementOptionsForSlide(blockType: string): ElementOption[] {
  const common: ElementOption[] = [
    { key: "image", label: "Image", icon: Image, defaults: { imageUrl: "" } },
  ];

  switch (blockType) {
    case "title":
      return [
        ...common,
        { key: "subheading", label: "Subtitle", icon: Type, defaults: { subheading: "Add subtitle here" } },
      ];
    case "story":
      return [
        ...common,
        { key: "quote-inline", label: "Quote", icon: Quote, defaults: { body: '> "Add a quote here"\n\n— Attribution' } },
      ];
    case "data":
      return [
        ...common,
        { key: "chart", label: "Chart", icon: BarChart2, defaults: { chartType: "bar", chartData: [{ label: "A", value: 30 }, { label: "B", value: 50 }, { label: "C", value: 20 }] } },
        { key: "table", label: "Table", icon: Table2, defaults: { tableHeaders: ["Column 1", "Column 2"], tableRows: [["Value 1", "Value 2"]] } },
      ];
    case "framework":
      return [
        ...common,
      ];
    case "cta":
      return [
        ...common,
        { key: "contact", label: "Contact Info", icon: MessageSquare, defaults: { contactEmail: "your@email.com", websiteUrl: "https://yoursite.com" } },
      ];
    case "comparison":
      return common;
    case "quote":
      return common;
    default:
      return common;
  }
}

// Re-use the SlideContentEditor and SpeakerScriptPanel from Editor.tsx
// We import them indirectly by accepting callbacks

interface MobileEditorLayoutProps {
  slides: Slide[];
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  activeSlide: Slide | undefined;
  theme: SlideTheme;
  transition: TransitionType;
  presentationId?: string;
  title: string;
  onUpdateSlide: (content: Json, notes?: string) => void;
  onAddSlide: (blockType: string, content: Record<string, unknown>) => void;
  onDeleteSlide: (id: string) => void;
  onDuplicateSlide: (slide: Slide, index: number) => void;
  onPresent: () => void;
  onPractice: () => void;
  onRehearsal: () => void;
  onRecord: () => void;
  onLecture: () => void;
  onTeleprompter: () => void;
  onPipTeleprompter: () => void;
  onBack: () => void;
  onThemeChange: (theme: SlideTheme) => void;
  onTransitionChange: (t: TransitionType) => void;
  onRemix: (slide: Slide) => void;
  onSaveToLibrary: (slide: Slide, index: number) => void;
  onSketch?: () => void;
  onAssetLibrary?: () => void;
  onSketchConverter?: () => void;
  blockTypes: { type: string; label: string; icon: React.ElementType; content: Record<string, unknown> }[];
  renderContentEditor: (slide: Slide) => React.ReactNode;
  renderScriptEditor: (slide: Slide) => React.ReactNode;
  renderImageControls: (slide: Slide) => React.ReactNode;
}

type MobileSheet = "edit" | "notes" | "theme" | "coach" | "comments" | "history" | "slides" | "add" | "arc-inline" | "full-script" | "creative" | "analytics" | "resources" | null;

export default function MobileEditorLayout({
  slides,
  activeIndex,
  setActiveIndex,
  activeSlide,
  theme,
  transition,
  presentationId,
  title,
  onUpdateSlide,
  onAddSlide,
  onDeleteSlide,
  onDuplicateSlide,
  onPresent,
  onPractice,
  onRehearsal,
  onRecord,
  onLecture,
  onTeleprompter,
  onPipTeleprompter,
  onBack,
  onThemeChange,
  onTransitionChange,
  onRemix,
  onSaveToLibrary,
  onSketch,
  onAssetLibrary,
  onSketchConverter,
  blockTypes,
  renderContentEditor,
  renderScriptEditor,
  renderImageControls,
}: MobileEditorLayoutProps) {
  const [activeSheet, setActiveSheet] = useState<MobileSheet>(null);
  const slideMetrics = useMemo(() => getSlideMetrics(slides), [slides]);
  const [showRadar, setShowRadar] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [batchQueue, setBatchQueue] = useState<{ type: string; label: string; icon: React.ElementType; content: Record<string, unknown> }[]>([]);
  const { toggleChat } = useArc();
  const editSheetRef = useRef<HTMLDivElement>(null);
  const notesSheetRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Build full script for all slides
  const fullScriptData = useMemo(() => {
    return slides.map((slide, i) => {
      const c = typeof slide.content === "object" && slide.content !== null && !Array.isArray(slide.content)
        ? (slide.content as Record<string, unknown>) : {};
      return {
        number: i + 1,
        heading: (c.heading as string) || `Slide ${i + 1}`,
        script: (c.speaker_script as string) || "",
        notes: slide.notes || "",
        blockType: slide.block_type,
      };
    });
  }, [slides]);

  const sendToTeleprompter = useCallback(() => {
    const scriptText = fullScriptData.map((d) => {
      const text = d.script || d.notes;
      if (!text) return "";
      return `SLIDE ${d.number}: ${d.heading}\n${text}`;
    }).filter(Boolean).join("\n\n");
    localStorage.setItem("pq_teleprompter_script", scriptText);
    navigate("/teleprompter");
  }, [fullScriptData, navigate]);

  // Scroll sheets to top when they open
  useEffect(() => {
    if (activeSheet === "edit" && editSheetRef.current) {
      editSheetRef.current.scrollTop = 0;
    }
    if (activeSheet === "notes" && notesSheetRef.current) {
      notesSheetRef.current.scrollTop = 0;
    }
  }, [activeSheet]);

  const swipeHandlers = useSwipeNavigation({
    onSwipeLeft: () => { if (activeIndex < slides.length - 1) setActiveIndex(activeIndex + 1); },
    onSwipeRight: () => { if (activeIndex > 0) setActiveIndex(activeIndex - 1); },
  });

  const goNext = () => { if (activeIndex < slides.length - 1) setActiveIndex(activeIndex + 1); };
  const goPrev = () => { if (activeIndex > 0) setActiveIndex(activeIndex - 1); };

  const content = activeSlide && typeof activeSlide.content === "object" && activeSlide.content !== null && !Array.isArray(activeSlide.content)
    ? activeSlide.content as Record<string, unknown>
    : {};

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Top bar */}
      <div className="h-12 border-b border-border flex items-center justify-between px-3 shrink-0 bg-card">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold truncate max-w-[160px]">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setActiveSheet("slides")}>
            <List className="w-4 h-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[70dvh] overflow-y-auto">
              <DropdownMenuItem onClick={onPresent}>
                <Play className="w-3.5 h-3.5 mr-2" />
                <div className="flex flex-col">
                  <span>Present</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Full-screen slideshow</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onPractice}>
                <Timer className="w-3.5 h-3.5 mr-2" />
                <div className="flex flex-col">
                  <span>Practice</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Dry run with pacing timer</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRehearsal}>
                <Mic className="w-3.5 h-3.5 mr-2" />
                <div className="flex flex-col">
                  <span>Rehearse</span>
                  <span className="text-[10px] text-muted-foreground font-normal">AI coaching & delivery metrics</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRecord}>
                <Video className="w-3.5 h-3.5 mr-2" />
                <div className="flex flex-col">
                  <span>Record</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Capture video of your talk</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onLecture}>
                <GraduationCap className="w-3.5 h-3.5 mr-2" />
                <div className="flex flex-col">
                  <span>Lecture Mode</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Slides + webcam PiP overlay</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onTeleprompter}>
                <ScrollText className="w-3.5 h-3.5 mr-2" />
                <div className="flex flex-col">
                  <span>Teleprompter</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Auto-scrolling speaker notes</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onPipTeleprompter}>
                <ExternalLink className="w-3.5 h-3.5 mr-2" />
                <div className="flex flex-col">
                  <span>Floating Prompter</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Picture-in-picture overlay</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setActiveSheet("theme")}>
                <Palette className="w-3.5 h-3.5 mr-2" /> Theme
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveSheet("coach")}>
                <Brain className="w-3.5 h-3.5 mr-2" /> Slide Coach
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveSheet("comments")}>
                <MessageSquare className="w-3.5 h-3.5 mr-2" /> Comments
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveSheet("analytics")}>
                <BarChart3 className="w-3.5 h-3.5 mr-2" /> Analytics
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveSheet("resources")}>
                <BookOpen className="w-3.5 h-3.5 mr-2" /> Resources
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveSheet("history")}>
                <History className="w-3.5 h-3.5 mr-2" /> Version History
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setActiveSheet("creative"); }}>
                <Pencil className="w-3.5 h-3.5 mr-2" />
                <div className="flex flex-col">
                  <span>Creative Tools</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Sketch, assets & image converter</span>
                </div>
              </DropdownMenuItem>
              {activeSlide && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDuplicateSlide(activeSlide, activeIndex)}>
                    <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate Slide
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onSaveToLibrary(activeSlide, activeIndex)}>
                    <BookmarkPlus className="w-3.5 h-3.5 mr-2" /> Save to Library
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onRemix(activeSlide)}>
                    <Sparkles className="w-3.5 h-3.5 mr-2" /> Remix Type
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => onDeleteSlide(activeSlide.id)}>
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Slide
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Slide view + notes preview */}
      <div className="flex-1 flex flex-col bg-secondary/30 overflow-hidden min-h-0">
        {/* Slide area */}
        <div className="relative flex items-center justify-center shrink-0 px-4 pt-3" {...swipeHandlers}>
          {activeSlide ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSlide.id}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.2 }}
                className="w-full"
              >
                <div className="w-full aspect-video rounded-xl overflow-hidden border border-border shadow-2xl">
                  <ScaledSlide>
                    <SlideRenderer
                      blockType={activeSlide.block_type}
                      content={activeSlide.content}
                      theme={theme}
                      editable
                      onOverlaysChange={(overlays) => {
                        const content = typeof activeSlide.content === "object" && activeSlide.content !== null && !Array.isArray(activeSlide.content) ? activeSlide.content as Record<string, unknown> : {};
                        onUpdateSlide({ ...content, overlays } as any, activeSlide.notes ?? undefined);
                      }}
                    />
                  </ScaledSlide>
                </div>
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="text-center p-6">
              <p className="text-muted-foreground mb-4">No slides yet</p>
              <Button onClick={() => setActiveSheet("add")} className="bg-gradient-gold text-primary-foreground">
                <Plus className="w-4 h-4 mr-2" /> Add Your First Slide
              </Button>
            </div>
          )}

          {/* Slide navigation arrows */}
          {slides.length > 1 && (
            <>
              {activeIndex > 0 && (
                <button
                  onClick={goPrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-card/80 backdrop-blur border border-border flex items-center justify-center"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              {activeIndex < slides.length - 1 && (
                <button
                  onClick={goNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-card/80 backdrop-blur border border-border flex items-center justify-center"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </>
          )}

          {/* Slide counter */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-card/80 backdrop-blur border border-border rounded-full px-3 py-1">
            <span className="text-xs font-medium">
              {activeIndex + 1} / {slides.length}
            </span>
          </div>

          {/* Slide type badge */}
          {activeSlide && (
            <div className="absolute top-4 right-5 bg-primary/10 border border-primary/20 rounded-full px-2.5 py-0.5">
              <span className="text-[10px] font-medium text-primary capitalize">{activeSlide.block_type}</span>
            </div>
          )}
        </div>

        {/* Speaker notes preview — fills remaining space */}
        {activeSlide && (
          <div className="flex-1 min-h-0 mx-4 mt-2 mb-2 rounded-xl bg-card/80 border border-border/50 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 shrink-0">
              <button
                onClick={() => setActiveSheet("notes")}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <FileText className="w-3 h-3" />
                Speaker Notes
              </button>
              <div className="flex items-center gap-1">
                {!showRadar && (
                  <button
                    onClick={() => setShowRadar(true)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-muted-foreground hover:text-foreground bg-secondary/80 transition-colors"
                  >
                    <BarChart3 className="w-3 h-3" />
                    Radar
                  </button>
                )}
                <button
                  onClick={() => setActiveSheet("notes")}
                  className="text-[10px] text-primary font-medium px-2 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
                >
                  Edit
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {showRadar ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">Content Radar</span>
                    <button onClick={() => setShowRadar(false)} className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <ContentRadar blockType={activeSlide.block_type} content={activeSlide.content} notes={activeSlide.notes} />
                </div>
              ) : activeSlide.notes ? (
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{activeSlide.notes}</p>
              ) : (
                <button
                  onClick={() => setActiveSheet("notes")}
                  className="w-full text-center py-4 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  Tap to add speaker notes…
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 border-t border-border bg-card px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-5 gap-1">
          <button
            onClick={() => setActiveSheet("edit")}
            className="flex flex-col items-center gap-0.5 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Edit3 className="w-5 h-5" />
            <span className="text-[10px] font-medium">Edit</span>
          </button>
          <button
            onClick={() => setActiveSheet("notes")}
            className="flex flex-col items-center gap-0.5 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <FileText className="w-5 h-5" />
            <span className="text-[10px] font-medium">Script</span>
          </button>
          <button
            onClick={() => setActiveSheet("add")}
            className="flex flex-col items-center gap-0.5 py-1.5"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center -mt-3">
              <Plus className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-[10px] font-medium text-primary -mt-0.5">Add</span>
          </button>
          <button
            onClick={() => setActiveSheet("arc-inline")}
            className="flex flex-col items-center gap-0.5 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Brain className="w-5 h-5" />
            <span className="text-[10px] font-medium">Arc</span>
          </button>
          <button
            onClick={onPresent}
            className="flex flex-col items-center gap-0.5 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Play className="w-5 h-5" />
            <span className="text-[10px] font-medium">Present</span>
          </button>
        </div>
      </div>

      {/* ─── SHEETS ─── */}

      {/* Edit sheet */}
      <Sheet open={activeSheet === "edit"} onOpenChange={(o) => !o && setActiveSheet(null)}>
        <SheetContent side="bottom" className="h-[75dvh] rounded-t-2xl overflow-y-auto" ref={editSheetRef}>
          <SheetHeader>
            <SheetTitle className="text-base">Edit Slide</SheetTitle>
          </SheetHeader>
          {activeSlide && (
            <div className="mt-4 space-y-4">
              {renderContentEditor(activeSlide)}
              <div className="border-t border-border pt-4">
                {renderImageControls(activeSlide)}
              </div>
              <div className="border-t border-border pt-4">
                <SlideAudioControls slide={activeSlide} onUpdate={onUpdateSlide} />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Script sheet */}
      <Sheet open={activeSheet === "notes"} onOpenChange={(o) => !o && setActiveSheet(null)}>
        <SheetContent side="bottom" className="h-[75dvh] rounded-t-2xl overflow-y-auto" ref={notesSheetRef}>
          <SheetHeader>
            <SheetTitle className="text-base flex items-center justify-between">
              <span>Speaker Script</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setActiveSheet("full-script")}
              >
                <BookOpen className="w-3 h-3" /> Full Script
              </Button>
            </SheetTitle>
          </SheetHeader>
          {activeSlide && (
            <div className="mt-4">
              {renderScriptEditor(activeSlide)}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Add slide/element sheet */}
      <Sheet open={activeSheet === "add"} onOpenChange={(o) => !o && setActiveSheet(null)}>
        <SheetContent side="bottom" className="h-[80dvh] rounded-t-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base">Add</SheetTitle>
          </SheetHeader>

          {/* Add Element to Current Slide */}
          {activeSlide && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Add to This Slide</p>
              <div className="grid grid-cols-3 gap-2">
                {getElementOptionsForSlide(activeSlide.block_type).map((el) => (
                  <button
                    key={el.key}
                    onClick={() => {
                      const currentContent = typeof activeSlide.content === "object" && activeSlide.content !== null && !Array.isArray(activeSlide.content)
                        ? activeSlide.content as Record<string, unknown>
                        : {};
                      onUpdateSlide({ ...currentContent, ...el.defaults } as Json, activeSlide.notes ?? undefined);
                      setActiveSheet(null);
                      toast.success(`${el.label} added to slide`);
                    }}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/50 transition-all"
                  >
                    <el.icon className="w-4 h-4 text-primary" />
                    <span className="text-[10px] font-medium">{el.label}</span>
                  </button>
                ))}
                {/* Visual Assets — icons & shapes as draggable overlays */}
                {onAssetLibrary && (
                  <button
                    onClick={() => { setActiveSheet(null); setTimeout(() => onAssetLibrary(), 150); }}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/50 transition-all"
                  >
                    <Shapes className="w-4 h-4 text-primary" />
                    <span className="text-[10px] font-medium">Shape / Icon</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Add New Slide */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add New Slide</p>
              <button
                onClick={() => { setBatchMode(!batchMode); if (batchMode) setBatchQueue([]); }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                  batchMode 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layers className="w-3 h-3" />
                {batchMode ? "Building…" : "Build Deck"}
              </button>
            </div>

            {batchMode && batchQueue.length > 0 && (
              <div className="mb-4 p-3 rounded-xl bg-primary/5 border border-primary/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-primary">{batchQueue.length} slide{batchQueue.length !== 1 ? "s" : ""} queued</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setBatchQueue([])}
                      className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-full bg-secondary"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => {
                        batchQueue.forEach((bt) => onAddSlide(bt.type, bt.content));
                        setBatchQueue([]);
                        setBatchMode(false);
                        setActiveSheet(null);
                        toast.success(`Added ${batchQueue.length} slides`);
                      }}
                      className="text-[10px] font-medium text-primary-foreground bg-primary px-3 py-1 rounded-full flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" /> Add All
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {batchQueue.map((bt, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-card border border-border text-[10px] font-medium"
                    >
                      <span className="text-muted-foreground">{i + 1}.</span> {bt.label}
                      <button
                        onClick={() => setBatchQueue((q) => q.filter((_, j) => j !== i))}
                        className="ml-0.5 text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {blockTypes.map((bt) => {
                const queueCount = batchQueue.filter((q) => q.type === bt.type).length;
                return (
                  <button
                    key={bt.type}
                    onClick={() => {
                      if (batchMode) {
                        setBatchQueue((q) => [...q, bt]);
                        toast(`Added ${bt.label} to queue`, { duration: 1500 });
                      } else {
                        onAddSlide(bt.type, bt.content);
                        setActiveSheet(null);
                      }
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      batchMode && queueCount > 0
                        ? "border-primary/40 bg-primary/5"
                        : "border-border hover:border-primary/30 hover:bg-secondary/50"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 relative">
                      <bt.icon className="w-4 h-4 text-primary" />
                      {batchMode && queueCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                          {queueCount}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{bt.label}</span>
                      {batchMode && (
                        <span className="text-[10px] text-muted-foreground">Tap to add to queue</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4">
            <AutoSuggestSlide slides={slides} onAddSlide={(bt, c) => { onAddSlide(bt, c); setActiveSheet(null); }} />
            <div className="mt-2">
              <QuickCapture onAddSlide={(bt, c) => { onAddSlide(bt, c); setActiveSheet(null); }} />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Slides list sheet */}
      <Sheet open={activeSheet === "slides"} onOpenChange={(o) => !o && setActiveSheet(null)}>
        <SheetContent side="bottom" className="h-[80dvh] rounded-t-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base">All Slides ({slides.length})</SheetTitle>
          </SheetHeader>
          
          {slides.length > 1 && (
            <div className="mt-4 p-2.5 rounded-xl border border-border bg-secondary/20">
              <SlideDNA
                metrics={slideMetrics}
                size="sm"
                interactive={false}
                showLegend
                animated={false}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mt-4">
            {slides.map((slide, i) => (
              <div
                key={slide.id}
                className={`rounded-xl border-2 overflow-hidden transition-all ${
                  i === activeIndex ? "border-primary" : "border-border"
                }`}
              >
                <button
                  className="w-full block"
                  onClick={() => { setActiveIndex(i); setActiveSheet(null); }}
                >
                  <div className="aspect-video overflow-hidden bg-background">
                    <ScaledSlide>
                      <SlideRenderer blockType={slide.block_type} content={slide.content} theme={theme} />
                    </ScaledSlide>
                  </div>
                </button>
                {/* Slide label + actions row */}
                <div className="px-2 py-1.5 flex items-center gap-1 bg-card border-t border-border">
                  <span className="text-[10px] text-muted-foreground flex-1 truncate">
                    {i + 1}. {slide.block_type}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDuplicateSlide(slide, i); }}
                    className="p-1 rounded-md hover:bg-accent"
                    aria-label="Duplicate slide"
                  >
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteSlide(slide.id); }}
                    className="p-1 rounded-md hover:bg-destructive/20"
                    aria-label="Delete slide"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Creative Tools sheet */}
      <Sheet open={activeSheet === "creative"} onOpenChange={(o) => !o && setActiveSheet(null)}>
        <SheetContent side="bottom" className="h-auto max-h-[60dvh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="text-base flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" />
              Creative Tools
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3 pb-4">
            {onSketch && (
              <button
                onClick={() => { setActiveSheet(null); setTimeout(() => onSketch(), 150); }}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/50 transition-all text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Pencil className="w-5 h-5 text-primary" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">Quick Sketch</span>
                  <span className="text-xs text-muted-foreground">Freehand drawing canvas for custom visuals</span>
                </div>
              </button>
            )}
            {onAssetLibrary && (
              <button
                onClick={() => { setActiveSheet(null); setTimeout(() => onAssetLibrary(), 150); }}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/50 transition-all text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Shapes className="w-5 h-5 text-primary" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">Visual Assets</span>
                  <span className="text-xs text-muted-foreground">Icons, shapes & symbols library</span>
                </div>
              </button>
            )}
            {onSketchConverter && (
              <button
                onClick={() => { setActiveSheet(null); setTimeout(() => onSketchConverter(), 150); }}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/50 transition-all text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Clapperboard className="w-5 h-5 text-primary" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">Image → Sketch</span>
                  <span className="text-xs text-muted-foreground">Convert photos to line art drawings</span>
                </div>
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={activeSheet === "theme"} onOpenChange={(o) => !o && setActiveSheet(null)}>
        <SheetContent side="bottom" className="h-[80dvh] rounded-t-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base">Design & Theme</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <ThemePanel
              theme={theme}
              transition={transition}
              onThemeChange={onThemeChange}
              onTransitionChange={onTransitionChange}
              slides={slides}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Coach sheet */}
      <Sheet open={activeSheet === "coach"} onOpenChange={(o) => !o && setActiveSheet(null)}>
        <SheetContent side="bottom" className="h-[75dvh] rounded-t-2xl flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="text-base flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              Slide Coach
            </SheetTitle>
          </SheetHeader>
          {activeSlide && presentationId && (
            <div className="flex-1 overflow-y-auto mt-4">
              <SlideCoachPanel
                slide={activeSlide}
                slideIndex={activeIndex}
                totalSlides={slides.length}
                deckTitle={title}
                onApplyRewrite={(text) => {
                  onUpdateSlide({ ...content, heading: text } as Json, activeSlide.notes ?? undefined);
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Comments sheet */}
      <Sheet open={activeSheet === "comments"} onOpenChange={(o) => !o && setActiveSheet(null)}>
        <SheetContent side="bottom" className="h-[75dvh] rounded-t-2xl flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              Comments
            </SheetTitle>
          </SheetHeader>
          {activeSlide && presentationId && (
            <div className="flex-1 overflow-y-auto mt-4">
              <SlideCommentsPanel slideId={activeSlide.id} presentationId={presentationId} />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Analytics sheet */}
      <Sheet open={activeSheet === "analytics"} onOpenChange={(o) => !o && setActiveSheet(null)}>
        <SheetContent side="bottom" className="h-[80dvh] rounded-t-2xl flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Presentation Analytics
            </SheetTitle>
          </SheetHeader>
          {presentationId && (
            <div className="flex-1 overflow-y-auto mt-4">
              <PresentationAnalytics
                presentationId={presentationId}
                slideCount={slides.length}
                slides={slides.map(s => ({ id: s.id, content: s.content, block_type: s.block_type, notes: s.notes }))}
                onSlideClick={(slideId) => {
                  const idx = slides.findIndex(s => s.id === slideId);
                  if (idx >= 0) { setActiveIndex(idx); setActiveSheet(null); }
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Resources sheet */}
      <Sheet open={activeSheet === "resources"} onOpenChange={(o) => !o && setActiveSheet(null)}>
        <SheetContent side="bottom" className="h-[75dvh] rounded-t-2xl flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              Slide Resources
            </SheetTitle>
          </SheetHeader>
          {activeSlide && presentationId && (
            <div className="flex-1 overflow-y-auto mt-4">
              <SlideResourcesPanel
                slide={activeSlide}
                presentationId={presentationId}
                onUpdate={onUpdateSlide}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Version History sheet */}
      <Sheet open={activeSheet === "history"} onOpenChange={(o) => !o && setActiveSheet(null)}>
        <SheetContent side="bottom" className="h-[75dvh] rounded-t-2xl flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              Version History
            </SheetTitle>
          </SheetHeader>
          {activeSlide && presentationId && (
            <div className="flex-1 overflow-y-auto mt-4">
              <VersionHistoryPanel
                slideId={activeSlide.id}
                presentationId={presentationId}
                currentContent={activeSlide.content}
                currentNotes={activeSlide.notes}
                blockType={activeSlide.block_type}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Full Script sheet */}
      <Sheet open={activeSheet === "full-script"} onOpenChange={(o) => !o && setActiveSheet(null)}>
        <SheetContent side="bottom" className="h-[90dvh] rounded-t-2xl flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              Full Script
            </SheetTitle>
          </SheetHeader>
          <div className="flex gap-2 mt-3 shrink-0">
            <Button
              variant="default"
              size="sm"
              className="gap-1.5"
              onClick={() => { sendToTeleprompter(); setActiveSheet(null); }}
            >
              <ScrollText className="w-3.5 h-3.5" /> Send to Teleprompter
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={async () => {
                const text = fullScriptData.map((d) => {
                  const body = d.script || d.notes || "[No script]";
                  return `SLIDE ${d.number}: ${d.heading}\n${"─".repeat(30)}\n${body}`;
                }).join("\n\n");
                await navigator.clipboard.writeText(text);
                toast.success("Full script copied");
              }}
            >
              <Copy className="w-3.5 h-3.5" /> Copy All
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto mt-3 space-y-3 pr-1">
            {fullScriptData.map((data) => (
              <button
                key={data.number}
                onClick={() => { setActiveIndex(data.number - 1); setActiveSheet(null); }}
                className="w-full text-left border border-border rounded-xl p-3 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-bold bg-foreground text-background px-2 py-0.5 rounded">
                    {data.number}
                  </span>
                  <span className="text-sm font-semibold truncate flex-1">{data.heading}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{data.blockType}</span>
                </div>
                {data.script ? (
                  <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap line-clamp-4 pl-2 border-l-2 border-primary/30">
                    {data.script}
                  </p>
                ) : data.notes ? (
                  <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap line-clamp-4 pl-2 border-l-2 border-border">
                    {data.notes}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground/50 italic">No script for this slide</p>
                )}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Arc inline chat sheet */}
      <Sheet open={activeSheet === "arc-inline"} onOpenChange={(o) => !o && setActiveSheet(null)}>
        <SheetContent side="bottom" className="h-[75dvh] rounded-t-2xl flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="text-base flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              Arc
              <span className="text-xs font-normal text-muted-foreground">• Editing "{title}"</span>
            </SheetTitle>
          </SheetHeader>
          <ArcInlineChat
            presentationId={presentationId}
            allSlides={slides}
            activeSlide={activeSlide}
            slideIndex={activeIndex}
            title={title}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Inline Arc chat for the editor — aware of the current deck */
function ArcInlineChat({
  presentationId,
  allSlides,
  activeSlide,
  slideIndex,
  title,
}: {
  presentationId?: string;
  allSlides: Slide[];
  activeSlide?: Slide;
  slideIndex: number;
  title: string;
}) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const applyActions = useApplyArcActions();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: "user" as const, content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const session = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/arc-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.data.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          messages: updated.map((m) => ({ role: m.role, content: m.content })),
          mode: "coaching",
          slides_context: allSlides.map((s) => ({ block_type: s.block_type, content: s.content })),
          teaching_style: localStorage.getItem("presentq_teaching_style"),
        }),
      });

      if (!resp.ok || !resp.body) throw new Error("Failed");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantText += delta;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: assistantText };
                return copy;
              });
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyActions = async (actions: ArcAction[]) => {
    if (!presentationId) return;
    const slideRefs = allSlides.map(s => ({
      id: s.id,
      sort_order: s.sort_order,
      content: s.content,
      presentation_id: s.presentation_id,
    }));
    const result = await applyActions(actions, slideRefs, presentationId);
    if (result.success) {
      toast.success(`Applied ${result.applied} change${result.applied > 1 ? "s" : ""}`);
    } else {
      toast.error("Failed to apply changes");
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 mt-3">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 px-1">
        {messages.length === 0 && (
          <div className="text-center py-6 space-y-3">
            <Sparkles className="w-7 h-7 text-primary/30 mx-auto" />
            <p className="text-xs text-muted-foreground">
              Arc knows your deck. Ask about slide {slideIndex + 1}, flow, delivery tips, or how to improve.
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {["How can I improve this deck?", "Is the deck flow logical?", "Rewrite this heading"].map((q) => (
                <button key={q} onClick={() => setInput(q)} className="text-[10px] px-2 py-1 rounded-full bg-secondary border border-border text-muted-foreground hover:text-foreground transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => {
          const actions = msg.role === "assistant" ? parseArcActions(msg.content) : [];
          const displayContent = msg.role === "assistant" ? stripArcActionsBlock(msg.content) : msg.content;

          return (
            <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"
              }`}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm prose-invert max-w-none [&>*]:text-xs [&>*]:my-1">
                    <ReactMarkdown>{displayContent || "…"}</ReactMarkdown>
                  </div>
                ) : msg.content}
              </div>
              {/* Arc Actions Card */}
              {actions.length > 0 && !loading && (
                <MobileArcActionsCard
                  actions={actions}
                  onApply={() => handleApplyActions(actions)}
                />
              )}
            </div>
          );
        })}
        {loading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Arc is thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="pt-3 border-t border-border shrink-0">
        <div className="flex gap-1.5">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask Arc about this deck…"
            className="min-h-[36px] max-h-[80px] text-xs resize-none"
            rows={1}
          />
          <Button size="icon" className="h-9 w-9 shrink-0" onClick={send} disabled={!input.trim() || loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Compact action card for mobile */
function MobileArcActionsCard({ actions, onApply }: { actions: ArcAction[]; onApply: () => void }) {
  const [applied, setApplied] = useState(false);
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    setApplying(true);
    await onApply();
    setApplying(false);
    setApplied(true);
  };

  return (
    <div className="max-w-[85%] w-full my-1.5 rounded-lg border border-primary/30 bg-primary/5 p-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        {applied ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <Play className="w-3.5 h-3.5 text-primary" />
        )}
        <span className="text-[11px] font-semibold text-foreground">
          {applied ? "Changes applied ✓" : `${actions.length} change${actions.length > 1 ? "s" : ""}`}
        </span>
      </div>
      <div className="space-y-0.5">
        {actions.map((action, i) => (
          <div key={i} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
            {action.type === "delete" ? <Trash2 className="w-2.5 h-2.5 text-destructive mt-0.5" /> :
             action.type === "move" ? <ArrowUpDown className="w-2.5 h-2.5 text-primary mt-0.5" /> :
             <Pencil className="w-2.5 h-2.5 text-primary mt-0.5" />}
            <span>{getActionLabel(action)}</span>
          </div>
        ))}
      </div>
      {!applied && (
        <Button
          size="sm"
          className="w-full h-7 text-[11px] gap-1"
          onClick={handleApply}
          disabled={applying}
        >
          {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          Apply All
        </Button>
      )}
    </div>
  );
}
