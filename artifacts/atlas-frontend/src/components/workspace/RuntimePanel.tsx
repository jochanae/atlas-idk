import { useState, useEffect, useRef, useCallback } from "react";

type RuntimeStatus = "idle" | "cloning" | "installing" | "starting" | "running" | "error";

interface RuntimeState {
  status: RuntimeStatus;
  port: number | null;
  logs: string[];
  errorMsg: string | null;
  hasScaffold: boolean;
  startedAt: string | null;
}

const STATUS_COLOR: Record<RuntimeStatus, string> = {
  idle: "var(--atlas-muted)",
  cloning: "#f59e0b",
  installing: "#f59e0b",
  starting: "#f59e0b",
  running: "#22c55e",
  error: "#ef4444",
};

const STATUS_LABEL: Record<RuntimeStatus, string> = {
  idle: "Idle",
  cloning: "Cloning…",
  installing: "Installing dependencies…",
  starting: "Starting dev server…",
  running: "Running",
  error: "Error",
};

function useUptime(startedAt: string | null, running: boolean) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running || !startedAt) { setSecs(0); return; }
    const base = new Date(startedAt).getTime();
    const tick = () => setSecs(Math.max(0, Math.floor((Date.now() - base) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, running]);
  if (!running || secs === 0) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function LogLine({ line }: { line: string }) {
  let color: string | undefined;
  if (line.startsWith("✓")) color = "#22c55e";
  else if (line.startsWith("✗") || /^(error|Error)/.test(line)) color = "#ef4444";
  else if (line.startsWith("⚠") || line.startsWith("warn")) color = "#f59e0b";
  else if (line.startsWith("[re-adopted]")) color = "#a78bfa";
  return (
    <div style={{ color, lineHeight: "1.65" }}>
      {line}
    </div>
  );
}

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 11,
  padding: "4px 11px",
  borderRadius: 5,
  border: "1px solid var(--atlas-border)",
  background: "var(--atlas-surface)",
  color: "var(--atlas-text)",
  cursor: "pointer",
  fontFamily: "var(--app-font-mono)",
  letterSpacing: "0.02em",
  whiteSpace: "nowrap",
  userSelect: "none",
};

const btnGreen: React.CSSProperties = {
  ...btn,
  background: "rgba(34,197,94,0.12)",
  color: "#22c55e",
  border: "1px solid rgba(34,197,94,0.3)",
};

const btnRed: React.CSSProperties = {
  ...btn,
  background: "rgba(239,68,68,0.10)",
  color: "#ef4444",
  border: "1px solid rgba(239,68,68,0.25)",
};

