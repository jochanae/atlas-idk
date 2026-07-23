// /commits/:projectId/:sha — in-app scoped view of an external GitHub commit.
// Reached from SystemActivityCard "Details" button. Stays inside Joy.
import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";

interface CommitFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null;
  blobUrl: string | null;
}

interface CommitDetail {
  sha: string;
  shortSha: string;
  htmlUrl: string;
  repo: string;
  message: string;
  author: { name: string | null; date: string | null };
  stats: { additions?: number; deletions?: number; total?: number } | null;
  files: CommitFile[];
}

export default function CommitPage() {
  const params = useParams<{ projectId: string; sha: string }>();
  const [, setLocation] = useLocation();
  const projectId = params?.projectId;
  const sha = params?.sha;

  const [data, setData] = useState<CommitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId || !sha) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/projects/${projectId}/commits/${sha}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Commit fetch failed (${r.status})`);
        return r.json() as Promise<CommitDetail>;
      })
      .then((row) => { if (!cancelled) { setData(row); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load commit"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, sha]);

  const title = data?.message?.split("\n")[0] ?? (loading ? "Loading commit…" : "Commit");

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--atlas-bg)",
      color: "var(--atlas-fg)",
      padding: "24px 16px 64px",
    }}>
      <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <button
          type="button"
          onClick={() => window.history.length > 1 ? window.history.back() : setLocation("/home")}
          style={{
            alignSelf: "flex-start",
            padding: "6px 10px",
            background: "transparent",
            border: "0.5px solid var(--atlas-border)",
            borderRadius: 5,
            color: "var(--atlas-muted, rgba(255,255,255,0.55))",
            fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.08em",
            cursor: "pointer",
          }}
        >
          ← Back
        </button>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{
            fontFamily: "var(--app-font-mono)", fontSize: 9,
            letterSpacing: "0.22em",
            color: "var(--atlas-muted, rgba(255,255,255,0.5))",
            textTransform: "uppercase",
          }}>
            Commit {data?.shortSha ?? (sha ? sha.slice(0, 7) : "")}
            {data?.repo ? ` · ${data.repo}` : ""}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</div>
          {data?.stats && (
            <div style={{
              fontFamily: "var(--app-font-mono)", fontSize: 10,
              color: "var(--atlas-muted, rgba(255,255,255,0.55))",
              marginTop: 4,
            }}>
              {data.files.length} file{data.files.length === 1 ? "" : "s"}
              {typeof data.stats.additions === "number" && (
                <> · <span style={{ color: "rgba(74,222,128,0.85)" }}>+{data.stats.additions}</span></>
              )}
              {typeof data.stats.deletions === "number" && (
                <> · <span style={{ color: "rgba(248,113,113,0.85)" }}>−{data.stats.deletions}</span></>
              )}
            </div>
          )}
        </div>

        {loading && !data && <EmptyState label="Loading commit…" />}
        {error && !data && <EmptyState label={error} />}

        {data && data.files.length === 0 && <EmptyState label="No file changes in this commit." />}

        {data && data.files.map((f) => (
          <FileDiff key={f.filename} file={f} />
        ))}

        {data && (
          <a
            href={data.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              alignSelf: "flex-start",
              padding: "8px 14px",
              background: "transparent",
              border: "0.5px solid var(--atlas-border)",
              borderRadius: 6,
              color: "var(--atlas-fg)",
              fontSize: 12, textDecoration: "none",
              fontFamily: "inherit",
            }}
          >
            Open commit on GitHub →
          </a>
        )}
      </div>
    </div>
  );
}

function FileDiff({ file }: { file: CommitFile }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{
      borderRadius: 8,
      border: "0.5px solid var(--atlas-border)",
      background: "rgba(255,255,255,0.015)",
      overflow: "hidden",
    }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          width: "100%",
          padding: "10px 12px",
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          color: "var(--atlas-fg)",
          font: "inherit",
        }}
      >
        <span style={{ fontSize: 10, opacity: 0.55 }}>{open ? "▾" : "▸"}</span>
        <span style={{
          fontFamily: "var(--app-font-mono)", fontSize: 9,
          padding: "2px 6px", borderRadius: 3,
          background: statusBg(file.status),
          color: statusFg(file.status),
          letterSpacing: "0.08em", textTransform: "uppercase",
          flexShrink: 0,
        }}>{file.status}</span>
        <span style={{
          flex: 1, minWidth: 0,
          fontFamily: "var(--app-font-mono)", fontSize: 12,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{file.filename}</span>
        <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, flexShrink: 0 }}>
          <span style={{ color: "rgba(74,222,128,0.9)" }}>+{file.additions}</span>
          {" "}
          <span style={{ color: "rgba(248,113,113,0.9)" }}>−{file.deletions}</span>
        </span>
      </button>
      {open && file.patch && (
        <pre style={{
          margin: 0,
          padding: "10px 12px",
          background: "rgba(0,0,0,0.25)",
          borderTop: "0.5px solid var(--atlas-border)",
          fontFamily: "var(--app-font-mono)", fontSize: 11, lineHeight: 1.5,
          overflowX: "auto",
          whiteSpace: "pre",
        }}>
          {file.patch.split("\n").map((line, i) => {
            let color = "var(--atlas-fg)";
            let bg = "transparent";
            if (line.startsWith("+") && !line.startsWith("+++")) { color = "rgba(74,222,128,0.95)"; bg = "rgba(74,222,128,0.08)"; }
            else if (line.startsWith("-") && !line.startsWith("---")) { color = "rgba(248,113,113,0.95)"; bg = "rgba(248,113,113,0.08)"; }
            else if (line.startsWith("@@")) { color = "rgba(139,148,255,0.9)"; }
            return <div key={i} style={{ color, background: bg, padding: "0 4px" }}>{line || " "}</div>;
          })}
        </pre>
      )}
      {open && !file.patch && (
        <div style={{
          padding: "10px 12px",
          borderTop: "0.5px solid var(--atlas-border)",
          fontFamily: "var(--app-font-mono)", fontSize: 11,
          color: "var(--atlas-muted, rgba(255,255,255,0.55))",
        }}>
          Diff not available (binary or too large).
        </div>
      )}
    </div>
  );
}

function statusBg(status: string): string {
  switch (status) {
    case "added": return "rgba(74,222,128,0.15)";
    case "removed": return "rgba(248,113,113,0.15)";
    case "renamed": return "rgba(139,148,255,0.15)";
    default: return "rgba(201,162,76,0.15)";
  }
}
function statusFg(status: string): string {
  switch (status) {
    case "added": return "rgba(74,222,128,0.95)";
    case "removed": return "rgba(248,113,113,0.95)";
    case "renamed": return "rgba(139,148,255,0.95)";
    default: return "rgba(201,162,76,0.95)";
  }
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{
      marginTop: 8,
      padding: "24px 20px",
      borderRadius: 10,
      border: "0.5px dashed var(--atlas-border)",
      textAlign: "center",
      fontFamily: "var(--app-font-mono)", fontSize: 11,
      letterSpacing: "0.04em",
      color: "var(--atlas-muted, rgba(255,255,255,0.55))",
    }}>
      {label}
    </div>
  );
}
