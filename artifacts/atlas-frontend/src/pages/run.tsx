// /runs/:id — Run inspection surface (pass 1, frontend-only).
// Sourced from the in-memory ActiveRuns store via useRun(). When the backend
// persistence packet lands, swap useRun()'s source to a fetch.

import { useParams, useLocation } from "wouter";
import { useRun } from "@/features/runs/useRun";
import { RunHeader } from "@/features/runs/components/RunHeader";
import { RunTabs } from "@/features/runs/components/RunTabs";
import { ApplyErrorCard } from "@/features/runs/components/ApplyErrorCard";

export default function RunPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = params?.id;
  const run = useRun(id);

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--atlas-bg)",
      color: "var(--atlas-fg)",
      padding: "32px 20px 64px",
    }}>
      <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
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

        {!run ? (
          <EmptyState id={id} />
        ) : (
          <>
            <RunHeader run={run} />
            {run.applyError && (
              <ApplyErrorCard
                error={run.applyError}
                retryDisabled
                retryTitle="Retry coming in next pass"
              />
            )}
            <RunTabs run={run} />
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ id }: { id?: string }) {
  return (
    <div style={{
      marginTop: 64,
      padding: "32px 24px",
      borderRadius: 10,
      border: "0.5px dashed var(--atlas-border)",
      background: "transparent",
      textAlign: "center",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{
        fontFamily: "var(--app-font-mono)", fontSize: 9,
        letterSpacing: "0.22em", color: "var(--atlas-muted, rgba(255,255,255,0.45))",
      }}>
        RUN NOT AVAILABLE
      </div>
      <div style={{ fontSize: 15, color: "var(--atlas-fg)", letterSpacing: "0.01em" }}>
        Run {id ? <code style={{ fontFamily: "var(--app-font-mono)" }}>{id.slice(0, 8)}</code> : "this"} isn't in this session.
      </div>
      <div style={{
        fontSize: 12, color: "var(--atlas-muted, rgba(255,255,255,0.5))", lineHeight: 1.5,
      }}>
        Run records are in-memory for now. Persistence lands in the next pass.
      </div>
    </div>
  );
}
