import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";

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
            height: 48,
            display: "flex",
            alignItems: "center",
            padding: "0 18px",
            pointerEvents: "none",
            background: "linear-gradient(180deg, var(--atlas-bg), transparent)",
            borderBottom: "1px solid var(--atlas-border)",
            opacity: currentDepth === "operational" ? 0.28 : 0.18,
            transition: "opacity 600ms ease, border-color 600ms ease",
          }}
        >
          <span
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 9,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--atlas-gold)",
            }}
          >
            Atlas
          </span>
          {activeProjectId != null && (
            <span
              style={{
                marginLeft: 10,
                fontFamily: "var(--app-font-mono)",
                fontSize: 9,
                letterSpacing: "0.12em",
                color: "var(--atlas-muted)",
                opacity: 0.72,
              }}
            >
              project {activeProjectId}
            </span>
          )}
        </div>
        <div
          style={{
            position: "relative",
            zIndex: 2,
            width: "100%",
            height: "100%",
            minHeight: "100dvh",
          }}
        >
          {children}
        </div>
      </div>
    </ShellStateContext.Provider>
  );
}
