/**
 * Files page — standalone /files route mounting the unified FilesBrowser.
 * Slice 1 of the "Files, not Library" unification.
 */

import { useLocation } from "wouter";
import { ChevronLeft, X } from "lucide-react";
import { FilesBrowser, type UnifiedFile } from "@/components/files/FilesBrowser";
import { useEntryReferrer } from "@/hooks/useEntryReferrer";

/** Paths that count as a valid in-app Joy origin for the back chevron. */
function isAtlasLocation(path: string | null | undefined): boolean {
  if (!path || path === "/files") return false;
  // Reject bare external/unknown origins; keep known app surfaces.
  return (
    path === "/home" ||
    path === "/projects" ||
    path === "/parking" ||
    path === "/code" ||
    path === "/connectors" ||
    path === "/account" ||
    path === "/settings" ||
    path === "/help" ||
    path.startsWith("/project/") ||
    path.startsWith("/workspace/") ||
    path.startsWith("/ledger") ||
    path.startsWith("/entry/")
  );
}

export default function FilesPage() {
  const [, setLocation] = useLocation();
  const { goBack, previewPrev } = useEntryReferrer("/home");
  const prev = previewPrev();
  const hasAtlasPrev = isAtlasLocation(prev);
  // When history has a prior Joy location → back chevron.
  // When opened without a stack entry (deep link / overlay-style entry) → X,
  // still returning to the originating surface via /home fallback.
  const useCloseX = !hasAtlasPrev;

  const handleExit = () => {
    if (hasAtlasPrev) {
      goBack("/home");
      return;
    }
    setLocation("/home");
  };

  const handleOpen = (file: UnifiedFile) => {
    // Workspace files → deep link into project workspace at that path.
    if (file.section === "workspace") {
      const [, pidStr] = file.id.split(":");
      const pid = parseInt(pidStr, 10);
      if (!Number.isNaN(pid)) setLocation(`/project/${pid}`);
      return;
    }
    // Saved / Generated → for now, no-op; later opens preview drawer.
  };

  return (
    <div style={{
      height: "100dvh", background: "var(--background, var(--atlas-bg, #0b0a0f))",
      color: "var(--foreground, var(--atlas-fg, #f5efe0))", display: "flex", flexDirection: "column",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      <header style={{
        padding: "14px 16px 12px", borderBottom: "1px solid var(--border, var(--atlas-border, rgba(230,198,135,0.15)))",
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={handleExit}
          aria-label={useCloseX ? "Close Files" : "Back"}
          style={{
            width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center",
            border: "1px solid var(--border, var(--atlas-border, rgba(230,198,135,0.15)))", background: "transparent",
            color: "var(--atlas-muted, hsl(var(--muted-foreground)))", cursor: "pointer", flexShrink: 0,
          }}
        >
          {useCloseX ? (
            <X size={16} strokeWidth={1.6} />
          ) : (
            <ChevronLeft size={18} strokeWidth={1.6} />
          )}
        </button>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em" }}>Files</h1>
          <span style={{
            fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "hsl(var(--muted-foreground))",
          }}>
            Everything Joy can use
          </span>
        </div>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <FilesBrowser mode="browse" onOpen={handleOpen} />
      </div>
    </div>
  );
}
