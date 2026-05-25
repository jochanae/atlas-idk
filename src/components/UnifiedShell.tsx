import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { useAuth, isSuperAdmin } from "@/hooks/useAuth";
import { useProjectState } from "@/hooks/useProjectState";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { UserMenuDropdown } from "@/components/UserMenuDropdown";
import { useUpdateProject, getGetProjectQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";


type ShellDepth = "ambient" | "active" | "operational";

type ShellState = {
  currentDepth: ShellDepth;
  setDepth: (depth: ShellDepth) => void;
  activeProjectId: number | null;
  setActiveProjectId: (id: number | null) => void;
};

type ShellNavIcon =
  | "home"
  | "projects"
  | "decisions"
  | "you"
  | "map"
  | "files"
  | "forge"
  | "chat"
  | "ledger"
  | "preview"
  | "flow";

type ShellNavItem = {
  label: string;
  icon: ShellNavIcon;
  action: () => void;
};

const ShellStateContext = createContext<ShellState | null>(null);

export function useShellState(): ShellState {
  const context = useContext(ShellStateContext);
  if (!context) {
    throw new Error("useShellState must be used within UnifiedShell");
  }
  return context;
}

function depthFromPath(pathname: string): ShellDepth {
  if (pathname.startsWith("/project/")) return "operational";
  return "ambient";
}

function projectIdFromPath(pathname: string): number | null {
  const match = pathname.match(/^\/project\/(\d+)/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

function ShellWordmark() {
  const [, setLocation] = useLocation();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        onClick={() => setLocation("/home")}
        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}
      >
        <img
          src="/axiom-logo.svg"
          alt="Axiom"
          width={26}
          height={26}
          style={{ borderRadius: "20%", flexShrink: 0 }}
        />
        <span
          style={{
            fontFamily: "'IBM Plex Mono', var(--app-font-mono)",
            fontSize: "var(--ts-label)",
            fontWeight: 700,
            letterSpacing: "0.18em",
            lineHeight: "var(--lh-tight)",
            color: "var(--atlas-gold)",
            textTransform: "uppercase",
          }}
        >
          AXIOM
        </span>
      </button>
    </div>
  );
}


function ShellClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const day = days[now.getDay()];
  const mon = months[now.getMonth()];
  const date = now.getDate();
  let h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;

  return (
    <div
      aria-hidden
      style={{
        fontFamily: "var(--app-font-mono)",
        fontSize: 10,
        letterSpacing: "0.18em",
        color: "rgba(120,113,108,0.5)",
        userSelect: "none",
        textTransform: "uppercase",
      }}
    >
      {day} {mon} {date} · {h}:{m} {ampm}
    </div>
  );
}

