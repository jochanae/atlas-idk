import { useState } from "react";
import { RunProvider, useRun } from "@/context/RunProvider";
import { ChatSurface } from "@/surfaces/ChatSurface";
import { TimelineSurface, ChangesSurface, TerminalSurface, OutputsSurface } from "@/surfaces/OperationalSurfaces";

type Tab = "chat" | "timeline" | "changes" | "terminal" | "outputs";

export function App() {
  return (
    <RunProvider conversationId="mock-conversation-1">
      <Shell />
    </RunProvider>
  );
}

function Shell() {
  const [tab, setTab] = useState<Tab>("chat");
  const { connectionStatus } = useRun();

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100%" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--panel)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <strong>Atlas · Next</strong>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>Run Contract v1.2 · mocked</span>
        </div>
        <ConnectionDot status={connectionStatus} />
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", minHeight: 0 }}>
        <main style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <TabBar current={tab} onChange={setTab} />
          <section style={{ padding: 20, overflow: "auto", flex: 1 }}>
            {tab === "chat" && <ChatSurface />}
            {tab === "timeline" && <TimelineSurface />}
            {tab === "changes" && <ChangesSurface />}
            {tab === "terminal" && <TerminalSurface />}
            {tab === "outputs" && <OutputsSurface />}
          </section>
        </main>

        <aside
          style={{
            borderLeft: "1px solid var(--border)",
            padding: 20,
            background: "var(--panel)",
            overflow: "auto",
          }}
        >
          <StoryPanel />
        </aside>
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
            padding: "6px 12px",
            borderRadius: 6,
            border: "none",
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

function StoryPanel() {
  const { __startMockRun, activeBuildRun, activeTurn } = useRun();
  const buildBlocked = !!activeBuildRun;
  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 14 }}>Lifecycle stories</h3>
      <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 0 }}>
        Trigger scripted runs. All events go through <code>RunProvider</code>.
      </p>

      <StoryGroup title="BUILD">
        <StoryButton disabled={buildBlocked} onClick={() => __startMockRun("BUILD", "build_success")}>
          Full success path
        </StoryButton>
        <StoryButton disabled={buildBlocked} onClick={() => __startMockRun("BUILD", "build_awaiting")}>
          Stop at confirmation (Gate 1)
        </StoryButton>
        <StoryButton disabled={buildBlocked} onClick={() => __startMockRun("BUILD", "build_failure")}>
          Fail mid-execution (partial writes)
        </StoryButton>
      </StoryGroup>

      <StoryGroup title="CHAT">
        <StoryButton disabled={!!activeTurn} onClick={() => __startMockRun("CHAT")}>
          Send chat turn
        </StoryButton>
      </StoryGroup>

      <StoryGroup title="DECIDE">
        <StoryButton disabled={!!activeTurn} onClick={() => __startMockRun("DECIDE")}>
          Send decide turn
        </StoryButton>
      </StoryGroup>

      {buildBlocked && (
        <p style={{ color: "var(--warn)", fontSize: 12, marginTop: 16 }}>
          One BUILD is active. Cancel it or wait — per §9 concurrent-run policy.
        </p>
      )}
    </div>
  );
}

function StoryGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, color: "var(--muted)", marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

function StoryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        textAlign: "left",
        padding: "8px 10px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: disabled ? "transparent" : "var(--panel-2)",
        color: disabled ? "var(--muted)" : "var(--text)",
        fontSize: 13,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}