export function RuntimePanel({
  projectId,
  onOpenPreview,
}: {
  projectId: number;
  onOpenPreview?: () => void;
}) {
  const [state, setState] = useState<RuntimeState>({
    status: "idle",
    port: null,
    logs: [],
    errorMsg: null,
    hasScaffold: false,
    startedAt: null,
  });
  const [actionLoading, setActionLoading] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const uptime = useUptime(state.startedAt, state.status === "running");

  const isRunning = state.status === "running";
  const isActive = ["running", "installing", "starting", "cloning"].includes(state.status);
  const isIdle = state.status === "idle";
  const isError = state.status === "error";

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/devserver/workspace/${projectId}/status`, {
        credentials: "include",
      });
      if (r.ok) {
        const data = await r.json() as RuntimeState;
        setState(data);
      }
    } catch {}
  }, [projectId]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.logs.length]);

  const start = async () => {
    setActionLoading(true);
    try {
      await fetch(`/api/devserver/workspace/${projectId}/start`, {
        method: "POST",
        credentials: "include",
      });
      await poll();
    } finally {
      setActionLoading(false);
    }
  };

  const stop = async () => {
    setActionLoading(true);
    try {
      await fetch(`/api/devserver/workspace/${projectId}/stop`, {
        method: "POST",
        credentials: "include",
      });
      await poll();
    } finally {
      setActionLoading(false);
    }
  };

  const restart = async () => {
    setActionLoading(true);
    try {
      await fetch(`/api/devserver/workspace/${projectId}/stop`, { method: "POST", credentials: "include" });
      await new Promise((r) => setTimeout(r, 400));
      await fetch(`/api/devserver/workspace/${projectId}/start`, { method: "POST", credentials: "include" });
      await poll();
    } finally {
      setActionLoading(false);
    }
  };

  const atlasVoice = isRunning
    ? null
    : isError
    ? "The server exited with an error. Review the logs and restart."
    : !state.hasScaffold
    ? "No project code yet. Atlas will offer to run the preview once there\u2019s something to build."
    : isIdle
    ? "Ready. Click \u25B6 Run to build and start the dev server."
    : null;

  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!isActive || isRunning) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % spinnerFrames.length), 100);
    return () => clearInterval(id);
  }, [isActive, isRunning]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "var(--atlas-bg)",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          padding: "14px 16px 12px",
          borderBottom: "1px solid var(--atlas-border)",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Status row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isActive && !isRunning ? (
            <span
              style={{
                fontFamily: "var(--app-font-mono)",
                fontSize: 11,
                color: STATUS_COLOR[state.status],
                width: 10,
                display: "inline-block",
                flexShrink: 0,
              }}
            >
              {spinnerFrames[frame]}
            </span>
          ) : (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: STATUS_COLOR[state.status],
                flexShrink: 0,
                boxShadow: isRunning
                  ? "0 0 0 2px rgba(34,197,94,0.18), 0 0 7px rgba(34,197,94,0.35)"
                  : undefined,
                transition: "background 0.3s",
              }}
            />
          )}

          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--atlas-text)",
              letterSpacing: "0.01em",
            }}
          >
            {STATUS_LABEL[state.status]}
          </span>

          {uptime && (
            <span
              style={{
                fontSize: 10,
                color: "var(--atlas-muted)",
                fontFamily: "var(--app-font-mono)",
                opacity: 0.7,
              }}
            >
              {uptime}
            </span>
          )}

          <div style={{ flex: 1 }} />

          {isRunning && state.port && state.port !== 1 && (
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--app-font-mono)",
                color: "var(--atlas-muted)",
                background: "var(--atlas-surface)",
                border: "1px solid var(--atlas-border)",
                borderRadius: 4,
                padding: "1px 7px",
                letterSpacing: "0.03em",
              }}
            >
              :{state.port}
            </span>
          )}
        </div>

        {/* Atlas voice */}
        {atlasVoice && (
          <div
            style={{
              fontSize: 11,
              color: "var(--atlas-muted)",
              lineHeight: 1.55,
              fontStyle: "italic",
              opacity: 0.75,
            }}
          >
            {atlasVoice}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(isIdle || isError) && state.hasScaffold && (
            <button
              style={btnGreen}
              onClick={start}
              disabled={actionLoading}
            >
              <span>▶</span> Run
            </button>
          )}
          {isActive && (
            <button
              style={btnRed}
              onClick={stop}
              disabled={actionLoading}
            >
              <span>■</span> Stop
            </button>
          )}
          {isRunning && (
            <button
              style={btn}
              onClick={restart}
              disabled={actionLoading}
            >
              <span>↺</span> Restart
            </button>
          )}
          {isRunning && onOpenPreview && (
            <button
              style={{ ...btn, marginLeft: "auto" }}
              onClick={onOpenPreview}
            >
              <span>⧉</span> Open Preview
            </button>
          )}
        </div>
      </div>

      {/* ── Logs ───────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px 16px 16px",
          fontFamily: "var(--app-font-mono)",
          fontSize: 10.5,
          color: "var(--atlas-muted)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {state.logs.length === 0 ? (
          <span style={{ opacity: 0.3, fontStyle: "italic" }}>
            No output yet.
          </span>
        ) : (
          state.logs.map((line, i) => <LogLine key={i} line={line} />)
        )}

        {state.errorMsg && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.22)",
              borderRadius: 6,
              color: "#ef4444",
              fontSize: 10.5,
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {state.errorMsg}
          </div>
        )}

        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
