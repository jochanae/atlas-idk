import type { Run, RunStatus } from "@contract";
import { isTerminal } from "@contract";

const LABEL: Record<RunStatus, string> = {
  received: "Received",
  thinking: "Thinking",
  planning: "Planning",
  awaiting_confirmation: "Awaiting confirmation",
  executing: "Executing",
  testing: "Testing",
  verifying: "Verifying",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

const COLOR: Record<RunStatus, string> = {
  received: "var(--muted)",
  thinking: "var(--muted)",
  planning: "var(--run)",
  awaiting_confirmation: "var(--warn)",
  executing: "var(--run)",
  testing: "var(--run)",
  verifying: "var(--run)",
  succeeded: "var(--ok)",
  failed: "var(--fail)",
  cancelled: "var(--muted)",
};

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        color: COLOR[status],
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--border)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: COLOR[status],
          boxShadow: isTerminal(status) ? "none" : `0 0 6px ${COLOR[status]}`,
        }}
      />
      {LABEL[status]}
    </span>
  );
}

export function ThinkingIndicator() {
  return (
    <div style={{ color: "var(--muted)", fontStyle: "italic", padding: "8px 0" }}>
      Atlas is thinking<span className="dots">…</span>
    </div>
  );
}

interface PlanCardProps {
  run: Run;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PlanCard({ run, onConfirm, onCancel }: PlanCardProps) {
  const plan = run.plan;
  const isAwaiting = run.status === "awaiting_confirmation";
  const isExecuting = ["executing", "testing", "verifying"].includes(run.status);
  const isTerminalStatus = isTerminal(run.status);

  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 16,
        maxWidth: 560,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>{plan?.title ?? "Build"}</div>
        <StatusBadge status={run.status} />
      </div>

      {plan?.rationale && (
        <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 12px" }}>{plan.rationale}</p>
      )}

      {plan?.items?.length ? (
        <ol style={{ margin: "0 0 12px", paddingLeft: 20 }}>
          {plan.items.map((item) => (
            <li key={item.seq} style={{ fontSize: 14, marginBottom: 6, color: "var(--text)" }}>
              <span style={{ fontFamily: "ui-monospace, monospace", color: "var(--accent)" }}>{item.file}</span>
              <span style={{ color: "var(--muted)" }}> — {item.description}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {isExecuting && (
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
          Step {Math.max(1, run.stepsDone)} of {run.stepCount || plan?.items.length || 1}
        </div>
      )}

      {isAwaiting && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              background: "transparent",
              color: "var(--text)",
              border: "1px solid var(--border)",
              padding: "8px 14px",
              borderRadius: 8,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              background: "var(--accent)",
              color: "#0b0d10",
              border: "none",
              padding: "8px 14px",
              borderRadius: 8,
              fontWeight: 600,
            }}
          >
            Apply changes
          </button>
        </div>
      )}

      {isTerminalStatus && run.error && (
        <div style={{ marginTop: 8, padding: 10, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, fontSize: 13 }}>
          <div style={{ color: "var(--fail)", fontWeight: 600, marginBottom: 4 }}>{run.error.code}</div>
          <div style={{ color: "var(--text)" }}>{run.error.message}</div>
          {run.error.partialWritesOccurred && (
            <div style={{ color: "var(--muted)", marginTop: 6, fontSize: 12 }}>
              Some files may have been partially updated. Review the Changes tab.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ReceiptChipProps {
  run: Run;
  onCommit?: () => void;
}

export function ReceiptChip({ run, onCommit }: ReceiptChipProps) {
  const showCommit =
    run.status === "succeeded" &&
    run.intent === "BUILD" &&
    (run.commit == null || run.commit.status === "not_requested");
  const committing = run.commit?.status === "running";
  const committed = run.commit?.status === "succeeded";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: 999,
        fontSize: 13,
        maxWidth: "fit-content",
      }}
    >
      <StatusBadge status={run.status} />
      <span style={{ color: "var(--muted)" }}>{run.summary ?? "Run complete"}</span>
      {committed && (
        <a
          href={run.commit?.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--accent)", textDecoration: "none", fontSize: 12 }}
        >
          {run.commit?.sha?.slice(0, 7)}
        </a>
      )}
      {showCommit && onCommit && (
        <button
          onClick={onCommit}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--accent)",
            borderRadius: 999,
            padding: "2px 10px",
            fontSize: 12,
          }}
        >
          Commit to GitHub
        </button>
      )}
      {committing && <span style={{ color: "var(--muted)", fontSize: 12 }}>Committing…</span>}
    </div>
  );
}
