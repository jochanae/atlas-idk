import { useMemo, useCallback, useState } from "react";
import { parseArcActions, getActionLabel, useApplyArcActions, stripArcActionsBlock } from "@/hooks/useArcActions";
import { useSlides } from "@/hooks/useSlides";
import { Layers, CheckCircle2, Copy, FileText, Image, Sparkles, ExternalLink, Search, StickyNote, Download, Link2, Wand2, Check, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import DeepDiveButtons from "@/components/dashboard/DeepDiveButtons";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useArc, type Message } from "./ArcProvider";
import type { MutableRefObject } from "react";

/** Parse slides-json blocks and render visual slide cards instead of raw JSON */
function parseSlideBlocks(content: string): { cleanedContent: string; slideDecks: Array<Array<{ block_type: string; heading: string }>> } {
  const slideDecks: Array<Array<{ block_type: string; heading: string }>> = [];
  const cleaned = content.replace(/```slides-json\s*([\s\S]*?)```/g, (_match, json) => {
    try {
      const slides = JSON.parse(json);
      if (Array.isArray(slides)) {
        slideDecks.push(slides.map((s: any) => ({
          block_type: s.block_type || s.slide_type || "slide",
          heading: s.content?.heading || s.content?.quote?.slice(0, 40) || "Untitled",
        })));
        return "___SLIDE_DECK___";
      }
    } catch { /* ignore */ }
    return "___SLIDE_DECK___";
  });
  return { cleanedContent: cleaned, slideDecks };
}

/** Parse arc-chat-image blocks and extract image URLs */
function parseInlineImages(content: string): { cleanedContent: string; images: string[] } {
  const images: string[] = [];
  const cleaned = content.replace(/```arc-chat-image\s*([\s\S]*?)```/g, (_match, json) => {
    try {
      const data = JSON.parse(json);
      if (data.url) {
        images.push(data.url);
        return "___ARC_IMAGE___";
      }
    } catch { /* ignore */ }
    return "";
  });
  return { cleanedContent: cleaned, images };
}

