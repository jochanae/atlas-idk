import { useRef, useState } from "react";
import { Send, Paperclip, X, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import ArcVoiceMode from "./ArcVoiceMode";
import type { ArcMode } from "./ArcProvider";

const MAX_ATTACHMENTS = 10;

const placeholders: Record<ArcMode, string> = {
  chat: "Tell me what you need...",
  guided: "Tell Arc about your presentation...",
  quick: "Describe the deck you need...",
  coaching: "Ask Arc for coaching...",
  rewrite: "Paste text to polish...",
  teleprompter: "Describe the script you need...",
};

interface ArcInputBarProps {
  mode: ArcMode;
  isLoading: boolean;
  onSend: (msg: string) => void;
}

export default function ArcInputBar({ mode, isLoading, onSend }: ArcInputBarProps) {
  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<Array<{ file: File; preview: string }>>([]);
  const [voiceMode, setVoiceMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if ((!input.trim() && attachedFiles.length === 0) || isLoading) return;
    const fileNames = attachedFiles.map(f => f.file.name);
    const msg = attachedFiles.length > 0
      ? `[${attachedFiles.length} file(s) attached: ${fileNames.join(", ")}]\n\n${input.trim() || "Help me with these files"}`
      : input.trim();
    onSend(msg);
    setInput("");
    attachedFiles.forEach(f => URL.revokeObjectURL(f.preview));
    setAttachedFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAttachments = files
      .filter(f => f.size <= 20 * 1024 * 1024)
      .slice(0, MAX_ATTACHMENTS - attachedFiles.length)
      .map(file => ({ file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : "" }));
    setAttachedFiles(prev => [...prev, ...newAttachments].slice(0, MAX_ATTACHMENTS));
    if (e.target) e.target.value = "";
  };

  const removeAttachment = (idx: number) => {
    setAttachedFiles(prev => {
      const removed = prev[idx];
      if (removed.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };

  return (
    <div className="border-t border-border bg-card/95 backdrop-blur-sm shrink-0 safe-area-bottom">
      {/* Voice mode */}
      {voiceMode && (
        <ArcVoiceMode />
      )}

      {/* Attachments */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2">
          {attachedFiles.map((af, idx) => (
            <div key={idx} className="flex items-center gap-1.5 bg-secondary rounded-lg px-2 py-1 text-xs">
              {af.preview ? (
                <img src={af.preview} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
              ) : null}
              <span className="truncate max-w-[80px] text-muted-foreground">{af.file.name}</span>
              <button onClick={() => removeAttachment(idx)} className="shrink-0">
                <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 p-3">
        <input ref={fileInputRef} type="file" accept="image/*,.pdf,.pptx,.docx,.doc,.txt,.md,.csv" className="hidden" onChange={handleFileAttach} multiple />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || attachedFiles.length >= MAX_ATTACHMENTS}
          title={`Attach files (${attachedFiles.length}/${MAX_ATTACHMENTS})`}
        >
          <Paperclip className="w-4 h-4 text-muted-foreground" />
        </Button>

        <div className="flex-1 flex items-end bg-secondary rounded-2xl px-4 py-2.5 border border-border focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all min-h-[40px] gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholders[mode]}
            rows={1}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none leading-snug max-h-[120px]"
            disabled={isLoading}
          />

          {/* Voice mode toggle — inside the input pill */}
          <button
            type="button"
            className={`shrink-0 p-1 rounded-full transition-colors ${voiceMode ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setVoiceMode(!voiceMode)}
            title="Voice mode"
          >
            <Mic className="w-4 h-4" />
          </button>

          {/* Send button — always visible inside the input pill */}
          <button
            type="button"
            className="shrink-0 w-8 h-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-md flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none transition-opacity"
            onClick={handleSend}
            disabled={(!input.trim() && attachedFiles.length === 0) || isLoading}
            title="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