function ShellAvatar() {
  const { user } = useAuth();
  const photoUrl = user?.avatarUrl || (() => {
    try {
      const raw = localStorage.getItem("atlas-user-profile");
      return raw ? (JSON.parse(raw).photoUrl ?? "") : "";
    } catch {
      return "";
    }
  })();
  const name = user?.name || user?.email?.split("@")[0] || "Account";
  const isAdmin = isSuperAdmin(user);

  const openAccount = useCallback(() => {
    window.dispatchEvent(new CustomEvent("axiom:open-account-hub"));
  }, []);

  const openInvite = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent("axiom:open-invite"));
  }, []);

  return (
    <div style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
    <div
      style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}
      role="button"
      tabIndex={0}
      aria-label="Open settings"
      onClick={openAccount}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openAccount();
        }
      }}
    >

      <div
        title={name}
        aria-label={name}
        style={{
          width: 36,
          height: 36,
          borderRadius: "22%",
          borderTop: "none",
          borderBottom: "none",
          borderLeft: "2px solid rgba(212,175,55,0.65)",
          borderRight: "2px solid rgba(212,175,55,0.65)",
          background: photoUrl ? "transparent" : "var(--atlas-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {photoUrl ? (
          <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "20%" }} />
        ) : (
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden>
            <circle cx="10" cy="7.5" r="3.2" stroke="#C9A24C" strokeWidth="1.2" />
            <path d="M3 18.5c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="#C9A24C" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        )}
      </div>
      {isAdmin && (
        <div
          style={{
            position: "absolute",
            bottom: -4,
            right: -4,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#D4AF37,#A07820)",
            border: "1.5px solid var(--atlas-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 6px rgba(212,175,55,0.5)",
            pointerEvents: "none",
            zIndex: 3,
          }}
        >
          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#0C0A09" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 20h20M4 20V10l4 4 4-8 4 8 4-4v10" />
          </svg>
        </div>
      )}
    </div>
      <button
        type="button"
        onClick={openInvite}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openInvite(e); } }}
        title="Invite collaborators"
        aria-label="Invite collaborators"
        style={{
          marginLeft: 6,
          width: 36,
          height: 36,
          borderRadius: "22%",
          border: "1.5px dashed rgba(212,175,55,0.55)",
          background: "transparent",
          color: "rgba(212,175,55,0.75)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 0,
          transition: "border-color 140ms ease, color 140ms ease, background 140ms ease",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(212,175,55,0.9)"; e.currentTarget.style.color = "rgba(212,175,55,1)"; e.currentTarget.style.background = "rgba(212,175,55,0.06)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(212,175,55,0.55)"; e.currentTarget.style.color = "rgba(212,175,55,0.75)"; e.currentTarget.style.background = "transparent"; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}

function ShellProjectSwitcher({ projectId }: { projectId: number | null }) {
  const ps = useProjectState(projectId);
  const name = ps.project?.name?.trim() || "Untitled project";
  const hasActive = Boolean(ps.activeSession);
  const qc = useQueryClient();
  const updateProject = useUpdateProject();

  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const escapeRef = useRef(false);

  const openSwitcher = useCallback(() => {
    window.dispatchEvent(new CustomEvent("axiom:open-projects-drawer"));
  }, []);

  const beginRename = useCallback(() => {
    setDraft(ps.project?.name ?? "");
    setError(null);
    setRenaming(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [ps.project?.name]);

  useEffect(() => {
    const handler = () => beginRename();
    window.addEventListener("axiom:rename-project", handler);
    return () => window.removeEventListener("axiom:rename-project", handler);
  }, [beginRename]);

  const commit = useCallback(() => {
    if (projectId == null || updateProject.isPending) return;
    const newName = draft.trim() || (ps.project?.name ?? "");
    if (newName === ps.project?.name) { setRenaming(false); return; }
    updateProject.mutate(
      { id: projectId, data: { name: newName } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          void ps.refresh();
          setRenaming(false);
          setError(null);
        },
        onError: (err) => {
          setError((err as Error)?.message ?? "Failed to rename.");
          setTimeout(() => inputRef.current?.focus(), 0);
        },
      }
    );
  }, [draft, projectId, ps, qc, updateProject]);

  if (projectId == null) return null;

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "min(260px, 100%)", minWidth: 0 }}>
      <span
        aria-hidden
        title={hasActive ? "Session active" : "No active session"}
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          flexShrink: 0,
          background: hasActive ? "var(--atlas-accent, #4ade80)" : "transparent",
          border: hasActive ? "none" : "1.5px solid rgba(var(--atlas-muted-rgb),0.5)",
          boxShadow: hasActive ? "0 0 6px rgba(74,222,128,0.6)" : "none",
        }}
      />
      {renaming ? (
        <div style={{ display: "inline-flex", flexDirection: "column", minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            disabled={updateProject.isPending}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            onKeyDown={(e) => {
              if (updateProject.isPending) return;
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") { escapeRef.current = true; setRenaming(false); setError(null); }
            }}
            onBlur={() => {
              if (updateProject.isPending) return;
              if (escapeRef.current) { escapeRef.current = false; return; }
              commit();
            }}
            style={{
              background: "transparent",
              border: "1px solid rgba(var(--atlas-gold-rgb),0.4)",
              borderRadius: 4,
              outline: "none",
              color: "var(--atlas-fg)",
              fontFamily: "var(--app-font-sans)",
              fontSize: "var(--ts-body)",
              fontWeight: 500,
              padding: "2px 6px",
              width: 180,
              opacity: updateProject.isPending ? 0.5 : 1,
              transition: "opacity 150ms ease",
            }}
          />
          {error && (
            <span style={{ fontSize: "var(--ts-sm)", color: "rgba(252,165,165,0.85)", fontFamily: "var(--app-font-mono)", marginTop: 2, lineHeight: 1.3 }}>
              {error}
            </span>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={openSwitcher}
          onDoubleClick={beginRename}
          title="Tap to switch project · double-tap to rename"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
            background: "transparent",
            border: "none",
            padding: "0 4px 0 6px",
            cursor: "pointer",
            color: "var(--atlas-fg)",
            fontFamily: "var(--app-font-sans)",
            fontSize: "var(--ts-body)",
            fontWeight: 500,
            lineHeight: "var(--lh-snug)",
            letterSpacing: "var(--ls-tight)",
            opacity: 0.92,
            pointerEvents: "auto",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{name}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity: 0.55, flexShrink: 0 }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}
    </div>
  );
}



function ShellStatusChip({ projectId }: { projectId: number | null }) {
  const ps = useProjectState(projectId);
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (projectId == null) return null;
  const count = ps.decisions?.length ?? 0;
  const active = !!ps.activeSession;
  const recent = (ps.decisions ?? []).slice(0, 4);
  const statusLabel = active ? "Session active" : "Idle";

  const go = (path: string) => { setOpen(false); navigate(path); };

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${count} ledger ${count === 1 ? "entry" : "entries"}, ${statusLabel}. Open activity.`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 9px",
          borderRadius: 999,
          background: open ? "rgba(var(--atlas-muted-rgb),0.12)" : "rgba(var(--atlas-muted-rgb),0.06)",
          border: "1px solid rgba(var(--atlas-muted-rgb),0.14)",
          fontFamily: "var(--app-font-mono)",
          fontSize: "var(--ts-caption)",
          letterSpacing: "var(--ls-mono-cap)",
          lineHeight: 1,
          textTransform: "uppercase",
          color: "var(--atlas-muted)",
          whiteSpace: "nowrap",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span
          className={active ? "atlas-pulse-dot" : undefined}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: active ? "#4ade80" : "transparent",
            border: active ? undefined : "1.5px solid rgba(var(--atlas-muted-rgb),0.5)",
            display: "inline-block",
          }}
        />
        <span style={{ fontWeight: 700, color: count > 0 ? "var(--atlas-gold)" : "var(--atlas-muted)" }}>{count}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Project activity"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 280,
            background: "rgba(10,9,8,0.96)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(var(--atlas-muted-rgb),0.18)",
            borderRadius: 12,
            boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
            zIndex: 1000,
            overflow: "hidden",
            fontFamily: "var(--app-font-sans)",
          }}
        >
          <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(var(--atlas-muted-rgb),0.12)", display: "flex", alignItems: "center", gap: 8 }}>
            <span
              className={active ? "atlas-pulse-dot" : undefined}
              style={{ width: 8, height: 8, borderRadius: "50%", background: active ? "#4ade80" : "rgba(var(--atlas-muted-rgb),0.5)" }}
            />
            <span style={{ fontSize: 13, color: "var(--atlas-fg)", fontWeight: 600 }}>{statusLabel}</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--app-font-mono)", fontSize: 11, color: "var(--atlas-muted)", textTransform: "uppercase", letterSpacing: "var(--ls-mono-cap)" }}>
              {count} {count === 1 ? "entry" : "entries"}
            </span>
          </div>

          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {recent.length === 0 ? (
              <div style={{ padding: "18px 14px", fontSize: 12, color: "var(--atlas-muted)", textAlign: "center" }}>
                No committed entries yet. Decisions you commit will land here.
              </div>
            ) : (
              recent.map((e: any) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => go(`/ledger?focus=${e.id}`)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "10px 14px", background: "transparent", border: "none",
                    borderBottom: "1px solid rgba(var(--atlas-muted-rgb),0.08)",
                    cursor: "pointer", color: "var(--atlas-fg)", fontSize: 13, lineHeight: 1.35,
                  }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.background = "rgba(var(--atlas-muted-rgb),0.06)")}
                  onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}
                >
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title || "Untitled"}</div>
                  {e.summary && (
                    <div style={{ marginTop: 3, fontSize: 11, color: "var(--atlas-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.summary}</div>
                  )}
                </button>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={() => go("/ledger")}
            style={{
              display: "block", width: "100%", padding: "10px 14px",
              background: "transparent", border: "none", borderTop: "1px solid rgba(var(--atlas-muted-rgb),0.12)",
              cursor: "pointer", color: "var(--atlas-gold)", fontSize: 12, fontWeight: 600,
              fontFamily: "var(--app-font-mono)", textTransform: "uppercase", letterSpacing: "var(--ls-mono-cap)",
              textAlign: "center",
            }}
          >
            Open Ledger →
          </button>
        </div>
      )}
    </div>
  );
}


function ShellFooterIcon({ icon }: { icon: ShellNavIcon }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (icon) {
    case "home":
      return <svg {...common}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9,22 9,12 15,12 15,22" /></svg>;
    case "projects":
    case "files":
      return <svg {...common}><path d="M3 7.2c0-.9.7-1.6 1.6-1.6h4.3c.4 0 .8.2 1.1.5l1.3 1.4c.3.3.7.5 1.1.5h6c.9 0 1.6.7 1.6 1.6v8.8c0 .9-.7 1.6-1.6 1.6H4.6C3.7 20 3 19.3 3 18.4V7.2z" /></svg>;
    case "decisions":
    case "ledger":
      return <svg {...common}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>;
    case "you":
      return <svg {...common}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
    case "map":
    case "flow":
      return <svg {...common}><path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" /><path d="M9 3v15M15 6v15" /></svg>;
    case "forge":
      return <svg {...common}><path d="M14.7 6.3a4 4 0 01-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 015.4-5.4l-3 3-3-3 3-3z" /></svg>;
    case "chat":
      return <svg {...common}><path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z" /></svg>;
    case "preview":
      return <svg {...common}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="3" /></svg>;
  }
}

function ShellFooterNavItem({ item, visible }: { item: ShellNavItem; visible: boolean }) {
  return (
    <button
      type="button"
      onClick={item.action}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        background: "none",
        border: "none",
        color: "rgba(var(--atlas-muted-rgb),0.55)",
        cursor: "pointer",
        opacity: visible ? 1 : 0,
        padding: "6px 0",
        transition: "opacity var(--motion-base) var(--ease-standard), color var(--motion-fast) var(--ease-standard)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--atlas-gold)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(var(--atlas-muted-rgb),0.55)")}
    >
      <ShellFooterIcon icon={item.icon} />
      <span
        style={{
          fontSize: "var(--ts-micro)",
          fontFamily: "var(--app-font-mono)",
          letterSpacing: "var(--ls-mono-cap)",
          textTransform: "uppercase",
        }}
      >
        {item.label}
      </span>
    </button>
  );
}

function ShellCenterButton({ onClick }: { onClick: () => void }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <button
        type="button"
        title="Axiom"
        className="atlas-home-center-btn"
        onClick={onClick}
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "2px solid var(--atlas-gold)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          marginTop: -26,
          flexShrink: 0,
          boxShadow: "0 0 0 2px rgba(var(--atlas-gold-rgb),0.55), 0 0 18px rgba(var(--atlas-gold-rgb),0.18)",
        }}
      >
        <div style={{ width: 52, height: 52, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
          <svg viewBox="0 0 512 512" width="52" height="52" display="block">
            <defs>
              <radialGradient id="shell-center-purple" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--atlas-phosphor)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--atlas-bg)" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="shell-center-gold" cx="50%" cy="40%" r="50%">
                <stop offset="0%" stopColor="var(--atlas-fg)" />
                <stop offset="50%" stopColor="var(--atlas-gold)" />
                <stop offset="100%" stopColor="var(--atlas-gold)" />
              </radialGradient>
            </defs>
            <circle cx="256" cy="256" r="256" fill="var(--atlas-bg)" />
            <circle cx="256" cy="256" r="256" fill="url(#shell-center-purple)" />
            <polygon points="256,130 178,390 216,390 268,188" fill="url(#shell-center-gold)" />
            <polygon points="256,130 334,390 296,390 244,188" fill="url(#shell-center-gold)" />
            <rect x="192" y="292" width="128" height="30" rx="5" fill="url(#shell-center-gold)" />
          </svg>
        </div>
      </button>
    </div>
  );
}

function ShellFooter() {
  const { currentDepth, activeProjectId } = useShellState();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [renderDepth, setRenderDepth] = useState<ShellDepth>(currentDepth);
  const [itemsVisible, setItemsVisible] = useState(true);

  useEffect(() => {
    if (currentDepth === renderDepth) return;
    setItemsVisible(false);
    const fadeOut = window.setTimeout(() => {
      setRenderDepth(currentDepth);
      window.requestAnimationFrame(() => setItemsVisible(true));
    }, 200);
    return () => window.clearTimeout(fadeOut);
  }, [currentDepth, renderDepth]);

  const openProjectTab = useCallback((tab: "chat" | "ledger" | "files" | "preview" | "flow" | "forge") => {
    if (!activeProjectId) {
      setLocation("/projects");
      return;
    }
    const rightPanelTab = tab === "flow" ? "map" : tab;
    try {
      sessionStorage.setItem("atlas-open-tab", rightPanelTab);
      sessionStorage.setItem("atlas-shell-open-tab", tab);
    } catch {}
    const query = tab === "flow" ? "?view=flow" : tab === "chat" ? "" : `?view=${tab}`;
    setLocation(`/project/${activeProjectId}${query}`);
    window.dispatchEvent(new CustomEvent("axiom:shell-open-tab", { detail: { tab } }));
  }, [activeProjectId, setLocation]);

  const scrollHomeConversationToTop = useCallback(() => {
    const homeSurface = document.querySelector<HTMLElement>(".atlas-home-bg");
    if (homeSurface) {
      homeSurface.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const centerAction = useCallback(() => {
    if (currentDepth === "active") {
      scrollHomeConversationToTop();
      return;
    }
    setLocation("/home");
  }, [currentDepth, scrollHomeConversationToTop, setLocation]);

  const navItems = useMemo<[ShellNavItem, ShellNavItem, ShellNavItem, ShellNavItem]>(() => {
    if (renderDepth === "operational") {
      return [
        { label: "Chat", icon: "chat", action: () => openProjectTab("chat") },
        { label: "Ledger", icon: "ledger", action: () => openProjectTab("ledger") },
        { label: "Preview", icon: "preview", action: () => openProjectTab("preview") },
        { label: "Flow", icon: "flow", action: () => openProjectTab("flow") },
      ];
    }
    if (renderDepth === "active") {
      return [
        { label: "Map", icon: "map", action: () => setLocation("/map") },
        { label: "Files", icon: "files", action: () => openProjectTab("files") },
        { label: "Decisions", icon: "decisions", action: () => setLocation("/ledger") },
        { label: "Forge", icon: "forge", action: () => openProjectTab("forge") },
      ];
    }
    return [
      { label: "Home", icon: "home", action: () => setLocation("/home") },
      { label: "Projects", icon: "projects", action: () => setLocation("/projects") },
      { label: "Decisions", icon: "decisions", action: () => setLocation("/ledger") },
      { label: "You", icon: "you", action: () => setLocation("/you") },
    ];
  }, [openProjectTab, renderDepth, setLocation]);

  if (!isMobile) return null;

  return (
    <footer className="atlas-mobile-footer" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 250, overflow: "visible" }}>
      <svg
        style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: 76, overflow: "visible", pointerEvents: "none" }}
        preserveAspectRatio="none"
        viewBox="0 0 390 64"
      >
        <path
          d="M0,0 L148,0 C163,0 172,22 195,22 C218,22 227,0 242,0 L390,0 L390,64 L0,64 Z"
          fill="var(--atlas-nav-arch-fill)"
        />
        <path
          d="M0,0.5 L148,0.5 C163,0.5 172,22 195,22 C218,22 227,0.5 242,0.5 L390,0.5"
          fill="none"
          stroke="rgba(var(--atlas-gold-rgb),0.2)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          height: 64,
          paddingBottom: "max(env(safe-area-inset-bottom), 6px)",
          zIndex: 1,
        }}
      >
        <ShellFooterNavItem item={navItems[0]} visible={itemsVisible} />
        <ShellFooterNavItem item={navItems[1]} visible={itemsVisible} />
        <ShellCenterButton onClick={centerAction} />
        <ShellFooterNavItem item={navItems[2]} visible={itemsVisible} />
        <ShellFooterNavItem item={navItems[3]} visible={itemsVisible} />
      </div>
    </footer>
  );
}

export function UnifiedShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [currentDepth, setCurrentDepth] = useState<ShellDepth>(() => depthFromPath(location));
  const [activeProjectId, setActiveProjectIdState] = useState<number | null>(() => projectIdFromPath(location));

  useEffect(() => {
    const projectId = projectIdFromPath(location);
    if (projectId != null) {
      setCurrentDepth("operational");
      setActiveProjectIdState(projectId);
    } else {
      setActiveProjectIdState(null);
    }
  }, [location]);

  const setDepth = useCallback((depth: ShellDepth) => {
    setCurrentDepth(depth);
  }, []);

  const setActiveProjectId = useCallback((id: number | null) => {
    setActiveProjectIdState(id);
  }, []);

  const value = useMemo<ShellState>(() => ({
    currentDepth,
    setDepth,
    activeProjectId,
    setActiveProjectId,
  }), [activeProjectId, currentDepth, setActiveProjectId, setDepth]);

  const shellBackgroundImage = currentDepth === "operational"
    ? "none"
    : currentDepth === "active"
      ? "linear-gradient(rgba(var(--atlas-bg-rgb),0.4), rgba(var(--atlas-bg-rgb),0.4)), var(--atlas-home-bg-gradient)"
      : "var(--atlas-home-bg-gradient)";
  const contentMaxWidth = currentDepth === "operational"
    ? "100%"
    : currentDepth === "active"
      ? 780
      : 680;
  const contentPadding = currentDepth === "operational"
    ? 0
    : "0 clamp(14px, 4vw, 24px)";

  return (
    <ShellStateContext.Provider value={value}>
      <div
        data-shell-depth={currentDepth}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          minHeight: "100dvh",
          overflow: "hidden",
          backgroundColor: "var(--atlas-bg)",
          backgroundImage: shellBackgroundImage,
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          color: "var(--atlas-fg)",
          isolation: "isolate",
          transition: "background-color var(--motion-deliberate) var(--ease-out-soft), background-image var(--motion-deliberate) var(--ease-out-soft)",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
            background: currentDepth === "operational"
              ? "transparent"
              : "var(--atlas-home-atmosphere)",
            opacity: currentDepth === "ambient" ? 0.9 : currentDepth === "active" ? 0.54 : 0,
            transition: "opacity var(--motion-deliberate) var(--ease-out-soft), background var(--motion-deliberate) var(--ease-out-soft)",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1,
            height: 1,
            pointerEvents: "none",
            background: "rgba(var(--atlas-gold-rgb), 0.15)",
            opacity: currentDepth === "operational" ? 1 : 0,
            transition: "opacity var(--motion-slow) var(--ease-out-soft)",
          }}
        />
        <header
          className="atlas-app-header"
          style={{
            position: "fixed",
            top: 1,
            left: 0,
            right: 0,
            zIndex: 20,
            height: 50,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 clamp(14px, 4vw, 24px)",
            borderBottom: currentDepth === "ambient" ? "none" : undefined,
            boxShadow: "none",
            opacity: 1,
            background: currentDepth === "ambient" ? "transparent" : undefined,
            backdropFilter: currentDepth === "ambient" ? "none" : undefined,
            WebkitBackdropFilter: currentDepth === "ambient" ? "none" : undefined,
            transition: "opacity var(--motion-deliberate) var(--ease-out-soft), background var(--motion-deliberate) var(--ease-out-soft), backdrop-filter var(--motion-deliberate) var(--ease-out-soft), border-color var(--motion-deliberate) var(--ease-out-soft)",
          }}
        >
          <div style={{ flexShrink: 0, minWidth: 0 }}>
            <ShellWordmark />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "center", pointerEvents: "auto" }}>
            <ShellProjectSwitcher projectId={activeProjectId} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <ShellStatusChip projectId={activeProjectId} />
            <UserMenuDropdown onOpenProfile={() => window.dispatchEvent(new CustomEvent("axiom:open-account-hub"))} />
          </div>
        </header>
        <div
          style={{
            position: "relative",
            zIndex: 2,
            width: "100%",
            height: "100%",
            minHeight: "100dvh",
            maxWidth: contentMaxWidth,
            margin: "0 auto",
            padding: contentPadding,
            transition: "all var(--motion-deliberate) var(--ease-out-soft)",
          }}
        >
          {children}
        </div>
        {/* ShellFooter intentionally not rendered — UnifiedContextDock owns the bottom nav.
            Two fixed footers at bottom:0 caused tap collisions. */}
      </div>
    </ShellStateContext.Provider>
  );
}

