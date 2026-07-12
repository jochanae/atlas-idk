import { useRun } from "@/context/RunProvider";
import { StatusBadge } from "@/components/RunUi";

/** Timeline — every run (all intents), newest first. Metadata only. */
export function TimelineSurface() {
  const { runs } = useRun();
  if (!runs.length) return <Empty label="No runs yet." />;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {runs.map((r) => (
        <li
          key={r.id}
          style={{
            display: "grid",
            gridTemplateColumns: "80px 1fr auto",
            gap: 12,
            padding: "10px 4px",
            borderBottom: "1px solid var(--border)",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>{r.intent}</span>
          <span style={{ fontSize: 14 }}>{r.summary ?? r.plan?.title ?? "(no summary yet)"}</span>
          <StatusBadge status={r.status} />
        </li>
      ))}
    </ul>
  );
}

/** Changes — file-level view of the active or most recent BUILD run. */
export function ChangesSurface() {
  const { activeBuildRun, runs } = useRun();
  const run = activeBuildRun ?? runs.find((r) => r.intent === "BUILD") ?? null;
  if (!run) return <Empty label="No BUILD run to show changes for." />;
  const items = run.plan?.items ?? [];
  if (!items.length) return <Empty label="This run has no file plan." />;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {items.map((it) => (
        <li key={it.seq} style={{ padding: "8px 4px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "var(--accent)" }}>{it.filePath}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{it.description}</div>
        </li>
      ))}
    </ul>
  );
}

/** Terminal — placeholder (Phase 2 hooks to /runs/:id/terminal). */
export function TerminalSurface() {
  const { activeBuildRun } = useRun();
  if (!activeBuildRun) return <Empty label="No active build — terminal is quiet." />;
  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        background: "#000",
        color: "#c8d3e0",
        fontSize: 12,
        borderRadius: 8,
        maxHeight: 320,
        overflow: "auto",
      }}
    >
{`$ atlas run ${activeBuildRun.id.slice(0, 8)}
[planning] ${activeBuildRun.plan?.title ?? ""}
[executing] step ${Math.max(1, activeBuildRun.stepsDone)} of ${activeBuildRun.stepCount || activeBuildRun.plan?.items.length || 1}
${activeBuildRun.status === "succeeded" ? "✓ done" : ""}`}
    </pre>
  );
}

/** Outputs — placeholder. */
export function OutputsSurface() {
  const { runs } = useRun();
  const withOutputs = runs.filter((r) => r.status === "succeeded");
  if (!withOutputs.length) return <Empty label="No completed runs yet." />;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {withOutputs.map((r) => (
        <li key={r.id} style={{ padding: "8px 4px", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
          {r.summary ?? "Run complete"} <span style={{ color: "var(--muted)" }}>({r.plan?.estimatedChanges ?? 0} files)</span>
        </li>
      ))}
    </ul>
  );
}

function Empty({ label }: { label: string }) {
  return <div style={{ padding: 24, color: "var(--muted)", fontStyle: "italic", textAlign: "center" }}>{label}</div>;
}
