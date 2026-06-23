import { useState, useRef, useEffect, useMemo } from "react";
import { Brain, X, Send, Loader2, Sparkles, Play, Trash2, ArrowUpDown, Pencil, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { parseArcActions, stripArcActionsBlock, getActionLabel, useApplyArcActions, type ArcAction } from "@/hooks/useArcActions";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface EditorArcSidebarProps {
  open: boolean;
  onClose: () => void;
  currentSlide?: { block_type: string; content: Json; notes: string | null } | null;
  slideIndex: number;
  totalSlides: number;
  deckTitle: string;
  allSlides: { id: string; block_type: string; content: Json; sort_order: number; presentation_id: string }[];
}

function ArcActionsCard({ actions, slides, presentationId, onApplied }: {
  actions: ArcAction[];
  slides: { id: string; sort_order: number; content: Json; presentation_id: string }[];
  presentationId: string;
  onApplied: () => void;
}) {
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const applyActions = useApplyArcActions();

  const handleApply = async () => {
    setApplying(true);
    const result = await applyActions(actions, slides, presentationId);
    setApplying(false);
    if (result.success) {
      setApplied(true);
      toast.success(`Applied ${result.applied} change${result.applied > 1 ? "s" : ""} to your deck`);
      onApplied();
    } else {
      toast.error("Failed to apply changes");
    }
  };

  const actionIcon = (type: string) => {
    if (type === "delete") return <Trash2 className="w-3 h-3 text-destructive" />;
    if (type === "move") return <ArrowUpDown className="w-3 h-3 text-primary" />;
    return <Pencil className="w-3 h-3 text-primary" />;
  };

  return (
    <div className="my-2 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        {applied ? (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        ) : (
          <Play className="w-4 h-4 text-primary" />
        )}
        <span className="text-xs font-semibold text-foreground">
          {applied ? "Changes applied" : `${actions.length} suggested change${actions.length > 1 ? "s" : ""}`}
        </span>
      </div>
      <div className="space-y-1">
        {actions.map((action, i) => (
          <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
            {actionIcon(action.type)}
            <div>
              <span className="text-foreground">{getActionLabel(action)}</span>
              {action.reason && <span className="text-muted-foreground"> — {action.reason}</span>}
            </div>
          </div>
        ))}
      </div>
      {!applied && (
        <Button
          size="sm"
          className="w-full h-8 text-xs gap-1.5"
          onClick={handleApply}
          disabled={applying}
        >
          {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          Apply All Changes
        </Button>
      )}
    </div>
  );
}

export default function EditorArcSidebar({ open, onClose, currentSlide, slideIndex, totalSlides, deckTitle, allSlides }: EditorArcSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!open) return null;

  const presentationId = allSlides[0]?.presentation_id || "";

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/arc-chat`;
      const session = await supabase.auth.getSession();

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.data.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          mode: "coaching",
          slides_context: allSlides.map((s) => ({ block_type: s.block_type, content: s.content })),
          teaching_style: localStorage.getItem("presentq_teaching_style"),
        }),
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }

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
          } catch { /* partial */ }
        }
      }
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const contextLabel = currentSlide
    ? `Slide ${slideIndex + 1}/${totalSlides} • ${currentSlide.block_type}`
    : deckTitle;

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col shrink-0 h-full">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold">Arc Coach</p>
            <p className="text-[9px] text-muted-foreground">{contextLabel}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-3">
            <Sparkles className="w-8 h-8 text-primary/30 mx-auto" />
            <p className="text-xs text-muted-foreground">Ask Arc about this slide, your deck flow, or delivery tips.</p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {["How can I improve this slide?", "Is my deck flow logical?", "What should I say here?"].map((q) => (
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
              <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs ${
                msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"
              }`}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm prose-invert max-w-none [&>*]:text-xs [&>*]:my-1">
                    <ReactMarkdown>{displayContent || "…"}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
              {actions.length > 0 && !loading && (
                <div className="max-w-[90%] w-full">
                  <ArcActionsCard
                    actions={actions}
                    slides={allSlides}
                    presentationId={presentationId}
                    onApplied={() => {}}
                  />
                </div>
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
      <div className="p-3 border-t border-border shrink-0">
        <div className="flex gap-1.5">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Ask Arc…"
            className="min-h-[36px] max-h-[80px] text-xs resize-none"
            rows={1}
          />
          <Button size="icon" className="h-9 w-9 shrink-0" onClick={sendMessage} disabled={!input.trim() || loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