/** Detect if content has an incomplete (still-streaming) slides-json block */
function hasPartialSlidesBlock(content: string): boolean {
  // Has opening fence but no closing fence
  const openCount = (content.match(/```slides-json/g) || []).length;
  const closeAfterOpen = content.split("```slides-json").slice(1).filter(part => part.includes("```")).length;
  return openCount > closeAfterOpen;
}

/** Also catch raw JSON arrays that look like slide definitions (without code fences) */
function parseRawSlideJson(content: string): { cleanedContent: string; slideDecks: Array<Array<{ block_type: string; heading: string }>> } {
  const slideDecks: Array<Array<{ block_type: string; heading: string }>> = [];
  const cleaned = content.replace(/(?:^|\n)\s*(\[[\s\S]*?"(?:block_type|slide_type)"[\s\S]*?\])\s*(?:\n|$)/g, (match, json) => {
    try {
      const slides = JSON.parse(json);
      if (Array.isArray(slides) && slides.length > 0 && slides[0] && (slides[0].block_type || slides[0].slide_type)) {
        slideDecks.push(slides.map((s: any) => ({
          block_type: s.block_type || s.slide_type || "slide",
          heading: s.content?.heading || s.content?.quote?.slice(0, 40) || "Untitled",
        })));
        return "\n___RAW_SLIDE_DECK___\n";
      }
    } catch { /* not valid JSON */ }
    return match;
  });
  return { cleanedContent: cleaned, slideDecks };
}

/** Strip any remaining raw JSON objects (single slide definitions) from content */
function stripRawJsonObjects(content: string): string {
  return content
    // Strip fenced JSON with block_type/slide_type
    .replace(/```(?:json)?\s*\{[\s\S]*?"(?:block_type|slide_type)"[\s\S]*?\}\s*```/g, "")
    // Strip bare JSON objects with block_type/slide_type + speaker_script
    .replace(/(?:^|\n)\s*\{[\s\n]*"(?:block_type|slide_type)"[^}]*"speaker_script"[^}]*\}\s*(?:\n|$)/g, "\n")
    // Strip raw JSON arrays containing slide_id or arc-action style objects
    .replace(/```(?:json)?\s*\[[\s\S]*?"slide_id"[\s\S]*?\]\s*```/g, "")
    .replace(/(?:^|\n)\s*\[[\s\S]*?"slide_id"[\s\S]*?\]\s*(?:\n|$)/gm, "\n");
}

/** Generation animation shown while slides are being streamed */
function DeckGenerationVisual() {
  const slideTypes = ["title", "story", "framework", "data", "comparison", "cta"];
  return (
    <div className="my-3 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 p-4 overflow-hidden">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
        </div>
        <div>
          <p className="text-xs font-semibold text-primary">Building your deck…</p>
          <p className="text-[10px] text-muted-foreground">Crafting slides, scripts & transitions</p>
        </div>
      </div>
      {/* Animated slide type pills */}
      <div className="flex flex-wrap gap-1.5">
        {slideTypes.map((type, i) => (
          <span
            key={type}
            className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary/70 border border-primary/20 animate-fade-in capitalize"
            style={{ animationDelay: `${i * 200}ms`, animationFillMode: "both" }}
          >
            {type}
          </span>
        ))}
      </div>
      {/* Progress shimmer */}
      <div className="mt-3 h-1.5 rounded-full bg-primary/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary/40 via-primary to-primary/40"
          style={{
            width: "40%",
            animation: "shimmer 2s ease-in-out infinite",
          }}
        />
      </div>
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
}

function ArcActionCard({ content }: { content: string }) {
  const actions = parseArcActions(content);
  const { id: urlPresentationId } = useParams<{ id: string }>();
  const { activePresentationId } = useArc();
  const presentationId = activePresentationId ?? urlPresentationId ?? null;
  const { data: slides } = useSlides(presentationId ?? undefined);
  const applyActions = useApplyArcActions();
  const [applied, setApplied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  if (!actions.length) return null;

  const handleApply = async () => {
    if (!slides || !presentationId) return;
    setLoading(true);
    const result = await applyActions(actions, slides, presentationId);
    setLoading(false);
    if (result.success) {
      setApplied(true);
      toast.success(`${result.applied} change${result.applied > 1 ? "s" : ""} applied!`);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">
            {actions.length} change{actions.length > 1 ? "s" : ""} ready
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(p => !p)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {expanded ? "Hide" : "Preview"}
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {!applied ? (
            <Button
              size="sm"
              className="h-7 text-xs bg-primary text-primary-foreground"
              onClick={handleApply}
              disabled={loading}
            >
              {loading ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Applying...</>
              ) : (
                "Apply"
              )}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-primary font-medium">
                <Check className="w-3 h-3" /> Applied
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-primary/30 text-primary"
                onClick={() => navigate(`/editor/${presentationId}`)}
              >
                View Deck →
              </Button>
            </div>
          )}
        </div>
      </div>
      {expanded && (
        <div className="border-t border-primary/10 px-4 py-2 space-y-1">
          {actions.map((action, i) => (
            <div key={i} className="text-xs text-muted-foreground flex items-start gap-2 py-0.5">
              <span className="text-primary mt-0.5">•</span>
              <span>{getActionLabel(action)}{action.reason ? ` — ${action.reason}` : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssistantMessage({ content, isStreaming, onViewDeck }: { content: string; isStreaming?: boolean; onViewDeck?: (title: string) => void }) {
  const displayContent = useMemo(() => stripArcActionsBlock(content), [content]);
  const isGenerating = useMemo(() => isStreaming && hasPartialSlidesBlock(displayContent), [displayContent, isStreaming]);
  const { cleanedContent, slideDecks } = useMemo(() => parseSlideBlocks(displayContent), [displayContent]);
  const { cleanedContent: finalContent, images } = useMemo(() => parseInlineImages(cleanedContent), [cleanedContent]);

  // Also catch raw JSON slides not in code fences
  const { cleanedContent: afterRawJson, slideDecks: rawDecks } = useMemo(() => parseRawSlideJson(finalContent), [finalContent]);
  const allSlideDecks = [...slideDecks, ...rawDecks];

  let strippedContent = stripRawJsonObjects(
    stripArcActionsBlock(
      afterRawJson
        .replace(/```arc-image[\s\S]*?```/g, "\n🎨 **Generating image for your slide...**\n")
        .replace(/```arc-generate-image[\s\S]*?```/g, "\n🎨 **Generating image…**\n")
    )
  );

  // If we're mid-generation, strip the partial slides-json block content  
  if (isGenerating) {
    // Remove everything from ```slides-json onward (it's still streaming)
    strippedContent = strippedContent.replace(/```slides-json[\s\S]*$/, "").trim();
  }

  // Re-interleave: split by all markers
  const allParts = strippedContent.split(/(___SLIDE_DECK___|___RAW_SLIDE_DECK___|___ARC_IMAGE___)/);
  let deckIndex = 0;
  let imgIndex = 0;

  return (
    <div className="prose prose-sm prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ol]:mb-2">
      {allParts.map((part, i) => {
        if (part === "___SLIDE_DECK___" || part === "___RAW_SLIDE_DECK___") {
          const deck = allSlideDecks[deckIndex++];
          if (!deck) return null;
          const titleSlide = deck.find(s => s.block_type === "title");
          const deckTitle = titleSlide?.heading || deck[0]?.heading || "Untitled";
          return (
            <div key={`deck-${i}`} className="my-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <span className="font-display font-semibold text-xs text-primary">
                  {deck.length} slides generated
                </span>
              </div>
              <div className="space-y-1">
                {deck.map((slide, j) => (
                  <div key={j} className="flex items-center gap-2 text-xs text-foreground/80">
                    <Layers className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="capitalize text-muted-foreground w-16 shrink-0">{slide.block_type}</span>
                    <span className="truncate">{slide.heading}</span>
                  </div>
                ))}
              </div>
              {onViewDeck && !isStreaming && (
                <div className="flex gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => onViewDeck(deckTitle)}
                  >
                    <ExternalLink className="w-3 h-3" /> Open in Editor
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5 border-border"
                    onClick={() => {
                      // Find presentation by title and copy its share link
                      import("@/integrations/supabase/client").then(({ supabase }) => {
                        supabase
                          .from("presentations")
                          .select("id")
                          .eq("title", deckTitle)
                          .order("created_at", { ascending: false })
                          .limit(1)
                          .then(({ data }) => {
                            if (data?.[0]) {
                              const url = `${window.location.origin}/view/${data[0].id}`;
                              navigator.clipboard.writeText(url);
                              toast.success("Presentation link copied!");
                            } else {
                              toast.error("Deck not found — it may still be saving");
                            }
                          });
                      });
                    }}
                  >
                    <Link2 className="w-3 h-3" /> Copy Link
                  </Button>
                </div>
              )}
            </div>
          );
        }
        if (part === "___ARC_IMAGE___") {
          const url = images[imgIndex++];
          if (!url) return null;
          return (
            <div key={`img-${i}`} className="my-3 rounded-lg overflow-hidden border border-primary/20">
              <img src={url} alt="Arc generated image" className="w-full rounded-lg" loading="lazy" />
              <div className="flex items-center justify-between px-3 py-1.5 bg-primary/5">
                <div className="flex items-center gap-2">
                  <Image className="w-3 h-3 text-primary" />
                  <span className="text-[10px] text-muted-foreground">Generated by Arc</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-2"
                    onClick={() => {
                      navigator.clipboard.writeText(url);
                      toast.success("Image link copied!");
                    }}
                  >
                    <Copy className="w-3 h-3" /> Copy Link
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-2"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `arc-image-${Date.now()}.png`;
                      a.click();
                      toast.success("Downloading image");
                    }}
                  >
                    <Download className="w-3 h-3" /> Download
                  </Button>
                </div>
              </div>
            </div>
          );
        }
        if (part.trim()) {
          return <ReactMarkdown key={`text-${i}`}>{part}</ReactMarkdown>;
        }
        return null;
      })}

      {/* Show generation animation when slides-json is actively streaming */}
      {isGenerating && <DeckGenerationVisual />}
      {!isStreaming && <ArcActionCard content={content} />}
    </div>
  );
}

interface ArcMessageListProps {
  messages: Message[];
  isLoading: boolean;
  teleprompterCallbackRef: MutableRefObject<((text: string) => void) | null>;
}

export default function ArcMessageList({ messages, isLoading, teleprompterCallbackRef }: ArcMessageListProps) {
  const { id: presentationId } = useParams();
  // Synthesize a research handoff prompt from the full conversation
  const userMessages = messages.filter(m => m.role === "user");
  const assistantMessages = messages.filter(m => m.role === "assistant");
  const synthesizedPrompt = useMemo(() => {
    if (userMessages.length === 0) return "";
    const originalTopic = userMessages[0]?.content || "";
    if (assistantMessages.length === 0) return originalTopic;

    const keyPoints = assistantMessages
      .map(m => m.content
        .replace(/```[\s\S]*?```/g, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/#{1,6}\s/g, "")
        .trim()
      )
      .filter(Boolean)
      .map(text => {
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text.slice(0, 150)];
        return sentences.slice(0, 2).join("").trim();
      })
      .filter(p => p.length > 20);

    const latestQuestion = userMessages[userMessages.length - 1]?.content || "";
    const bulletPoints = keyPoints.slice(0, 5).map(p => `• ${p}`).join("\n");

    let prompt = `I've been exploring "${originalTopic.slice(0, 100)}" and here's what I've covered so far:\n\n${bulletPoints}`;
    if (latestQuestion && latestQuestion !== originalTopic) {
      prompt += `\n\nMy latest question: ${latestQuestion}`;
    }
    prompt += `\n\nPlease continue from here and help me explore this further.`;
    return prompt.slice(0, 2000);
  }, [messages]);
  const navigate = useNavigate();

  const handleSaveToNotes = useCallback(async (content: string) => {
    if (!presentationId) {
      toast.error("Open a presentation first to save notes");
      return;
    }
    // Clean the content for notes
    const cleaned = content
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/#{1,6}\s/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .trim();

    // Get the first slide to append notes to
    const { data: slides } = await supabase
      .from("slides")
      .select("id, notes")
      .eq("presentation_id", presentationId)
      .order("sort_order")
      .limit(1);

    if (!slides?.length) {
      toast.error("No slides found in this presentation");
      return;
    }

    const slide = slides[0];
    const existingNotes = slide.notes || "";
    const separator = existingNotes ? "\n\n---\n📋 Arc Notes:\n" : "📋 Arc Notes:\n";
    const newNotes = existingNotes + separator + cleaned;

    const { error } = await supabase
      .from("slides")
      .update({ notes: newNotes })
      .eq("id", slide.id);

    if (error) {
      toast.error("Failed to save notes");
    } else {
      toast.success("Saved to speaker notes on slide 1");
    }
  }, [presentationId]);

  const handleViewDeck = useCallback((deckTitle: string) => {
    // Find matching presentation by title and navigate to it
    import("@/integrations/supabase/client").then(({ supabase }) => {
      supabase
        .from("presentations")
        .select("id")
        .eq("title", deckTitle)
        .order("created_at", { ascending: false })
        .limit(1)
        .then(({ data }) => {
          if (data?.[0]) {
            navigate(`/editor/${data[0].id}`);
          } else {
            toast.error("Deck not found — it may still be saving");
          }
        });
    });
  }, [navigate]);

  return (
    <>
      {messages.map((msg, i) => {
        const isLastAssistant = msg.role === "assistant" && i === messages.length - 1;
        const isStreaming = isLastAssistant && isLoading;
        
        return (
          <div
            key={i}
            className="animate-fade-in"
            style={{ animationDelay: `${Math.min(i * 50, 200)}ms`, animationFillMode: "both" }}
          >
            <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-foreground"
                }`}
              >
                {msg.role === "assistant" ? (
                  <AssistantMessage content={msg.content} isStreaming={isStreaming} onViewDeck={handleViewDeck} />
                ) : (
                  msg.content
                )}
              </div>
            </div>
            {/* Actions on last assistant message only (not while streaming) */}
            {isLastAssistant && !isLoading && (
              <div className="mt-1.5 ml-1 space-y-2 animate-fade-in" style={{ animationDelay: "100ms", animationFillMode: "both" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  {teleprompterCallbackRef.current && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        const clean = msg.content
                          .replace(/```[\s\S]*?```/g, "")
                          .replace(/\*\*(.*?)\*\*/g, "$1")
                          .replace(/\*(.*?)\*/g, "$1")
                          .replace(/#{1,6}\s/g, "")
                          .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
                          .replace(/^[-*]\s/gm, "")
                          .trim();
                        teleprompterCallbackRef.current?.(clean);
                        toast.success("Script applied to teleprompter");
                      }}
                    >
                      <FileText className="w-3 h-3" /> Use in Teleprompter
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      navigator.clipboard.writeText(msg.content);
                      toast.success("Copied to clipboard");
                    }}
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </Button>
                  {presentationId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleSaveToNotes(msg.content)}
                    >
                      <StickyNote className="w-3 h-3" /> Save to Notes
                    </Button>
                  )}
                </div>

                {/* Contextual research card — collapsed on mobile so conversation isn't overshadowed */}
                {userMessages.length >= 2 && (
                  <details className="rounded-lg border border-border/60 bg-secondary/40 overflow-hidden group">
                    <summary className="flex items-center gap-2 p-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                      <Search className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-xs font-semibold text-foreground flex-1">Research this further</span>
                      <span className="text-[10px] text-muted-foreground group-open:hidden">Tap to expand</span>
                    </summary>
                    <div className="px-3 pb-3 space-y-2">
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Your Arc conversation will be right here when you return. Paste your findings back to turn them into slides.
                      </p>
                      <DeepDiveButtons topic={synthesizedPrompt || msg.content.slice(0, 500)} compact />
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}

      {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
        <div className="flex justify-start animate-fade-in">
          <div className="bg-secondary rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span className="text-xs text-muted-foreground">Arc is thinking…</span>
          </div>
        </div>
      )}
    </>
  );
}
