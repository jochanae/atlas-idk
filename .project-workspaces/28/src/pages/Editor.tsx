import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Plus, ChevronLeft, Grid3X3, Play, Trash2, BookmarkPlus,
  Type, BookOpen, BarChart3, Target, Quote, GitCompare, MessageSquareQuote, LayoutTemplate,
  GripVertical, MoreHorizontal, FileText, Copy, Image, Sparkles, Loader2,
  Bold, Italic, List, Link, Undo2, Redo2, Upload, Palette, Timer, Download, UserPlus, Mic, ExternalLink,
  FolderOpen, X, Check, Cloud, Video, Table2, BarChart2, History, MessageSquare, Volume2, Brain,
  ImageIcon, Clapperboard, Pencil, Shapes, GraduationCap
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { usePresentation, useUpdatePresentation } from "@/hooks/usePresentations";
import { useSlides, useCreateSlide, useUpdateSlide, useDeleteSlide, useDuplicateSlide, useReorderSlides, Slide } from "@/hooks/useSlides";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ScaledSlide from "@/components/editor/ScaledSlide";
import SlideRenderer from "@/components/editor/SlideRenderer";
import PresenterMode from "@/components/editor/PresenterMode";
import TeleprompterMode from "@/components/editor/TeleprompterMode";
import MobileTeleprompterMode from "@/components/editor/MobileTeleprompterMode";
import PipTeleprompter from "@/components/editor/PipTeleprompter";
import PracticeMode from "@/components/editor/PracticeMode";
import RehearsalMode from "@/components/editor/RehearsalMode";
import SlideAudioControls from "@/components/editor/SlideAudioControls";
import ThemePanel from "@/components/editor/ThemePanel";
import DeliveryPrepPanel from "@/components/editor/DeliveryPrepPanel";
import PresentationAnalytics from "@/components/editor/PresentationAnalytics";
import ExportPdfButton from "@/components/editor/ExportPdfButton";
import ExportPptxButton from "@/components/editor/ExportPptxButton";
import PrintDialog from "@/components/editor/PrintDialog";
import CopyToTeleprompterButton from "@/components/editor/CopyToTeleprompterButton";
import SpeakerScriptDocument from "@/components/editor/SpeakerScriptDocument";
import ShareDialog from "@/components/editor/ShareDialog";
import CollaborationDialog from "@/components/editor/CollaborationDialog";
import { parseTheme, themeToJson, type SlideTheme, type TransitionType } from "@/lib/slideThemes";
import type { Json } from "@/integrations/supabase/types";
import { useSaveBlock } from "@/hooks/useSavedBlocks";
import InsertFromLibraryDialog from "@/components/editor/InsertFromLibraryDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useProjectAssets, useUploadProjectAsset, useDeleteProjectAsset } from "@/hooks/useProjectAssets";
import SlideCommentsPanel from "@/components/editor/SlideCommentsPanel";
import VersionHistoryPanel from "@/components/editor/VersionHistoryPanel";
import MobileEditorWarning from "@/components/editor/MobileEditorWarning";
import DeepDiveButtons from "@/components/dashboard/DeepDiveButtons";
import ContentRadar from "@/components/editor/ContentRadar";
import OneClickRewrite from "@/components/editor/OneClickRewrite";
import SlidePeek from "@/components/editor/SlidePeek";
import ContextualToolbar from "@/components/editor/ContextualToolbar";
import AutoSuggestSlide from "@/components/editor/AutoSuggestSlide";
import SmartImageSuggestions from "@/components/editor/SmartImageSuggestions";
import QuickCapture from "@/components/editor/QuickCapture";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import SlideRemixEngine from "@/components/editor/SlideRemixEngine";
import AudienceReactionSimulator, { type SlideContentForReaction } from "@/components/editor/AudienceReactionSimulator";
import SlideResourcesPanel from "@/components/editor/SlideResourcesPanel";
import LivePollManager from "@/components/editor/LivePollManager";
import RecordingMode from "@/components/editor/RecordingMode";
import LectureMode from "@/components/editor/LectureMode";
import CollaborationPresence from "@/components/editor/CollaborationPresence";
import SlidePresenceIndicator from "@/components/editor/SlidePresenceIndicator";
import SlideCoachPanel from "@/components/editor/SlideCoachPanel";
import EditorArcSidebar from "@/components/editor/EditorArcSidebar";
import QuickSketchCanvas from "@/components/editor/QuickSketchCanvas";
import VisualAssetLibrary from "@/components/editor/VisualAssetLibrary";
import ImageToSketchConverter from "@/components/editor/ImageToSketchConverter";
import SlideDNA, { getSlideMetrics } from "@/components/SlideDNA";
import { createOverlayId, type SlideOverlay } from "@/components/editor/SlideOverlayLayer";

