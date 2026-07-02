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

interface ShareState {
  token: string | null;
  url: string | null;
}

interface PublishState {
  token: string | null;
  url: string | null;
  publishedAt: string | null;
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
  return <div style={{ color, lineHeight: "1.65" }}>{line}</div>;
}

const btn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11,
  padding: "4px 11px", borderRadius: 5, border: "1px solid var(--atlas-border)",
  background: "var(--atlas-surface)", color: "var(--atlas-text)", cursor: "pointer",
  fontFamily: "var(--app-font-mono)", letterSpacing: "0.02em", whiteSpace: "nowrap",
  userSelect: "none",
};
const btnGreen: React.CSSProperties = { ...btn, background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" };
const btnRed: React.CSSProperties = { ...btn, background: "rgba(239,68,68,0.10)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" };
const btnBlue: React.CSSProperties = { ...btn, background: "rgba(99,179,237,0.10)", color: "#63b3ed", border: "1px solid rgba(99,179,237,0.25)" };
const btnPurple: React.CSSProperties = { ...btn, background: "rgba(167,139,250,0.10)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.25)" };

function UrlRow({
  url,
  onCopy,
  copied,
  onAction,
  actionLabel,
  actionDanger,
  disabled,
}: {
  url: string;
  onCopy: () => void;
  copied: boolean;
  onAction: () => void;
  actionLabel: string;
  actionDanger?: boolean;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input
        readOnly value={url}
        style={{ flex: 1, fontSize: 10, fontFamily: "var(--app-font-mono)", background: "var(--atlas-bg)", border: "1px solid var(--atlas-border)", borderRadius: 4, padding: "4px 8px", color: "var(--atlas-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        onFocus={(e) => e.target.select()}
      />
      <button style={{ ...btn, fontSize: 10, padding: "4px 10px" }} onClick={onCopy}>{copied ? "✓ Copied" : "Copy"}</button>
      <button
        style={{ ...btn, fontSize: 10, padding: "4px 10px", color: actionDanger ? "#ef4444" : undefined, borderColor: actionDanger ? "rgba(239,68,68,0.25)" : undefined }}
        onClick={onAction} disabled={disabled}
      >{actionLabel}</button>
    </div>
  );
}

export function RuntimePanel({ projectId, onOpenPreview }: { projectId: number; onOpenPreview?: () => void }) {
  const [state, setState] = useState<RuntimeState>({ status: "idle", port: null, logs: [], errorMsg: null, hasScaffold: false, startedAt: null });
  const [actionLoading, setActionLoading] = useState(false);

  // Share state
  const [share, setShare] = useState<ShareState>({ token: null, url: null });
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Publish state
  const [pub, setPub] = useState<PublishState>({ token: null, url: null, publishedAt: null });
  const [pubOpen, setPubOpen] = useState(false);
  const [pubLoading, setPubLoading] = useState(false);
  const [pubCopied, setPubCopied] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const uptime = useUptime(state.startedAt, state.status === "running");

  const isRunning = state.status === "running";
  const isActive = ["running", "installing", "starting", "cloning"].includes(state.status);
  const isIdle = state.status === "idle";
  const isError = state.status === "error";

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/devserver/workspace/${projectId}/status`, { credentials: "include" });
      if (r.ok) setState(await r.json() as RuntimeState);
    } catch {}
  }, [projectId]);

  useEffect(() => { poll(); const id = setInterval(poll, 3000); return () => clearInterval(id); }, [poll]);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [state.logs.length]);

  // Load share + publish state on mount
  useEffect(() => {
    fetch(`/api/projects/${projectId}/share`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null).then((d) => { if (d) setShare({ token: d.token, url: d.url }); }).catch(() => {});
    fetch(`/api/projects/${projectId}/publish`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null).then((d) => { if (d) setPub({ token: d.token, url: d.url, publishedAt: d.publishedAt }); }).catch(() => {});
  }, [projectId]);

  const start = async () => { setActionLoading(true); try { await fetch(`/api/devserver/workspace/${projectId}/start`, { method: "POST", credentials: "include" }); await poll(); } finally { setActionLoading(false); } };
  const stop = async () => { setActionLoading(true); try { await fetch(`/api/devserver/workspace/${projectId}/stop`, { method: "POST", credentials: "include" }); await poll(); } finally { setActionLoading(false); } };
  const restart = async () => {
    setActionLoading(true);
    try {
      await fetch(`/api/devserver/workspace/${projectId}/stop`, { method: "POST", credentials: "include" });
      await new Promise((r) => setTimeout(r, 400));
      await fetch(`/api/devserver/workspace/${projectId}/start`, { method: "POST", credentials: "include" });
      await poll();
    } finally { setActionLoading(false); }
  };

  // Share actions
  const generateShare = async () => {
    setShareLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/share`, { method: "POST", credentials: "include" });
      if (r.ok) { const d = await r.json() as ShareState; setShare(d); setShareOpen(true); }
    } finally { setShareLoading(false); }
  };
  const revokeShare = async () => {
    setShareLoading(true);
    try { await fetch(`/api/projects/${projectId}/share`, { method: "DELETE", credentials: "include" }); setShare({ token: null, url: null }); setShareOpen(false); }
    finally { setShareLoading(false); }
  };
  const copyShare = async () => { if (!share.url) return; try { await navigator.clipboard.writeText(share.url); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); } catch {} };

  // Publish actions
  const publishBuild = async () => {
    setPubLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/publish`, { method: "POST", credentials: "include" });
      if (r.ok) { const d = await r.json() as PublishState; setPub(d); setPubOpen(true); }
    } finally { setPubLoading(false); }
  };
  const republishBuild = async () => {
    setPubLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/publish`, { method: "PUT", credentials: "include" });
      if (r.ok) { const d = await r.json() as PublishState; setPub(d); }
    } finally { setPubLoading(false); }
  };
  const unpublish = async () => {
    setPubLoading(true);
    try { await fetch(`/api/projects/${projectId}/publish`, { method: "DELETE", credentials: "include" }); setPub({ token: null, url: null, publishedAt: null }); setPubOpen(false); }
    finally { setPubLoading(false); }
  };
  const copyPub = async () => { if (!pub.url) return; try { await navigator.clipboard.writeText(pub.url); setPubCopied(true); setTimeout(() => setPubCopied(false), 2000); } catch {} };

  const atlasVoice = isRunning ? null
    : isError ? "The server exited with an error. Review the logs and restart."
    : !state.hasScaffold ? "No project code yet. Atlas will offer to run the preview once there\u2019s something to build."
    : isIdle ? "Ready. Click \u25B6 Run to build and start the dev server." : null;

  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!isActive || isRunning) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % spinnerFrames.length), 100);
    return () => clearInterval(id);
  }, [isActive, isRunning]);

  const pubDate = pub.publishedAt
    ? new Date(pub.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--atlas-bg)" }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--atlas-border)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Status row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isActive && !isRunning
            ? <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 11, color: STATUS_COLOR[state.status], width: 10, display: "inline-block", flexShrink: 0 }}>{spinnerFrames[frame]}</span>
            : <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[state.status], flexShrink: 0, boxShadow: isRunning ? "0 0 0 2px rgba(34,197,94,0.18), 0 0 7px rgba(34,197,94,0.35)" : undefined, transition: "background 0.3s" }} />
          }
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--atlas-text)", letterSpacing: "0.01em" }}>{STATUS_LABEL[state.status]}</span>
          {uptime && <span style={{ fontSize: 10, color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)", opacity: 0.7 }}>{uptime}</span>}
          <div style={{ flex: 1 }} />
          {pub.token && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "#a78bfa", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 10, padding: "1px 8px", letterSpacing: "0.04em" }}>
              🚀 Published
            </span>
          )}
          {isRunning && state.port && state.port !== 1 && (
            <span style={{ fontSize: 10, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", background: "var(--atlas-surface)", border: "1px solid var(--atlas-border)", borderRadius: 4, padding: "1px 7px", letterSpacing: "0.03em" }}>:{state.port}</span>
          )}
        </div>

        {/* Atlas voice */}
        {atlasVoice && (
          <div style={{ fontSize: 11, color: "var(--atlas-muted)", lineHeight: 1.55, fontStyle: "italic", opacity: 0.75 }}>{atlasVoice}</div>
        )}

        {/* Actions row */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(isIdle || isError) && state.hasScaffold && (
            <button style={btnGreen} onClick={start} disabled={actionLoading}><span>▶</span> Run</button>
          )}
          {isActive && (
            <button style={btnRed} onClick={stop} disabled={actionLoading}><span>■</span> Stop</button>
          )}
          {isRunning && (
            <button style={btn} onClick={restart} disabled={actionLoading}><span>↺</span> Rebuild</button>
          )}
          {isRunning && (
            <button
              style={share.token ? { ...btnBlue, opacity: 0.75 } : btnBlue}
              onClick={() => share.token ? setShareOpen((o) => !o) : generateShare()}
              disabled={shareLoading}
              title={share.token ? "Manage share link" : "Generate a temporary share link"}
            >
              <span>⇗</span> {share.token ? "Shared" : "Share"}
            </button>
          )}
          {isRunning && (
            <button
              style={pub.token ? { ...btnPurple, opacity: 0.85 } : btnPurple}
              onClick={() => pub.token ? setPubOpen((o) => !o) : publishBuild()}
              disabled={pubLoading}
              title={pub.token ? "Manage published app" : "Publish this build to a permanent URL"}
            >
              <span>🚀</span> {pub.token ? "Published" : "Publish"}
            </button>
          )}
          {isRunning && onOpenPreview && (
            <button style={{ ...btn, marginLeft: "auto" }} onClick={onOpenPreview}><span>⧉</span> Preview</button>
          )}
        </div>

        {/* Share panel */}
        {shareOpen && share.url && (
          <div style={{ padding: "10px 12px", background: "rgba(99,179,237,0.06)", border: "1px solid rgba(99,179,237,0.2)", borderRadius: 6, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, color: "var(--atlas-muted)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", opacity: 0.6 }}>Share Link</div>
            <div style={{ fontSize: 10.5, color: "var(--atlas-muted)", lineHeight: 1.5 }}>
              Anyone with this link can view the latest build — no login required. Revoke to stop access.
            </div>
            <UrlRow url={share.url} onCopy={copyShare} copied={shareCopied} onAction={revokeShare} actionLabel="Revoke" actionDanger disabled={shareLoading} />
          </div>
        )}

        {/* Publish panel */}
        {pubOpen && pub.url && (
          <div style={{ padding: "10px 12px", background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 6, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 10, color: "#a78bfa", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>Published App</div>
              {pubDate && <span style={{ fontSize: 9.5, color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)", opacity: 0.55 }}>{pubDate}</span>}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--atlas-muted)", lineHeight: 1.5 }}>
              This permanent URL always serves the <strong style={{ color: "var(--atlas-fg)", fontWeight: 500 }}>latest build</strong> — rebuild to update what visitors see. Unpublishing revokes access immediately.
            </div>
            <UrlRow url={pub.url} onCopy={copyPub} copied={pubCopied} onAction={unpublish} actionLabel="Unpublish" actionDanger disabled={pubLoading} />
            <button
              style={{ ...btn, fontSize: 10, alignSelf: "flex-start", color: "#a78bfa", borderColor: "rgba(167,139,250,0.25)" }}
              onClick={republishBuild}
              disabled={pubLoading}
              title="Generate a new permanent URL (old URL stops working)"
            >
              ↻ New URL
            </button>
          </div>
        )}
      </div>

      {/* ── Logs ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px 16px", fontFamily: "var(--app-font-mono)", fontSize: 10.5, color: "var(--atlas-muted)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
        {state.logs.length === 0
          ? <span style={{ opacity: 0.3, fontStyle: "italic" }}>No output yet.</span>
          : state.logs.map((line, i) => <LogLine key={i} line={line} />)
        }
        {state.errorMsg && (
          <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)", borderRadius: 6, color: "#ef4444", fontSize: 10.5, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
            {state.errorMsg}
          </div>
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
