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
import { toast } from "sonner";

type ShellDepth = "ambient" | "active" | "operational";

type ShellState = {
  currentDepth: ShellDepth;
  setDepth: (depth: ShellDepth) => void;
  activeProjectId: number | null;
  setActiveProjectId: (id: number | null) => void;
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
  const openProjects = useCallback(() => {
    window.dispatchEvent(new CustomEvent("axiom:open-projects-drawer"));
  }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        onClick={openProjects}
        title="Open projects"
        aria-label="Open projects"
        style={{
          background: "transparent",
          border: "none",
          padding: 4,
          margin: 0,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(201,162,76,0.55)",
          transition: "color 160ms ease",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(201,162,76,0.95)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(201,162,76,0.55)")}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 7.2c0-.9.7-1.6 1.6-1.6h4.3c.4 0 .8.2 1.1.5l1.3 1.4c.3.3.7.5 1.1.5h6c.9 0 1.6.7 1.6 1.6v8.8c0 .9-.7 1.6-1.6 1.6H4.6C3.7 20 3 19.3 3 18.4V7.2z" />
        </svg>
      </button>
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
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.18em",
          color: "var(--atlas-gold)",
          textTransform: "uppercase",
        }}
      >
        AXIOM
      </span>
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

  return (
    <div style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
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
  );
}

function ShellConversationTitle({ projectId }: { projectId: number | null }) {
  const { activeSession, refresh } = useProjectState(projectId);
  const [editing, setEditing] = useState(false);
  const [displayedTitle, setDisplayedTitle] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const cancelBlurRef = useRef(false);

  useEffect(() => {
    if (!editing) {
      const nextTitle = activeSession?.title ?? "";
      setDisplayedTitle(nextTitle);
      setDraftTitle(nextTitle);
    }
  }, [activeSession?.title, editing]);

  const beginEditing = useCallback(() => {
    if (!activeSession) return;
    setDraftTitle(displayedTitle || activeSession.title);
    setEditing(true);
  }, [activeSession, displayedTitle]);

  const submitRename = useCallback(async () => {
    if (!activeSession || saving) return;
    const previousTitle = displayedTitle || activeSession.title;
    const newTitle = draftTitle.trim() || previousTitle;

    if (newTitle === previousTitle) {
      setEditing(false);
      setDraftTitle(previousTitle);
      return;
    }

    setSaving(true);
    setDisplayedTitle(newTitle);
    try {
      const res = await fetch(`/api/sessions/${activeSession.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!res.ok) throw new Error(`Rename failed: HTTP ${res.status}`);
      toast("Renamed");
      await refresh();
    } catch {
      setDisplayedTitle(previousTitle);
      setDraftTitle(previousTitle);
      toast("Rename failed");
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }, [activeSession, displayedTitle, draftTitle, refresh, saving]);

  if (!activeSession) return <ShellClock />;

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, pointerEvents: "auto" }}>
      {editing ? (
        <input
          autoFocus
          value={draftTitle}
          disabled={saving}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={() => {
            if (cancelBlurRef.current) {
              cancelBlurRef.current = false;
              return;
            }
            void submitRename();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submitRename();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelBlurRef.current = true;
              setDraftTitle(displayedTitle);
              setEditing(false);
            }
          }}
          style={{
            width: 180,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--atlas-fg)",
            fontFamily: "var(--app-font-sans)",
            fontSize: 13,
            fontWeight: 500,
            textAlign: "center",
            opacity: saving ? 0.55 : 0.92,
          }}
        />
      ) : (
        <button
          type="button"
          onClick={beginEditing}
          title="Rename conversation"
          style={{
            maxWidth: 220,
            background: "transparent",
            border: "none",
            color: "var(--atlas-fg)",
            cursor: "pointer",
            fontFamily: "var(--app-font-sans)",
            fontSize: 13,
            fontWeight: 500,
            opacity: 0.92,
            overflow: "hidden",
            padding: "0 8px",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayedTitle || activeSession.title}
        </button>
      )}
      <ShellClock />
    </div>
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
    : currentDepth === "active"
      ? "0 16px"
      : "0 24px";

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
          transition: "background-color 600ms ease, background-image 600ms ease",
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
            transition: "opacity 600ms ease, background 600ms ease",
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
            transition: "opacity 400ms ease",
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
            justifyContent: "space-between",
            padding: "0 24px",
            background: "linear-gradient(180deg, var(--atlas-bg), transparent)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderBottom: "none",
            boxShadow: "var(--atlas-home-header-shadow)",
            opacity: 1,
            transition: "opacity 600ms ease",
          }}
        >
          <ShellWordmark />
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
            <ShellConversationTitle projectId={activeProjectId} />
          </div>
          <ShellAvatar />
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
            transition: "all 600ms ease",
          }}
        >
          {children}
        </div>
      </div>
    </ShellStateContext.Provider>
  );
}