import MobileEditorLayout from "@/components/editor/MobileEditorLayout";
import { ArcProvider } from "@/components/arc/ArcProvider";
import ArcChatPanel from "@/components/arc/ArcChatPanel";
import ThemeDropdown from "@/components/ThemeDropdown";

const blockTypes = [
  { id: "title", label: "Title", icon: Type },
  { id: "content", label: "Content", icon: BookOpen },
  { id: "chart", label: "Chart", icon: BarChart3 },
  { id: "goal", label: "Goal", icon: Target },
  { id: "quote", label: "Quote", icon: Quote },
  { id: "comparison", label: "Comparison", icon: GitCompare },
  { id: "testimonial", label: "Testimonial", icon: MessageSquareQuote },
  { id: "template", label: "Template", icon: LayoutTemplate },
];

const mobileBlockTypes = blockTypes.map((bt) => ({
  type: bt.id,
  label: bt.label,
  icon: bt.icon,
  content: {},
}));

function ImageGeneratingOverlay() {
  return (
    <div className="flex flex-col items-center justify-center py-8 space-y-3">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        <Sparkles className="w-5 h-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>
      <p className="text-sm font-medium">Generating image...</p>
      <p className="text-xs text-muted-foreground">This may take a few moments</p>
    </div>
  );
}

