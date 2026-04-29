import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { FooterAuditLine } from "@/components/atlas/FooterAuditLine";
import { AtlasFrontDoor } from "@/components/atlas/AtlasFrontDoor";
import {
  relativeTime,
  type ChatMessage,
  type Project,
  type Recommendation,
  type Session as AtlasSession,
  type WorkspaceNode,
} from "@/lib/atlas";
import { toast } from "sonner";

type IndexSearch = {
  sessionId?: string;
  initialMessage?: string;
};

export const Route = createFileRoute("/")({
  component: WorkspacePage,
  validateSearch: (search: Record<string, unknown>): IndexSearch => ({
    sessionId: typeof search.sessionId === "string" ? search.sessionId : undefined,
    initialMessage:
      typeof search.initialMessage === "string" ? search.initialMessage : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Atlas — Workspace" },
      {
        name: "description",
        content: "Atlas Workspace — chat, workspace, and preview surfaces.",
      },
    ],
  }),
});

const VIBE_CARDS = [
  { title: "Start a new project", body: "I want to start something new." },
  { title: "Audit an existing build", body: "Help me audit my current project." },
  { title: "Describe your vision", body: "I have an idea I want to talk through." },
  { title: "Upload something to analyze", body: "I have a file or screenshot to share." },
];

function WorkspacePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { sessionId, initialMessage } = Route.useSearch();

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [session, setSession] = useState<AtlasSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nodes, setNodes] = useState<WorkspaceNode[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [auditWarning, setAuditWarning] = useState(false);
  const [mobileTab, setMobileTab] = useState<"chat" | "workspace" | "preview">("chat");
  const [expandedRec, setExpandedRec] = useState<string | null>(null);
  const initialSentRef = useRef<string | null>(null);

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  // Load projects
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("*")
        .order("created_at");
      const list = (data ?? []) as Project[];
      setProjects(list);
      if (list[0] && !activeProjectId) setActiveProjectId(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Reset session state when sessionId param clears (back to front door)
  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      setMessages([]);
    }
  }, [sessionId]);

  // Load the selected session by id
  useEffect(() => {
    if (!user || !sessionId) return;
    (async () => {
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      if (data) {
        const s = data as AtlasSession;
        setSession(s);
        setActiveProjectId(s.project_id);
      }
    })();
  }, [user, sessionId]);

  // Load messages, nodes, recs for the session/project
  const refresh = async () => {
    if (!session || !activeProjectId) return;
    const [m, n, r] = await Promise.all([
      supabase
        .from("chat_messages")
        .select("*")
        .eq("session_id", session.id)
        .order("created_at"),
      supabase
        .from("workspace_nodes")
        .select("*")
        .eq("project_id", activeProjectId)
        .neq("status", "archived")
        .order("updated_at", { ascending: false }),
      supabase
        .from("recommendations")
        .select("*")
        .eq("project_id", activeProjectId)
        .order("created_at", { ascending: false }),
    ]);
    if (m.data) setMessages(m.data as ChatMessage[]);
    if (n.data) setNodes(n.data as unknown as WorkspaceNode[]);
    if (r.data) setRecs(r.data as Recommendation[]);
  };
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  // Auto-send the initial message coming from the front door, exactly once
  useEffect(() => {
    if (!session || !initialMessage) return;
    if (initialSentRef.current === session.id) return;
    initialSentRef.current = session.id;
    send(initialMessage);
    // Clear the search param so refreshes don't resend
    navigate({ to: "/", search: { sessionId: session.id }, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, initialMessage]);

  const pendingRecs = useMemo(
    () => recs.filter((r) => r.status === "pending"),
    [recs],
  );

  const send = async (text: string) => {
    if (!text.trim() || !session || !activeProjectId || sending) return;
    setSending(true);
    setAuditWarning(false);
    setInput("");
    // Optimistic user message
    const optimistic: ChatMessage = {
      id: crypto.randomUUID(),
      session_id: session.id,
      user_id: user!.id,
      role: "user",
      content: text,
      intent_type: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const { data, error } = await supabase.functions.invoke("atlas-chat", {
        body: {
          sessionId: session.id,
          projectId: activeProjectId,
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Atlas failed to respond";
      toast.error(msg);
      setAuditWarning(true);
    } finally {
      setSending(false);
    }
  };

  const updateRec = async (id: string, status: Recommendation["status"]) => {
    const rec = recs.find((r) => r.id === id);
    if (!rec) return;
    const { error } = await supabase
      .from("recommendations")
      .update({ status })
      .eq("id", id);
    if (error) return toast.error(error.message);

    if (status === "accepted" && user) {
      // Log to Architectural Ledger
      await supabase.from("ledger_entries").insert({
        user_id: user.id,
        project_id: rec.project_id,
        title: rec.content,
        description: `Accepted recommendation. ${rec.definition ?? ""}`.trim(),
        status: "Active",
      });
      toast.success("Accepted — logged to ledger");
    } else if (status === "parked") {
      toast.success("Parked");
    } else {
      toast.success("Dismissed");
    }
    setRecs((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="font-mono text-xs text-muted-foreground">loading…</span>
      </div>
    );
  }

  // Front door: shown when no active session is selected
  if (!sessionId) {
    return <AtlasFrontDoor />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <FooterAuditLine state={auditWarning ? "warning" : "healthy"} />

      {/* Top bar */}
      <header className="border-b border-border shrink-0">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-semibold tracking-tight text-sm">Atlas</span>
            <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--ember)]">
              Workspace
            </span>
            {projects.length > 0 && (
              <select
                value={activeProjectId ?? ""}
                onChange={(e) => setActiveProjectId(e.target.value)}
                className="bg-background border border-border rounded-sm px-2 py-1 text-xs text-foreground focus:outline-none focus:border-[color:var(--ember)] max-w-[180px] truncate"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/ledger"
              className="text-[10px] uppercase tracking-[0.15em] font-mono text-muted-foreground hover:text-foreground"
            >
              Ledger
            </Link>
            <button
              onClick={signOut}
              className="text-[11px] font-mono text-muted-foreground hover:text-foreground"
            >
              sign out
            </button>
          </div>
        </div>
      </header>

      {/* Mobile tabs */}
      <div className="md:hidden border-b border-border flex shrink-0">
        {(["chat", "workspace", "preview"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setMobileTab(t)}
            className={`flex-1 py-2.5 text-[10px] font-mono uppercase tracking-[0.15em] ${
              mobileTab === t
                ? "text-[color:var(--ember)] border-b-2 border-[color:var(--ember)]"
                : "text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Three-panel layout */}
      <main className="flex-1 flex overflow-hidden">
        {/* Chat (30%) */}
        <section
          className={`${
            mobileTab === "chat" ? "flex" : "hidden"
          } md:flex md:w-[30%] flex-col border-r border-border min-w-0`}
        >
          <ChatPanel
            messages={messages}
            sending={sending}
            input={input}
            setInput={setInput}
            onSend={send}
            onVibeCard={(body) => send(body)}
          />
        </section>

        {/* Workspace (40%) */}
        <section
          className={`${
            mobileTab === "workspace" ? "flex" : "hidden"
          } md:flex md:w-[40%] flex-col border-r border-border bg-[color:var(--surface)]/30 min-w-0`}
        >
          <WorkspacePanel nodes={nodes} />
        </section>

        {/* Preview (30%) */}
        <section
          className={`${
            mobileTab === "preview" ? "flex" : "hidden"
          } md:flex md:w-[30%] flex-col min-w-0`}
        >
          <PreviewPanel
            recs={pendingRecs}
            expanded={expandedRec}
            setExpanded={setExpandedRec}
            onAction={updateRec}
          />
        </section>
      </main>

      <style>{`
        .atlas-input {
          width: 100%;
          background: var(--background);
          color: var(--foreground);
          border: 1px solid var(--border);
          border-radius: 3px;
          padding: 9px 11px;
          font-size: 13px;
          outline: none;
          transition: border-color 120ms;
        }
        .atlas-input:focus { border-color: var(--ember); }
        .atlas-input::placeholder { color: var(--muted-text); }
      `}</style>
    </div>
  );
}

/* -------- Chat Panel -------- */
function ChatPanel({
  messages,
  sending,
  input,
  setInput,
  onSend,
  onVibeCard,
}: {
  messages: ChatMessage[];
  sending: boolean;
  input: string;
  setInput: (v: string) => void;
  onSend: (text: string) => void;
  onVibeCard: (body: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, sending]);

  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          Chat
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/60">
          {messages.length} msg
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <AntiFreezeGateway onVibeCard={onVibeCard} />
        ) : (
          messages.map((m) => (
            <div key={m.id} className="space-y-1">
              <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground/60">
                {m.role === "user" ? "you" : "atlas"} · {relativeTime(m.created_at)}
              </div>
              <div
                className={`text-[13px] leading-relaxed whitespace-pre-wrap ${
                  m.role === "assistant"
                    ? "text-foreground"
                    : "text-foreground/80"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="font-mono text-[10px] text-[color:var(--phosphor)] uppercase tracking-[0.15em]">
            atlas thinking…
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <DropZone
          onText={(t) => setInput(input ? input + "\n" + t : t)}
          onSend={onSend}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend(input);
              }
            }}
            placeholder="Tell Atlas what you're building…"
            rows={2}
            className="atlas-input resize-none font-sans"
          />
        </DropZone>
        <div className="flex items-center justify-between mt-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground/50">
            ↵ send · ⇧↵ newline · drop file
          </span>
          <button
            onClick={() => onSend(input)}
            disabled={sending || !input.trim()}
            className="px-3 py-1 text-[10px] font-medium uppercase tracking-[0.1em] bg-[color:var(--ember)] text-[color:var(--background)] rounded-sm hover:brightness-110 disabled:opacity-40 transition-all"
          >
            Send
          </button>
        </div>
      </div>
    </>
  );
}

function AntiFreezeGateway({ onVibeCard }: { onVibeCard: (body: string) => void }) {
  return (
    <div className="space-y-4 pt-4">
      <div className="space-y-1.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--ember)]">
          Atlas is ready
        </div>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Pick a starting point, or just tell me what you're building.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {VIBE_CARDS.map((c) => (
          <button
            key={c.title}
            onClick={() => onVibeCard(c.body)}
            className="text-left px-3 py-2.5 border border-border rounded-sm bg-[color:var(--surface)]/50 hover:border-[color:var(--phosphor)] hover:bg-[color:var(--surface)] transition-colors"
          >
            <div className="text-[12px] font-medium">{c.title}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
              {c.body}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DropZone({
  children,
  onText,
}: {
  children: React.ReactNode;
  onText: (t: string) => void;
  onSend: (t: string) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setHover(false);
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (file.type.startsWith("text/") || file.name.endsWith(".md")) {
          const text = await file.text();
          onText(`[${file.name}]\n${text.slice(0, 4000)}`);
        } else {
          onText(`[attached: ${file.name} · ${(file.size / 1024).toFixed(1)}kb]`);
        }
      }}
      className={`relative ${hover ? "ring-1 ring-[color:var(--phosphor)] rounded-sm" : ""}`}
    >
      {children}
      {hover && (
        <div className="absolute inset-0 bg-[color:var(--phosphor)]/10 flex items-center justify-center pointer-events-none rounded-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--phosphor)]">
            drop to attach
          </span>
        </div>
      )}
    </div>
  );
}

/* -------- Workspace Panel -------- */
function WorkspacePanel({ nodes }: { nodes: WorkspaceNode[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          Workspace
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/60">
          {nodes.length} nodes
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {nodes.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[13px] text-muted-foreground">
              Nothing here yet.
            </p>
            <p className="text-[11px] text-muted-foreground/70 font-mono mt-2">
              Start a conversation and Atlas will build here.
            </p>
          </div>
        ) : (
          nodes.map((n) => (
            <NodeCard
              key={n.id}
              node={n}
              expanded={open === n.id}
              onToggle={() => setOpen(open === n.id ? null : n.id)}
            />
          ))
        )}
      </div>
    </>
  );
}

function NodeCard({
  node,
  expanded,
  onToggle,
}: {
  node: WorkspaceNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  const accent = (() => {
    switch (node.type) {
      case "file":
        return { color: "var(--ember)", border: "border-[color:var(--ember)]/30" };
      case "component":
        return {
          color: "var(--phosphor)",
          border: "border-[color:var(--phosphor)]/30",
        };
      case "draft":
        return { color: "var(--muted-text)", border: "border-dashed border-border" };
      case "output":
        return { color: "var(--foreground)", border: "border-border" };
      default:
        return { color: "var(--muted-text)", border: "border-border" };
    }
  })();

  const body =
    typeof node.content === "object" && node.content !== null
      ? ((node.content as { body?: string }).body ?? JSON.stringify(node.content, null, 2))
      : String(node.content ?? "");

  return (
    <div
      className={`bg-[color:var(--surface)] rounded-sm border ${accent.border} cursor-pointer transition-all`}
      onClick={onToggle}
    >
      <div className="px-3 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="font-mono text-[9px] uppercase tracking-[0.15em]"
              style={{ color: accent.color }}
            >
              {node.type}
            </span>
            <span className="font-mono text-[9px] text-muted-foreground/60">
              v{node.version}
            </span>
          </div>
          <div
            className={`text-[13px] mt-0.5 truncate ${
              node.type === "file" ? "font-mono" : ""
            }`}
          >
            {node.title}
          </div>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground/60 shrink-0">
          {relativeTime(node.updated_at)}
        </span>
      </div>
      {expanded && body && (
        <div className="px-3 pb-3 pt-1 border-t border-border/50">
          <pre className="text-[12px] text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">
            {body}
          </pre>
        </div>
      )}
    </div>
  );
}

/* -------- Preview Panel -------- */
function PreviewPanel({
  recs,
  expanded,
  setExpanded,
  onAction,
}: {
  recs: Recommendation[];
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  onAction: (id: string, status: Recommendation["status"]) => void;
}) {
  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          Preview · Recommendations
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/60">
          {recs.length} pending
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {recs.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[13px] text-muted-foreground">No pending recommendations.</p>
            <p className="text-[11px] text-muted-foreground/70 font-mono mt-2">
              Atlas will surface suggestions here as you build.
            </p>
          </div>
        ) : (
          recs.map((r) => {
            const isOpen = expanded === r.id;
            return (
              <div
                key={r.id}
                className="bg-[color:var(--surface)] border border-border rounded-sm"
              >
                <div
                  className="px-3 py-2.5 cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`font-mono text-[9px] uppercase tracking-[0.15em] ${
                        r.priority === "high"
                          ? "text-[color:var(--ember)]"
                          : "text-muted-foreground"
                      }`}
                    >
                      {r.priority}
                    </span>
                  </div>
                  <div className="text-[13px] leading-snug">{r.content}</div>
                </div>
                {isOpen && (
                  <div className="px-3 pb-3 border-t border-border/50 space-y-2 pt-2">
                    {r.definition && (
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground mb-0.5">
                          What
                        </div>
                        <div className="text-[12px] text-foreground/80">
                          {r.definition}
                        </div>
                      </div>
                    )}
                    {r.benefit && (
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground mb-0.5">
                          Why
                        </div>
                        <div className="text-[12px] text-foreground/80">
                          {r.benefit}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction(r.id, "accepted");
                        }}
                        className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] bg-[color:var(--ember)] text-[color:var(--background)] rounded-sm hover:brightness-110"
                      >
                        Accept
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction(r.id, "parked");
                        }}
                        className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] border border-border text-foreground hover:border-[color:var(--phosphor)] rounded-sm"
                      >
                        Park
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction(r.id, "dismissed");
                        }}
                        className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground rounded-sm"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
