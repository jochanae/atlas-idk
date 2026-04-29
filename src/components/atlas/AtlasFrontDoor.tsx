import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDistanceToNow } from "date-fns";

const MODES = [
  { id: "think", label: "Think", color: "ember" },
  { id: "build", label: "Build", color: "ember" },
  { id: "explore", label: "Explore", color: "phosphor" },
  { id: "decide", label: "Decide", color: "ember" },
  { id: "audit", label: "Audit", color: "ember" },
] as const;

type ModeId = typeof MODES[number]["id"];

interface RecentSession {
  id: string;
  title: string;
  mode: string | null;
  updated_at: string;
}

export function AtlasFrontDoor() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeMode, setActiveMode] = useState<ModeId>("think");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [recents, setRecents] = useState<RecentSession[]>([]);
  const [showAllRecents, setShowAllRecents] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("sessions")
      .select("id, title, mode, updated_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(4)
      .then(({ data }) => {
        if (data) setRecents(data as RecentSession[]);
      });
  }, [user]);

  const handleSend = async () => {
    if (!input.trim() || !user || sending) return;
    setSending(true);
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at")
      .limit(1)
      .single();
    if (!project) { setSending(false); return; }
    const { data: session } = await supabase
      .from("sessions")
      .insert({ project_id: project.id, user_id: user.id, title: input.slice(0, 60), mode: activeMode, status: "active" })
      .select("id")
      .single();
    if (session) {
      navigate({ to: "/", search: { sessionId: session.id, initialMessage: input } });
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const visibleRecents = showAllRecents ? recents : recents.slice(0, 1);
  const hiddenCount = recents.length - 1;

  return (
    <div style={{ background: "#0C0A09", minHeight: "100dvh", display: "flex", flexDirection: "column" }}>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px 8px" }}>
        <span style={{ fontSize: 18, fontWeight: 500, color: "#E7E5E4", letterSpacing: "0.08em" }}>Atlas</span>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            <svg key="s" viewBox="0 0 16 16" width={14} height={14} stroke="#78716C" fill="none" strokeWidth={1.5}><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2"/></svg>,
            <svg key="m" viewBox="0 0 16 16" width={14} height={14} stroke="#78716C" fill="none" strokeWidth={1.5}><path d="M2 4h12M2 8h8M2 12h10"/></svg>
          ].map((icon, i) => (
            <button key={i} style={{ width: 28, height: 28, borderRadius: 6, border: "0.5px solid #2C2926", background: "#1C1917", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Presence zone */}
      <div style={{ textAlign: "center", padding: "36px 24px 24px" }}>
        <div style={{ fontSize: 24, fontWeight: 400, color: "#E7E5E4", lineHeight: 1.3, letterSpacing: "-0.01em", marginBottom: 8 }}>
          What's on your mind?
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 12, color: "#57524E", letterSpacing: "0.06em" }}>
          atlas is ready
        </div>
      </div>

      {/* Mode pills */}
      <div style={{ display: "flex", gap: 6, padding: "0 20px 20px", overflowX: "auto", scrollbarWidth: "none" }}>
        {MODES.map((m) => {
          const isActive = activeMode === m.id;
          const isPhosphor = m.color === "phosphor";
          const activeColor = isPhosphor ? "#06B6D4" : "#EA580C";
          return (
            <button
              key={m.id}
              onClick={() => setActiveMode(m.id)}
              style={{
                flexShrink: 0,
                padding: "5px 14px",
                borderRadius: 20,
                border: `0.5px solid ${isActive ? activeColor : "#2C2926"}`,
                background: isActive && isPhosphor ? "#080C10" : "#1C1917",
                fontFamily: "monospace",
                fontSize: 11,
                color: isActive ? activeColor : "#78716C",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Input zone */}
      <div style={{ margin: "0 16px", background: "#1C1917", borderRadius: 14, border: "0.5px solid #2C2926", padding: "14px 16px" }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="anything on your mind, a build, an idea, a decision…"
          rows={2}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#E7E5E4",
            fontSize: 15,
            lineHeight: 1.5,
            resize: "none",
            fontFamily: "inherit",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              <svg key="u" viewBox="0 0 16 16" width={13} height={13} stroke="#4A4540" fill="none" strokeWidth={1.5}><path d="M8 1v10M4 7l4 4 4-4"/><path d="M2 14h12"/></svg>,
              <svg key="a" viewBox="0 0 16 16" width={13} height={13} stroke="#4A4540" fill="none" strokeWidth={1.5}><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 8h6M8 5v6"/></svg>,
              <svg key="p" viewBox="0 0 16 16" width={13} height={13} stroke="#4A4540" fill="none" strokeWidth={1.5}><circle cx="8" cy="6" r="2"/><path d="M4 14c0-2.2 1.8-4 4-4s4 1.8 4 4"/></svg>
            ].map((icon, i) => (
              <button key={i} style={{ width: 28, height: 28, borderRadius: 6, border: "0.5px solid #2C2926", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                {icon}
              </button>
            ))}
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: "#EA580C",
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: input.trim() ? 1 : 0.3,
              cursor: input.trim() ? "pointer" : "default",
            }}
          >
            <svg viewBox="0 0 16 16" width={14} height={14} stroke="#0C0A09" fill="none" strokeWidth={2}>
              <path d="M2 8h12M8 2l6 6-6 6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Recent sessions */}
      {recents.length > 0 && (
        <div style={{ marginTop: 20, flex: 1 }}>
          <div style={{ padding: "0 20px 10px", fontFamily: "monospace", fontSize: 10, color: "#3C3530", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Continue where you left off
          </div>
          {visibleRecents.map((s) => {
            const isPhosphor = s.mode === "explore";
            const dotColor = isPhosphor ? "#06B6D4" : s.mode ? "#EA580C" : "#2C2926";
            return (
              <div
                key={s.id}
                onClick={() => navigate({ to: "/", search: { sessionId: s.id } })}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderTop: "0.5px solid #1C1917", cursor: "pointer" }}
              >
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#78716C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 2 }}>
                    {s.title || "Untitled session"}
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 10, color: "#3C3530", letterSpacing: "0.04em" }}>
                    {s.mode || "think"} · {formatDistanceToNow(new Date(s.updated_at), { addSuffix: true })}
                  </div>
                </div>
                <span style={{ fontSize: 14, color: "#2C2926" }}>›</span>
              </div>
            );
          })}
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowAllRecents(!showAllRecents)}
              style={{ width: "100%", padding: "10px 20px", background: "transparent", border: "none", fontFamily: "monospace", fontSize: 10, color: "#2C2926", letterSpacing: "0.08em", cursor: "pointer", textAlign: "left" }}
            >
              {showAllRecents ? "show less" : `${hiddenCount} more`}
            </button>
          )}
        </div>
      )}

      {/* Footer audit line */}
      <div style={{ height: 2, background: "#06B6D4", opacity: 0.7, marginTop: "auto" }} />
    </div>
  );
}
