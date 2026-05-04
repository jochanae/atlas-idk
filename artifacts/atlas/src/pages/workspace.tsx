import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "wouter";
import {
  useGetProject,
  useListSessions,
  useListEntries,
  useCreateSession,
  useSendMessage,
  useCreateEntry,
  getListEntriesQueryKey,
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import type { Message, Entry } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const MODES = ["Think", "Plan", "Build", "Explore", "Decide", "Audit"] as const;
type Mode = (typeof MODES)[number];

interface ChatMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
  intentType?: string | null;
  catchPayload?: CatchPayload | null;
}

interface CatchPayload {
  v: number;
  against: { id: string; title: string };
  leadSentence: string;
}

function DecisionCatchCard({
  payload,
  projectId,
  sessionId,
  mode,
  onProceed,
  onAdjust,
}: {
  payload: CatchPayload;
  projectId: number;
  sessionId: number;
  mode: string;
  onProceed: () => void;
  onAdjust: () => void;
}) {
  const createEntry = useCreateEntry();
  const queryClient = useQueryClient();

  const handleProceed = () => {
    createEntry.mutate(
      {
        projectId,
        data: {
          title: payload.against.title,
          summary: payload.leadSentence,
          status: "committed",
          severity: "committed",
          mode,
          sessionId,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEntriesQueryKey(projectId, {}) });
          onProceed();
        },
      }
    );
  };

  return (
    <div className="mx-auto max-w-xl my-4">
      <div className="border border-primary/40 bg-primary/5 rounded-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-widest text-primary">
            Decision Catch
          </span>
        </div>
        <div>
          <p className="text-sm font-bold text-foreground mb-1">{payload.against.title}</p>
          <p className="text-sm text-muted-foreground">{payload.leadSentence}</p>
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="border-primary/30 text-primary hover:bg-primary/10 rounded-sm text-xs"
            onClick={handleProceed}
            disabled={createEntry.isPending}
          >
            Commit anyway — log it
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground rounded-sm text-xs"
            onClick={onAdjust}
          >
            Adjust the approach
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  projectId,
  sessionId,
  mode,
  onCatchProceed,
  onCatchAdjust,
}: {
  message: ChatMessage;
  projectId: number;
  sessionId: number;
  mode: string;
  onCatchProceed: (msg: ChatMessage) => void;
  onCatchAdjust: (msg: ChatMessage) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] bg-primary/10 border border-primary/20 rounded-sm p-3">
          <div className="text-xs text-primary/60 mb-1 uppercase tracking-wider">You</div>
          <div className="text-sm whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <div className="flex justify-start">
        <div className="max-w-[85%] bg-card border border-border rounded-sm p-3">
          <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Atlas</div>
          <div className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</div>
        </div>
      </div>
      {message.catchPayload && (
        <DecisionCatchCard
          payload={message.catchPayload as CatchPayload}
          projectId={projectId}
          sessionId={sessionId}
          mode={mode}
          onProceed={() => onCatchProceed(message)}
          onAdjust={() => onCatchAdjust(message)}
        />
      )}
    </div>
  );
}