function SlideImageControls({ slide, content, onUpdate, onSetPromptAndGenerate, onOpenLibrary }: { slide: Slide; content: Record<string, unknown>; onUpdate: (content: Json, notes?: string) => void; onSetPromptAndGenerate?: (prompt: string) => void; onOpenLibrary?: () => void }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageUrl = content.imageUrl as string | undefined;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileName = `${slide.user_id}/${slide.id}-img-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("slide-assets").upload(fileName, file, { contentType: file.type, upsert: true });
    if (error) { toast.error("Upload failed"); return; }
    const { data: { publicUrl } } = supabase.storage.from("slide-assets").getPublicUrl(fileName);
    onUpdate({ ...content, imageUrl: publicUrl } as Json, slide.notes ?? undefined);
    toast.success("Image uploaded");
  };

  const handleAIGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-slide-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ prompt, slideId: slide.id }),
      });
      if (resp.status === 429) { toast.error("Rate limited — try again later"); return; }
      if (resp.status === 402) { toast.error("Credits exhausted — please add funds"); return; }
      if (!resp.ok) throw new Error("Generation failed");
      const { imageUrl: url } = await resp.json();
      onUpdate({ ...content, imageUrl: url } as Json, slide.notes ?? undefined);
      toast.success("Image generated!");
      setPrompt("");
    } catch (err) {
      toast.error("Image generation failed");
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemoveImage = () => {
    const { imageUrl: _, ...rest } = content;
    onUpdate(rest as Json, slide.notes ?? undefined);
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Image className="w-3 h-3" /> Image
      </div>

      {isGenerating ? (
        <ImageGeneratingOverlay />
      ) : imageUrl ? (
        <div className="space-y-2">
          <img src={imageUrl} alt="" className="w-full rounded-lg border border-border object-cover aspect-video" />
          <Button variant="ghost" size="sm" className="w-full text-destructive gap-1.5" onClick={handleRemoveImage}>
            <Trash2 className="w-3 h-3" /> Remove Image
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No image on this slide</p>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={isGenerating}>
          <Upload className="w-3 h-3" /> Upload
        </Button>
        <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={onOpenLibrary} disabled={isGenerating}>
          <FolderOpen className="w-3 h-3" /> Library
        </Button>
      </div>

      <div className="flex gap-1">
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe an image..."
          className="text-xs h-8 bg-secondary border-border"
          onKeyDown={(e) => e.key === "Enter" && !isGenerating && handleAIGenerate()}
          disabled={isGenerating}
        />
        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" data-generate-image onClick={handleAIGenerate} disabled={isGenerating || !prompt.trim()}>
          {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        </Button>
      </div>

      <SmartImageSuggestions
        slideText={[content.heading, content.body, content.subheading, content.quote, content.description, content.metric].filter(Boolean).join(" ")}
        blockType={slide.block_type}
        onGenerateImage={(p) => {
          setPrompt(p);
          setTimeout(() => {
            const btn = document.querySelector('[data-generate-image]') as HTMLButtonElement;
            btn?.click();
          }, 100);
        }}
      />
    </div>
  );
}

function SlideContentEditor({ slide, onUpdate }: { slide: Slide; onUpdate: (content: Json, notes?: string) => void }) {
  const content = (typeof slide.content === "object" && slide.content !== null && !Array.isArray(slide.content)) ? slide.content as Record<string, unknown> : {};

  const handleChange = (key: string, value: string) => {
    onUpdate({ ...content, [key]: value } as Json, slide.notes ?? undefined);
  };

  const renderField = (key: string, label: string, multiline = false) => {
    const val = (content[key] as string) || "";
    return (
      <div key={key}>
        <label className="text-xs font-medium text-muted-foreground block mb-1.5">{label}</label>
        {multiline ? (
          <Textarea
            value={val}
            onChange={(e) => handleChange(key, e.target.value)}
            className="min-h-[80px] text-sm resize-none bg-secondary border-border"
            placeholder={`Enter ${label.toLowerCase()}...`}
          />
        ) : (
          <Input
            value={val}
            onChange={(e) => handleChange(key, e.target.value)}
            className="text-sm bg-secondary border-border"
            placeholder={`Enter ${label.toLowerCase()}...`}
          />
        )}
      </div>
    );
  };

  const fields: Record<string, Array<{ key: string; label: string; multiline?: boolean }>> = {
    title: [
      { key: "heading", label: "Heading" },
      { key: "subheading", label: "Subheading" },
    ],
    content: [
      { key: "heading", label: "Heading" },
      { key: "body", label: "Body", multiline: true },
    ],
    chart: [
      { key: "heading", label: "Heading" },
      { key: "description", label: "Description", multiline: true },
    ],
    goal: [
      { key: "heading", label: "Goal Statement" },
      { key: "metric", label: "Target Metric" },
      { key: "description", label: "Description", multiline: true },
    ],
    quote: [
      { key: "quote", label: "Quote", multiline: true },
      { key: "author", label: "Author" },
    ],
    comparison: [
      { key: "heading", label: "Heading" },
      { key: "leftLabel", label: "Left Label" },
      { key: "rightLabel", label: "Right Label" },
    ],
    testimonial: [
      { key: "quote", label: "Testimonial", multiline: true },
      { key: "author", label: "Author" },
      { key: "role", label: "Role/Company" },
    ],
    template: [
      { key: "heading", label: "Heading" },
      { key: "body", label: "Body", multiline: true },
    ],
  };

  const currentFields = fields[slide.block_type] || fields.content;

  return (
    <div className="px-4 py-3 space-y-4 border-b border-border">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Content</div>
      {currentFields.map((f) => renderField(f.key, f.label, f.multiline))}
    </div>
  );
}

function SpeakerScriptPanel({ slide, onUpdate }: { slide: Slide; onUpdate: (content: Json, notes?: string) => void }) {
  const [script, setScript] = useState(slide.notes || "");

  useEffect(() => {
    setScript(slide.notes || "");
  }, [slide.id, slide.notes]);

  const handleSave = () => {
    const content = (typeof slide.content === "object" && slide.content !== null && !Array.isArray(slide.content)) ? slide.content as Record<string, unknown> : {};
    onUpdate(content as Json, script);
    toast.success("Speaker notes saved");
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Speaker Script</div>
        <Button size="sm" variant="outline" onClick={handleSave}>
          <Check className="w-3 h-3 mr-1" /> Save
        </Button>
      </div>
      <Textarea
        value={script}
        onChange={(e) => setScript(e.target.value)}
        placeholder="Write your speaker notes here..."
        className="min-h-[200px] text-sm resize-none bg-secondary border-border"
      />
    </div>
  );
}

function SlidePropertiesPanel({ slide, slides, presentationId, onUpdate, onOpenLibrary }: { slide: Slide; slides: Slide[]; presentationId?: string; onUpdate: (content: Json, notes?: string) => void; onOpenLibrary?: () => void }) {
  const content = (typeof slide.content === "object" && slide.content !== null && !Array.isArray(slide.content)) ? slide.content as Record<string, unknown> : {};
  const [activeTab, setActiveTab] = useState<"edit" | "script" | "assets" | "comments" | "history" | "delivery" | "analytics" | "audience" | "resources" | "polling" | "coach">("edit");

  const metrics = getSlideMetrics(slides);
  const slideIndex = slides.findIndex(s => s.id === slide.id);

  const tabs = [
    { id: "edit" as const, label: "Edit", icon: Pencil },
    { id: "script" as const, label: "Script", icon: FileText },
    { id: "assets" as const, label: "Assets", icon: FolderOpen },
    { id: "comments" as const, label: "Comments", icon: MessageSquare },
    { id: "history" as const, label: "History", icon: History },
    { id: "delivery" as const, label: "Delivery", icon: Mic },
    { id: "analytics" as const, label: "Analytics", icon: BarChart2 },
    { id: "audience" as const, label: "Audience", icon: Brain },
    { id: "resources" as const, label: "Resources", icon: BookOpen },
    { id: "polling" as const, label: "Polling", icon: BarChart3 },
    { id: "coach" as const, label: "Coach", icon: GraduationCap },
  ];

  return (
    <div className="w-72 border-l border-border bg-card overflow-y-auto shrink-0">
      <div className="sticky top-0 bg-card border-b border-border z-10">
        <div className="p-3 flex items-center justify-between">
          <h3 className="font-semibold text-sm">Slide Properties</h3>
          {metrics.length > 0 && <SlideDNA metrics={metrics} size="sm" />}
        </div>
        <div className="flex overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-3 h-3" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "edit" && (
        <>
          <SlideContentEditor slide={slide} onUpdate={onUpdate} />
          <div className="px-4 pb-4 space-y-6">
            <SlideImageControls slide={slide} content={content} onUpdate={onUpdate} onOpenLibrary={onOpenLibrary} />
            <SlideAudioControls slide={slide} onUpdate={onUpdate} />
          </div>
        </>
      )}
      {activeTab === "script" && <SpeakerScriptPanel slide={slide} onUpdate={onUpdate} />}
      {activeTab === "assets" && presentationId && <ProjectAssetsTab presentationId={presentationId} slideId={slide.id} />}
      {activeTab === "comments" && presentationId && <SlideCommentsPanel slideId={slide.id} presentationId={presentationId} />}
      {activeTab === "history" && presentationId && (
        <VersionHistoryPanel
          slideId={slide.id}
          presentationId={presentationId}
          currentContent={slide.content}
          currentNotes={slide.notes}
          blockType={slide.block_type}
        />
      )}
      {activeTab === "delivery" && <DeliveryPrepPanel slides={slides} />}
      {activeTab === "analytics" && presentationId && (
        <PresentationAnalytics presentationId={presentationId} slideCount={slides.length} slides={slides} />
      )}
      {activeTab === "audience" && (
        <div className="p-4">
          <AudienceReactionSimulator
            slideContent={{
              blockType: slide.block_type,
              wordCount: JSON.stringify(slide.content).split(/\s+/).length,
              hasImage: !!(content.imageUrl),
              title: content.heading as string,
              body: content.body as string,
            }}
            isActive={true}
          />
        </div>
      )}
      {activeTab === "resources" && presentationId && (
        <SlideResourcesPanel slide={slide} presentationId={presentationId} onUpdate={onUpdate} />
      )}
      {activeTab === "polling" && <LivePollManager />}
      {activeTab === "coach" && presentationId && (
        <SlideCoachPanel
          slide={{ id: slide.id, block_type: slide.block_type, content: slide.content, notes: slide.notes }}
          slideIndex={slideIndex}
          totalSlides={slides.length}
          deckTitle=""
        />
      )}
    </div>
  );
}

function ProjectAssetsTab({ presentationId, slideId }: { presentationId: string; slideId: string }) {
  const { data: assets, isLoading } = useProjectAssets(presentationId);
  const upload = useUploadProjectAsset();
  const remove = useDeleteProjectAsset();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await upload.mutateAsync({ file, presentationId, slideId });
      toast.success("Asset uploaded");
    } catch (err) {
      toast.error("Upload failed");
    }
  };

  const handleDelete = async (asset: any) => {
    try {
      await remove.mutateAsync({ id: asset.id, filePath: asset.file_path, presentationId });
      toast.success("Asset deleted");
    } catch (err) {
      toast.error("Delete failed");
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Project Assets</div>
        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-3 h-3 mr-1" /> Upload
        </Button>
      </div>
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : !assets?.length ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No assets yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assets.map((asset) => (
            <div key={asset.id} className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-accent/50 group">
              {asset.file_type.startsWith("image/") ? (
                <img src={asset.publicUrl} alt="" className="w-10 h-10 rounded object-cover" />
              ) : (
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{asset.file_path.split("/").pop()}</p>
                <p className="text-[10px] text-muted-foreground">
                  {asset.file_size ? `${(asset.file_size / 1024).toFixed(1)} KB` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={() => handleDelete(asset)}
              >
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const { data: presentation } = usePresentation(id);
  const { data: slides = [], isLoading: slidesLoading } = useSlides(id);
  const createSlide = useCreateSlide();
  const updateSlide = useUpdateSlide();
  const deleteSlide = useDeleteSlide();
  const duplicateSlide = useDuplicateSlide();
  const reorderSlides = useReorderSlides();
  const updatePresentation = useUpdatePresentation();

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [showSlideGrid, setShowSlideGrid] = useState(false);
  const [showPresenterMode, setShowPresenterMode] = useState(false);
  const [showTeleprompter, setShowTeleprompter] = useState(false);
  const [showMobileTeleprompter, setShowMobileTeleprompter] = useState(false);
  const [showPipTeleprompter, setShowPipTeleprompter] = useState(false);
  const [showPracticeMode, setShowPracticeMode] = useState(false);
  const [showRehearsalMode, setShowRehearsalMode] = useState(false);
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [showLibraryDialog, setShowLibraryDialog] = useState(false);
  const [showRemixEngine, setShowRemixEngine] = useState(false);
  const [showQuickSketch, setShowQuickSketch] = useState(false);
  const [showAssetLibrary, setShowAssetLibrary] = useState(false);
  const [showImageSketchConverter, setShowImageSketchConverter] = useState(false);
  const [showRecordingMode, setShowRecordingMode] = useState(false);
  const [showLectureMode, setShowLectureMode] = useState(false);
  const [showArcSidebar, setShowArcSidebar] = useState(false);
  const [isPublic, setIsPublic] = useState(false);

  const activeSlide = slides[activeSlideIndex];

  const currentTheme = activeSlide ? parseTheme((activeSlide.content as any)?.theme) : undefined;
  const currentTransition: TransitionType = (activeSlide?.content as any)?.transition || "fade";

  const { undo, redo, canUndo, canRedo, push: pushState } = useUndoRedo(slides);

  useEffect(() => {
    if (slides.length > 0) {
      pushState(slides);
    }
  }, [slides.length]);

  useEffect(() => {
    if (presentation) {
      setIsPublic(presentation.is_public);
    }
  }, [presentation]);

  useEffect(() => {
    const handleOpenLibrary = () => setShowAssetLibrary(true);
    window.addEventListener('open-asset-library', handleOpenLibrary);
    return () => window.removeEventListener('open-asset-library', handleOpenLibrary);
  }, []);

  const handleAddSlide = async (blockType: string, content: Record<string, unknown> = {}) => {
    if (!id) return;
    const newOrder = slides.length;
    await createSlide.mutateAsync({ presentation_id: id, block_type: blockType, content: content as Json, sort_order: newOrder });
    setActiveSlideIndex(slides.length);
  };

  const handleUpdateSlide = async (content: Json, notes?: string) => {
    if (!activeSlide) return;
    await updateSlide.mutateAsync({ id: activeSlide.id, content, notes });
  };

  const handleDeleteSlide = async (slideId: string) => {
    if (!id) return;
    await deleteSlide.mutateAsync({ id: slideId, presentationId: id });
    if (activeSlideIndex >= slides.length - 1) {
      setActiveSlideIndex(Math.max(0, slides.length - 2));
    }
  };

  const handleDuplicateSlide = async (slide: Slide, index: number) => {
    await duplicateSlide.mutateAsync({ slide, sortOrder: index + 1 });
  };

  const handleReorderSlides = async (newOrder: string[]) => {
    if (!id) return;
    const reordered = newOrder.map((slideId, i) => ({ id: slideId, sort_order: i }));
    await reorderSlides.mutateAsync({ slides: reordered, presentationId: id });
  };

  const handleTogglePublic = async (pub: boolean) => {
    if (!id) return;
    setIsPublic(pub);
    await updatePresentation.mutateAsync({ id, is_public: pub });
  };

  const handlePrevSlide = () => {
    setActiveSlideIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextSlide = () => {
    setActiveSlideIndex((prev) => Math.min(slides.length - 1, prev + 1));
  };

  const handleThemeChange = (theme: SlideTheme) => {
    if (activeSlide) {
      const content = (typeof activeSlide.content === "object" && activeSlide.content !== null && !Array.isArray(activeSlide.content)) ? activeSlide.content as Record<string, unknown> : {};
      handleUpdateSlide({ ...content, theme: themeToJson(theme) } as Json, activeSlide.notes ?? undefined);
    }
  };

  const handleTransitionChange = (transition: TransitionType) => {
    if (activeSlide) {
      const content = (typeof activeSlide.content === "object" && activeSlide.content !== null && !Array.isArray(activeSlide.content)) ? activeSlide.content as Record<string, unknown> : {};
      handleUpdateSlide({ ...content, transition } as Json, activeSlide.notes ?? undefined);
    }
  };

  const saveBlock = useSaveBlock();
  const handleSaveToLibrary = async (slide: Slide, index: number) => {
    try {
      await saveBlock.mutateAsync({
        name: `Slide ${index + 1}`,
        block_type: slide.block_type,
        content: slide.content,
      });
      toast.success("Saved to library");
    } catch {
      toast.error("Failed to save");
    }
  };

  const swipeHandlers = useSwipeNavigation({
    onSwipeLeft: handleNextSlide,
    onSwipeRight: handlePrevSlide,
    disabled: showPresenterMode || showTeleprompter,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrevSlide();
      if (e.key === "ArrowRight") handleNextSlide();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [slides.length, activeSlideIndex]);

  if (slidesLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (showPresenterMode && activeSlide) {
    return (
      <PresenterMode
        slides={slides}
        startIndex={activeSlideIndex}
        onExit={() => setShowPresenterMode(false)}
      />
    );
  }

  if (showTeleprompter && activeSlide) {
    return (
      <TeleprompterMode
        slides={slides}
        startIndex={activeSlideIndex}
        onExit={() => setShowTeleprompter(false)}
      />
    );
  }

  if (showMobileTeleprompter && activeSlide) {
    return (
      <MobileTeleprompterMode
        slides={slides}
        startIndex={activeSlideIndex}
        onExit={() => setShowMobileTeleprompter(false)}
      />
    );
  }

  if (showPracticeMode && activeSlide) {
    return (
      <PracticeMode
        slides={slides}
        startIndex={activeSlideIndex}
        onExit={() => setShowPracticeMode(false)}
      />
    );
  }

  if (showRehearsalMode && activeSlide) {
    return (
      <RehearsalMode
        slides={slides}
        startIndex={activeSlideIndex}
        onExit={() => setShowRehearsalMode(false)}
        presentationId={id}
      />
    );
  }

  if (showRecordingMode && activeSlide) {
    return (
      <RecordingMode
        onClose={() => setShowRecordingMode(false)}
      />
    );
  }

  if (showLectureMode && activeSlide) {
    return (
      <LectureMode
        slides={slides}
        startIndex={activeSlideIndex}
        onExit={() => setShowLectureMode(false)}
      />
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <div className="border-b border-border bg-card px-4 py-2 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h1 className="font-semibold text-sm truncate max-w-[200px]">{presentation?.title || "Untitled"}</h1>
          </div>

          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={undo} disabled={!canUndo}>
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={redo} disabled={!canRedo}>
              <Redo2 className="w-4 h-4" />
            </Button>

            <div className="w-px h-6 bg-border mx-1" />

            <Button variant="ghost" size="icon" onClick={() => setShowSlideGrid(!showSlideGrid)}>
              <Grid3X3 className="w-4 h-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setShowThemePanel(true)}>
                  <Palette className="w-4 h-4 mr-2" /> Theme
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowLibraryDialog(true)}>
                  <BookmarkPlus className="w-4 h-4 mr-2" /> Insert from Library
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowRemixEngine(true)}>
                  <Sparkles className="w-4 h-4 mr-2" /> Remix Slide
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowQuickSketch(true)}>
                  <Pencil className="w-4 h-4 mr-2" /> Quick Sketch
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowAssetLibrary(true)}>
                  <Shapes className="w-4 h-4 mr-2" /> Visual Assets
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowPresenterMode(true)}>
                  <Play className="w-4 h-4 mr-2" /> Presenter Mode
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => isMobile ? setShowMobileTeleprompter(true) : setShowTeleprompter(true)}>
                  <Mic className="w-4 h-4 mr-2" /> Teleprompter
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowPracticeMode(true)}>
                  <Timer className="w-4 h-4 mr-2" /> Practice Mode
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowRehearsalMode(true)}>
                  <Brain className="w-4 h-4 mr-2" /> Rehearsal Mode
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowRecordingMode(true)}>
                  <Video className="w-4 h-4 mr-2" /> Recording Mode
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowLectureMode(true)}>
                  <GraduationCap className="w-4 h-4 mr-2" /> Lecture Mode
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <ExportPdfButton slides={slides} title={presentation?.title || "Untitled"} />
                <ExportPptxButton slides={slides} title={presentation?.title || "Untitled"} />
                <PrintDialog slides={slides} title={presentation?.title || "Untitled"} />
                <SpeakerScriptDocument slides={slides} title={presentation?.title || "Untitled"} />
                <CopyToTeleprompterButton slides={slides} onOpenTeleprompter={() => isMobile ? setShowMobileTeleprompter(true) : setShowTeleprompter(true)} />
                <DropdownMenuSeparator />
                <ShareDialog presentationId={id!} isPublic={isPublic} onTogglePublic={handleTogglePublic} />
                <CollaborationDialog presentationId={id!} />
              </DropdownMenuContent>
            </DropdownMenu>

            <Button size="sm" onClick={() => setShowPresenterMode(true)}>
              <Play className="w-4 h-4 mr-1" /> Present
            </Button>
          </div>
        </div>

        {showSlideGrid && (
          <div className="border-b border-border bg-muted/30 p-4 overflow-x-auto">
            <div className="flex gap-3 min-w-max">
              {slides.map((slide, idx) => (
                <motion.div
                  key={slide.id}
                  className={`relative cursor-pointer group ${idx === activeSlideIndex ? "ring-2 ring-primary" : ""}`}
                  onClick={() => setActiveSlideIndex(idx)}
                  whileHover={{ scale: 1.05 }}
                >
                  <div className="w-32 aspect-video bg-card border border-border rounded-lg overflow-hidden">
                    <ScaledSlide>
                      <SlideRenderer blockType={slide.block_type} content={slide.content} />
                    </ScaledSlide>
                  </div>
                  <div className="absolute top-1 left-1 bg-background/90 text-xs px-1.5 py-0.5 rounded">
                    {idx + 1}
                  </div>
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex gap-1">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicateSlide(slide, idx);
                      }}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSlide(slide.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  {id && <SlidePresenceIndicator presentationId={id} slideIndex={idx} />}
                </motion.div>
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-32 aspect-video shrink-0">
                    <Plus className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {blockTypes.map((bt) => (
                    <DropdownMenuItem key={bt.id} onClick={() => handleAddSlide(bt.id)}>
                      <bt.icon className="w-4 h-4 mr-2" /> {bt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {isMobile ? (
            <MobileEditorLayout
              slides={slides}
              activeIndex={activeSlideIndex}
              setActiveIndex={setActiveSlideIndex}
              activeSlide={activeSlide}
              theme={currentTheme || {} as SlideTheme}
              transition={currentTransition}
              presentationId={id}
              title={presentation?.title || "Untitled"}
              onUpdateSlide={handleUpdateSlide}
              onAddSlide={handleAddSlide}
              onDeleteSlide={handleDeleteSlide}
              onDuplicateSlide={handleDuplicateSlide}
              onPresent={() => setShowPresenterMode(true)}
              onPractice={() => setShowPracticeMode(true)}
              onRehearsal={() => setShowRehearsalMode(true)}
              onRecord={() => setShowRecordingMode(true)}
              onLecture={() => setShowLectureMode(true)}
              onTeleprompter={() => setShowMobileTeleprompter(true)}
              onPipTeleprompter={() => setShowPipTeleprompter(true)}
              onBack={() => navigate("/dashboard")}
              onThemeChange={handleThemeChange}
              onTransitionChange={handleTransitionChange}
              onRemix={(slide) => setShowRemixEngine(true)}
              onSaveToLibrary={handleSaveToLibrary}
              onSketch={() => setShowQuickSketch(true)}
              onAssetLibrary={() => setShowAssetLibrary(true)}
              onSketchConverter={() => setShowImageSketchConverter(true)}
              blockTypes={mobileBlockTypes}
              renderContentEditor={(slide) => <SlideContentEditor slide={slide} onUpdate={handleUpdateSlide} />}
              renderScriptEditor={(slide) => <SpeakerScriptPanel slide={slide} onUpdate={handleUpdateSlide} />}
              renderImageControls={(slide) => {
                const c = (typeof slide.content === "object" && slide.content !== null && !Array.isArray(slide.content)) ? slide.content as Record<string, unknown> : {};
                return <SlideImageControls slide={slide} content={c} onUpdate={handleUpdateSlide} onOpenLibrary={() => setShowAssetLibrary(true)} />;
              }}
            />
          ) : (
            <>
              <div className="flex-1 flex flex-col items-center justify-center bg-muted/30 p-8 overflow-auto relative">
                {activeSlide ? (
                  <>
                    <CollaborationPresence presentationId={id!} activeSlideIndex={activeSlideIndex} />
                    <div className="relative">
                      <SlideRenderer
                        blockType={activeSlide.block_type}
                        content={activeSlide.content}
                        theme={currentTheme}
                        slideId={activeSlide.id}
                        editable
                        onOverlaysChange={(overlays) => {
                          const content = (typeof activeSlide.content === "object" && activeSlide.content !== null && !Array.isArray(activeSlide.content)) ? activeSlide.content as Record<string, unknown> : {};
                          handleUpdateSlide({ ...content, overlays } as unknown as Json, activeSlide.notes ?? undefined);
                        }}
                      />
                      <ContextualToolbar
                        blockType={activeSlide.block_type}
                        content={(typeof activeSlide.content === "object" && activeSlide.content !== null && !Array.isArray(activeSlide.content)) ? activeSlide.content as Record<string, unknown> : {}}
                        onUpdate={handleUpdateSlide}
                        notes={activeSlide.notes}
                      />
                    </div>
                    <div className="mt-6 flex items-center gap-3">
                      <Button variant="outline" size="sm" onClick={handlePrevSlide} disabled={activeSlideIndex === 0}>
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {activeSlideIndex + 1} / {slides.length}
                      </span>
                      <Button variant="outline" size="sm" onClick={handleNextSlide} disabled={activeSlideIndex === slides.length - 1}>
                        <ChevronLeft className="w-4 h-4 rotate-180" />
                      </Button>
                    </div>
                    <AutoSuggestSlide
                      slides={slides}
                      onAddSlide={handleAddSlide}
                    />
                    {activeSlide.content && (
                      <ContentRadar
                        blockType={activeSlide.block_type}
                        content={activeSlide.content}
                        notes={activeSlide.notes}
                      />
                    )}
                  </>
                ) : (
                  <div className="text-center">
                    <p className="text-muted-foreground mb-4">No slides yet</p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button>
                          <Plus className="w-4 h-4 mr-2" /> Add First Slide
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {blockTypes.map((bt) => (
                          <DropdownMenuItem key={bt.id} onClick={() => handleAddSlide(bt.id)}>
                            <bt.icon className="w-4 h-4 mr-2" /> {bt.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
                <QuickCapture onAddSlide={handleAddSlide} />
              </div>

              {activeSlide && (
                <SlidePropertiesPanel slide={activeSlide} slides={slides} presentationId={id} onUpdate={handleUpdateSlide} onOpenLibrary={() => setShowAssetLibrary(true)} />
              )}

              {showArcSidebar && (
                <EditorArcSidebar
                  open={showArcSidebar}
                  onClose={() => setShowArcSidebar(false)}
                  currentSlide={activeSlide ? { block_type: activeSlide.block_type, content: activeSlide.content, notes: activeSlide.notes } : null}
                  slideIndex={activeSlideIndex}
                  totalSlides={slides.length}
                  deckTitle={presentation?.title || "Untitled"}
                  allSlides={slides.map(s => ({ id: s.id, block_type: s.block_type, content: s.content, sort_order: s.sort_order, presentation_id: s.presentation_id }))}
                />
              )}
            </>
          )}
        </div>
      </div>

      {showRemixEngine && activeSlide && (
        <SlideRemixEngine
          slide={activeSlide}
          open={showRemixEngine}
          onOpenChange={setShowRemixEngine}
          onUpdate={(blockType, content) => {
            handleUpdateSlide(content);
          }}
        />
      )}

      <QuickSketchCanvas
        open={showQuickSketch}
        onClose={() => setShowQuickSketch(false)}
        onExport={(dataUrl) => {
          if (activeSlide) {
            const content = (typeof activeSlide.content === "object" && activeSlide.content !== null && !Array.isArray(activeSlide.content)) ? activeSlide.content as Record<string, unknown> : {};
            const existing = (content.overlays as SlideOverlay[] | undefined) || [];
            const newOverlay: SlideOverlay = { id: createOverlayId(), type: "image", src: dataUrl, x: 810, y: 390, width: 300, height: 300 };
            handleUpdateSlide({ ...content, overlays: [...existing, newOverlay] } as unknown as Json, activeSlide.notes ?? undefined);
          }
          setShowQuickSketch(false);
        }}
      />

      <VisualAssetLibrary
        open={showAssetLibrary}
        onClose={() => setShowAssetLibrary(false)}
        onInsertSvg={(dataUrl) => {
          if (activeSlide) {
            const content = (typeof activeSlide.content === "object" && activeSlide.content !== null && !Array.isArray(activeSlide.content)) ? activeSlide.content as Record<string, unknown> : {};
            const existing = (content.overlays as SlideOverlay[] | undefined) || [];
            const newOverlay: SlideOverlay = { id: createOverlayId(), type: "image", src: dataUrl, x: 810, y: 390, width: 300, height: 300 };
            handleUpdateSlide({ ...content, overlays: [...existing, newOverlay] } as unknown as Json, activeSlide.notes ?? undefined);
          }
        }}
        onSelectImage={(url) => {
          if (activeSlide) {
            const content = (typeof activeSlide.content === "object" && activeSlide.content !== null && !Array.isArray(activeSlide.content)) ? activeSlide.content as Record<string, unknown> : {};
            handleUpdateSlide({ ...content, imageUrl: url } as any, activeSlide.notes ?? undefined);
          }
        }}
      />

      {showImageSketchConverter && (
        <ImageToSketchConverter
          open={showImageSketchConverter}
          onClose={() => setShowImageSketchConverter(false)}
          onInsert={(imageUrl) => {
            if (activeSlide) {
              const content = (typeof activeSlide.content === "object" && activeSlide.content !== null && !Array.isArray(activeSlide.content)) ? activeSlide.content as Record<string, unknown> : {};
              handleUpdateSlide({ ...content, imageUrl } as Json, activeSlide.notes ?? undefined);
            }
            setShowImageSketchConverter(false);
          }}
        />
      )}

      {showThemePanel && (
        <Sheet open={showThemePanel} onOpenChange={setShowThemePanel}>
          <SheetContent side="right" className="w-96">
            <SheetHeader>
              <SheetTitle>Theme Settings</SheetTitle>
            </SheetHeader>
            <ThemePanel
              theme={currentTheme || {} as SlideTheme}
              transition={currentTransition}
              onThemeChange={handleThemeChange}
              onTransitionChange={handleTransitionChange}
              slides={slides}
            />
          </SheetContent>
        </Sheet>
      )}

      <InsertFromLibraryDialog
        onInsert={(blockType, content) => {
          if (activeSlide) {
            handleUpdateSlide(content, activeSlide.notes ?? undefined);
          }
        }}
      >
        <span />
      </InsertFromLibraryDialog>

      {showPipTeleprompter && (
        <PipTeleprompter
          slides={slides}
          startIndex={activeSlideIndex}
          onClose={() => setShowPipTeleprompter(false)}
        />
      )}
    </DashboardLayout>
  );
}
