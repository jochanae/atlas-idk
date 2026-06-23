import { useState, useRef } from "react";
import { Sparkles, Loader2, Wand2, Zap, GraduationCap, Briefcase, Rocket, Lightbulb, Paperclip, FileText, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { usePresentations } from "@/hooks/usePresentations";

const styleOptions = [
  { value: "professional", label: "Professional", icon: Briefcase, desc: "Clean & corporate" },
  { value: "creative", label: "Creative", icon: Lightbulb, desc: "Bold & expressive" },
  { value: "educational", label: "Educational", icon: GraduationCap, desc: "Clear & structured" },
  { value: "startup", label: "Startup Pitch", icon: Rocket, desc: "Punchy & persuasive" },
];

const slideCountOptions = [6, 8, 10, 12];

const examplePrompts = [
  "A pitch deck for a sustainable fashion marketplace targeting Gen Z investors",
  "Workshop presentation on AI productivity tools for small business owners",
  "Quarterly business review showing 40% revenue growth and expansion plans",
  "TEDx-style talk about the science of habit formation and behavior change",
];

const ACCEPTED_FILE_TYPES = ".pdf,.pptx,.docx,.txt,.md,.csv,.doc";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export default function GenerateDeckDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("professional");
  const [slideCount, setSlideCount] = useState(8);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [selectedPresentationId, setSelectedPresentationId] = useState<string | null>(null);
  const [selectedPresentationTitle, setSelectedPresentationTitle] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [showDeckPicker, setShowDeckPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: presentations = [] } = usePresentations();
  const activePresentations = presentations.filter((p) => !p.deleted_at);

  const hasContext = !!selectedPresentationId || !!attachedFile;
  const canGenerate = topic.trim().length >= 3 || hasContext;

  const resetState = () => {
    setTopic("");
    setIsGenerating(false);
    setProgress("");
    setSelectedPresentationId(null);
    setSelectedPresentationTitle(null);
    setAttachedFile(null);
    setShowDeckPicker(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large (max 20 MB)");
      return;
    }
    setAttachedFile(file);
    // Clear the other attachment type
    setSelectedPresentationId(null);
    setSelectedPresentationTitle(null);
    setShowDeckPicker(false);
  };

  const handleSelectPresentation = (id: string, title: string) => {
    setSelectedPresentationId(id);
    setSelectedPresentationTitle(title);
    setShowDeckPicker(false);
    // Clear file attachment
    setAttachedFile(null);
  };

  const handleGenerate = async () => {
    if (!canGenerate) {
      toast.error("Please describe your topic or attach context");
      return;
    }

    setIsGenerating(true);
    setProgress("Crafting your presentation structure...");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please log in first");

      const progressTimer = setTimeout(() => setProgress("Writing slide content & speaker notes..."), 4000);
      const progressTimer2 = setTimeout(() => setProgress("Building your deck..."), 8000);

      // Build context payloads
      let existingDeckContext: string | undefined;
      let attachedFileContent: string | undefined;
      let attachedFileName: string | undefined;

      if (selectedPresentationId) {
        setProgress("Loading existing deck slides...");
        const { data: slides } = await supabase
          .from("slides")
          .select("block_type, content, notes")
          .eq("presentation_id", selectedPresentationId)
          .order("sort_order");

        if (slides?.length) {
          // Compact serialization: only essential fields
          const compact = slides.map((s: any) => ({
            type: s.block_type,
            heading: s.content?.heading || "",
            body: s.content?.body || s.content?.quote || "",
            notes: (s.notes || "").slice(0, 200),
          }));
          existingDeckContext = JSON.stringify(compact);
        }
        setProgress("Crafting your presentation structure...");
      }

      if (attachedFile) {
        attachedFileName = attachedFile.name;
        const isText = /\.(txt|md|csv|json|xml|html|css|js|ts)$/i.test(attachedFile.name);
        if (isText) {
          attachedFileContent = await attachedFile.text();
          // Limit to 100k chars
          if (attachedFileContent.length > 100_000) {
            attachedFileContent = attachedFileContent.slice(0, 100_000);
          }
        } else {
          // For binary files, just send the filename as context hint
          attachedFileContent = `[Binary file: ${attachedFile.name}, ${(attachedFile.size / 1024).toFixed(0)} KB. Content cannot be parsed directly — use this filename as context.]`;
        }
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-full-deck`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            topic: topic.trim() || (selectedPresentationTitle ? `Regenerate: ${selectedPresentationTitle}` : attachedFileName || ""),
            slideCount,
            style,
            fullPrompt: topic.trim(),
            existingDeckContext,
            attachedFileContent,
            attachedFileName,
          }),
        }
      );

      clearTimeout(progressTimer);
      clearTimeout(progressTimer2);

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Generation failed");
      }

      qc.invalidateQueries({ queryKey: ["presentations"] });
      toast.success(`"${result.title}" created with ${result.slideCount} slides!`);
      setOpen(false);
      resetState();
      navigate(`/editor/${result.id}`);
    } catch (err: any) {
      console.error("Generate deck error:", err);
      toast.error(err.message || "Failed to generate deck");
    } finally {
      setIsGenerating(false);
      setProgress("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState(); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Deck Generator
          </DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {isGenerating ? (
            <motion.div
              key="generating"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-12 gap-4"
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Wand2 className="w-7 h-7 text-primary animate-pulse" />
                </div>
                <Loader2 className="w-20 h-20 text-primary/30 animate-spin absolute -top-2 -left-2" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">{progress}</p>
                <p className="text-xs text-muted-foreground">This usually takes 10–20 seconds</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4 mt-2"
            >
              {/* Topic input */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  What's your presentation about?
                  {hasContext && <span className="text-primary ml-1">(optional with attachment)</span>}
                </label>
                <Textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={hasContext ? "Describe how you'd like it changed, or leave blank to regenerate as-is" : "e.g. A pitch deck for a sustainable fashion marketplace targeting Gen Z investors"}
                  className="min-h-[80px] resize-none text-sm"
                  maxLength={500}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{topic.length}/500</span>
                </div>
              </div>

              {/* Attach context section */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Attach context</span>
                </div>

                {/* Attachment chips */}
                {!selectedPresentationId && !attachedFile && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDeckPicker(!showDeckPicker)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary/40 hover:bg-secondary/60 hover:border-primary/30 transition-all text-xs text-muted-foreground hover:text-foreground"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      From existing deck
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary/40 hover:bg-secondary/60 hover:border-primary/30 transition-all text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload a file
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_FILE_TYPES}
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>
                )}

                {/* Selected presentation badge */}
                {selectedPresentationId && selectedPresentationTitle && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-sm">
                    <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="flex-1 truncate text-foreground text-xs">{selectedPresentationTitle}</span>
                    <button
                      type="button"
                      onClick={() => { setSelectedPresentationId(null); setSelectedPresentationTitle(null); }}
                      className="shrink-0 p-0.5 rounded hover:bg-muted"
                    >
                      <X className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </div>
                )}

                {/* Attached file badge */}
                {attachedFile && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-sm">
                    <Upload className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="flex-1 truncate text-foreground text-xs">{attachedFile.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{(attachedFile.size / 1024).toFixed(0)} KB</span>
                    <button
                      type="button"
                      onClick={() => setAttachedFile(null)}
                      className="shrink-0 p-0.5 rounded hover:bg-muted"
                    >
                      <X className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </div>
                )}

                {/* Deck picker dropdown */}
                {showDeckPicker && (
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                    {activePresentations.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-3 text-center">No presentations yet</p>
                    ) : (
                      activePresentations.slice(0, 20).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleSelectPresentation(p.id, p.title)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-secondary/60 transition-colors truncate text-foreground"
                        >
                          {p.title}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Example prompts */}
              {!topic && !hasContext && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Try an example</p>
                  <div className="flex flex-wrap gap-1.5">
                    {examplePrompts.map((prompt, i) => (
                      <button
                        key={i}
                        onClick={() => setTopic(prompt)}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-secondary/60 border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors truncate max-w-[220px]"
                      >
                        {prompt.slice(0, 50)}…
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Style selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Style</label>
                <div className="grid grid-cols-2 gap-2">
                  {styleOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setStyle(opt.value)}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all text-left ${
                        style === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                      }`}
                    >
                      <opt.icon className={`w-4 h-4 shrink-0 ${style === opt.value ? "text-primary" : "text-muted-foreground"}`} />
                      <div>
                        <p className="text-xs font-medium">{opt.label}</p>
                        <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Slide count */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Number of slides</label>
                <div className="flex items-center gap-2">
                  {slideCountOptions.map((n) => (
                    <button
                      key={n}
                      onClick={() => setSlideCount(n)}
                      className={`h-8 w-10 rounded-lg text-xs font-medium transition-all ${
                        slideCount === n
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary/60 border border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate button */}
              <Button
                className="w-full bg-gradient-gold text-primary-foreground font-semibold gap-2"
                onClick={handleGenerate}
                disabled={!canGenerate}
              >
                <Zap className="w-4 h-4" />
                {selectedPresentationId ? "Regenerate Deck" : `Generate ${slideCount}-Slide Deck`}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