export default function Workspace() {
  const { projectId } = useParams();
  const id = Number(projectId);
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("Think");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [clearedCatches, setClearedCatches] = useState<Set<number>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: project } = useGetProject(id, { query: { enabled: !!id } });
  const { data: sessions, isLoading: sessionsLoading } = useListSessions(id, {
    query: { enabled: !!id, queryKey: getListSessionsQueryKey(id) },
  });
  const { data: entries } = useListEntries(id, {}, { query: { enabled: !!id } });
  const createSession = useCreateSession();
  const sendMessage = useSendMessage();

  // Resolve the active session — create one if none exist
  const [sessionId, setSessionId] = useState<number | null>(null);

  useEffect(() => {
    if (sessionsLoading) return;
    if (sessions && sessions.length > 0) {
      setSessionId(sessions[0].id);
    } else if (!createSession.isPending && !sessionId) {
      createSession.mutate(
        { projectId: id, data: { title: "New session", mode: mode.toLowerCase() } },
        {
          onSuccess: (s) => {
            setSessionId(s.id);
            queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey(id) });
          },
        }
      );
    }
  }, [sessions, sessionsLoading, id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !sessionId || sendMessage.isPending) return;

    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const ledgerEntries = (entries || []).map((e: Entry) => ({
      id: e.id,
      title: e.title,
      status: e.status,
    }));

    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    sendMessage.mutate(
      {
        data: {
          sessionId,
          projectId: id,
          message: input.trim(),
          mode: mode.toLowerCase(),
          history,
          entries: ledgerEntries,
        },
      },
      {
        onSuccess: (res) => {
          const assistantMsg: ChatMessage = {
            id: res.messageId,
            role: "assistant",
            content: res.content,
            intentType: res.intentType,
            catchPayload: res.catchPayload as CatchPayload | null,
          };
          setMessages((prev) => [...prev, assistantMsg]);
        },
        onError: () => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "Something went wrong reaching the backend. Try again.",
            },
          ]);
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCatchProceed = (msg: ChatMessage) => {
    if (msg.id !== undefined) {
      setClearedCatches((prev) => new Set([...prev, msg.id!]));
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id ? { ...m, catchPayload: null } : m
      )
    );
  };

  const handleCatchAdjust = (msg: ChatMessage) => {
    if (msg.id !== undefined) {
      setClearedCatches((prev) => new Set([...prev, msg.id!]));
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id ? { ...m, catchPayload: null } : m
      )
    );
    textareaRef.current?.focus();
  };

  const committedEntries = (entries || []).filter((e: Entry) => e.status === "committed");
  const parkedEntries = (entries || []).filter((e: Entry) => e.status === "parked");

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-12 border-b border-border flex items-center px-4 justify-between bg-card shrink-0">
        <div className="flex items-center space-x-2 text-sm">
          <Link href="/" className="font-bold text-primary">
            ATLAS
          </Link>
          <span className="text-border">/</span>
          <Link href="/projects" className="text-muted-foreground hover:text-foreground transition-colors">
            Projects
          </Link>
          <span className="text-border">/</span>
          <span className="text-foreground font-medium">{project?.name || "…"}</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href={`/ledger/${id}`}
            className="text-xs uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors"
          >
            View Ledger
          </Link>
        </div>
      </header>

      {/* Mode bar */}
      <div className="flex items-center border-b border-border bg-card px-4 shrink-0">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "px-4 py-2 text-xs font-medium uppercase tracking-widest transition-colors border-b-2",
              mode === m
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 px-4 py-6">
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-24 text-muted-foreground">
                  <p className="text-sm italic">Session initialized. What is the objective?</p>
                  <p className="text-xs mt-2 text-muted-foreground/50">Mode: {mode}</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  message={msg}
                  projectId={id}
                  sessionId={sessionId || 0}
                  mode={mode.toLowerCase()}
                  onCatchProceed={handleCatchProceed}
                  onCatchAdjust={handleCatchAdjust}
                />
              ))}
              {sendMessage.isPending && (
                <div className="flex justify-start">
                  <div className="bg-card border border-border rounded-sm px-4 py-3">
                    <div className="flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t border-border bg-card shrink-0">
            <div className="max-w-3xl mx-auto">
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`[${mode}] Log a thought, surface a constraint, or make a call...`}
                  className="min-h-[60px] max-h-40 resize-none bg-background border-border rounded-sm pr-20 text-sm"
                  rows={2}
                />
                <Button
                  onClick={handleSend}
                  size="sm"
                  disabled={!input.trim() || sendMessage.isPending || !sessionId}
                  className="absolute right-2 bottom-2 h-8 rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
                >
                  Send
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/40 mt-1.5">
                Enter to send · Shift+Enter for newline
              </p>
            </div>
          </div>
        </div>

        {/* Decision Ledger sidebar */}
        <div className="w-72 bg-card border-l border-border flex flex-col shrink-0">
          <div className="p-3 border-b border-border shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-accent flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                Decision Ledger
              </h2>
              <Link
                href={`/ledger/${id}`}
                className="text-xs text-muted-foreground hover:text-accent transition-colors"
              >
                Full view →
              </Link>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-4">
              {committedEntries.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground/60 mb-2">
                    Committed
                  </div>
                  <div className="space-y-2">
                    {committedEntries.map((e: Entry) => (
                      <div key={e.id} className="p-2.5 border border-accent/15 bg-accent/5 rounded-sm">
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <span className="text-xs font-medium text-foreground leading-tight line-clamp-2">
                            {e.title}
                          </span>
                          <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-0.5" />
                        </div>
                        {e.summary && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{e.summary}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {parkedEntries.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground/60 mb-2">
                    Parked
                  </div>
                  <div className="space-y-2">
                    {parkedEntries.map((e: Entry) => (
                      <div key={e.id} className="p-2.5 border border-border rounded-sm opacity-70">
                        <span className="text-xs text-foreground leading-tight line-clamp-2">
                          {e.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(!entries || entries.length === 0) && (
                <p className="text-xs text-muted-foreground/50 italic py-2">
                  No decisions committed yet.
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
