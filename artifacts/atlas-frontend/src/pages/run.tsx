// /runs/:id — in-app Run inspection surface.
// Reuses ViewChangesPanel so Details from the run/commit cards opens the
// same Timeline + Changes lens the drawer uses, but as a full page.

import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { ViewChangesPanel } from "@/components/workspace/ViewChangesPanel";

interface RunMeta {
  id: string;
  projectId: number | null;
  threadId: number | null;
  messageId: number | null;
  summary: string | null;
  startedAt: string;
  status: string;
}

export default function RunPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = params?.id;

  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/runs/${id}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Run fetch failed (${r.status})`);
        return r.json() as Promise<RunMeta>;
      })
      .then((row) => {
        if (!cancelled) {
          setMeta(row);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load run");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

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
            Run {id ? id.slice(0, 8) : ""}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {meta?.summary || (loading ? "Loading run…" : "Run details")}
          </div>
        </div>

        {loading && !meta && (
          <EmptyState label="Loading…" />
        )}

        {error && !meta && (
          <EmptyState label={error} />
        )}

        {meta && meta.projectId != null && (
          <div style={{
            borderRadius: 10,
            border: "0.5px solid var(--atlas-border)",
            background: "rgba(255,255,255,0.015)",
            overflow: "hidden",
          }}>
            <ViewChangesPanel
              projectId={meta.projectId}
              linkedRepo={null}
              messages={[] as never}
              pushHistory={[]}
              onRollbackPush={async () => {}}
              runId={meta.id}
              projectName={null}
              conversationId={null}
            />
          </div>
        )}

        {meta && meta.projectId == null && (
          <EmptyState label="This run has no associated project." />
        )}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{
      marginTop: 24,
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
