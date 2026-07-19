/**
 * Files page — standalone /files route mounting the unified FilesBrowser.
 * Slice 1 of the "Files, not Library" unification.
 */

import { useLocation } from "wouter";
import { FilesBrowser, type UnifiedFile } from "@/components/files/FilesBrowser";

export default function FilesPage() {
  const [, setLocation] = useLocation();

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
      minHeight: "100vh", background: "hsl(var(--background))",
      color: "hsl(var(--foreground))", display: "flex", flexDirection: "column",
    }}>
      <header style={{
        padding: "18px 24px 12px", borderBottom: "1px solid hsl(var(--border))",
        display: "flex", alignItems: "baseline", gap: 12,
      }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em" }}>Files</h1>
        <span style={{
          fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.18em",
          textTransform: "uppercase", color: "hsl(var(--muted-foreground))",
        }}>
          Everything Atlas can use
        </span>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <FilesBrowser mode="browse" onOpen={handleOpen} />
      </div>
    </div>
  );
}
