import { useState } from "react";
import { RunProvider } from "@/context/RunProvider";
import { useRun } from "@/context/RunContext";
import { ChatSurface } from "@/surfaces/ChatSurface";
import { TimelineSurface, ChangesSurface, TerminalSurface, OutputsSurface } from "@/surfaces/OperationalSurfaces";
import { API_BASE } from "@/lib/api";

type Tab = "chat" | "timeline" | "changes" | "terminal" | "outputs";

export function App({ conversationId }: { conversationId: string }) {
  return (
    <RunProvider conversationId={conversationId}>
      <Shell conversationId={conversationId} />
    </RunProvider>
  );
}

function Shell({ conversationId }: { conversationId: string }) {
  const [tab, setTab] = useState<Tab>("chat");
  const { connectionStatus } = useRun();

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100%" }}>
      <header
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 20px", borderBottom: "1px solid var(--border)", background: "var(--panel)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <strong>Atlas · Next</strong>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>
            Run Contract v1.2 · live · conv {conversationId.slice(0, 8)}…
          </span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ color: "var(--muted)", fontSize: 11 }}>
            API: {API_BASE || "same-origin"}
          </span>
          <ConnectionDot status={connectionStatus} />
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", minHeight: 0 }}>
        <main style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <TabBar current={tab} onChange={setTab} />
          <section style={{ padding: 20, overflow: "auto", flex: 1 }}>
            {tab === "chat" && <ChatSurface conversationId={conversationId} />}
            {tab === "timeline" && <TimelineSurface />}
            {tab === "changes" && <ChangesSurface />}
            {tab === "terminal" && <TerminalSurface />}
            {tab === "outputs" && <OutputsSurface />}
          </section>
        </main>
      </div>
    </div>
  );
}

function ConnectionDot({ status }: { status: string }) {
  const color =
    status === "connected" ? "var(--ok)" :
    status === "reconnecting" || status === "connecting" ? "var(--warn)" :
    "var(--fail)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 12 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
      {status}
    </span>
  );
}

function TabBar({ current, onChange }: { current: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "chat", label: "Chat" },
    { id: "timeline", label: "Timeline" },
    { id: "changes", label: "Changes" },
    { id: "terminal", label: "Terminal" },
    { id: "outputs", label: "Outputs" },
  ];
  return (
    <nav style={{ display: "flex", gap: 4, padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--panel-2)" }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            padding: "6px 12px", borderRadius: 6, border: "none",
            background: current === t.id ? "var(--panel)" : "transparent",
            color: current === t.id ? "var(--text)" : "var(--muted)",
            fontSize: 13,
          }}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
