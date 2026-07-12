import { useRun } from "@/context/RunProvider";
import { PlanCard, ReceiptChip, ThinkingIndicator, StatusBadge } from "@/components/RunUi";
import { isTerminal } from "@contract";

/**
 * ChatSurface — reads only from RunContext.
 *
 * Rendering rules (from RUN_LIFECYCLE_CONTRACT.md v1.2 §7 + The One Live Card Rule):
 *   - CHAT/DECIDE turns: no execution card. Thinking indicator while active.
 *   - BUILD run in [thinking/planning]: compact thinking indicator only.
 *   - BUILD run in awaiting_confirmation: PlanCard with Apply/Cancel.
 *   - BUILD run in executing/testing/verifying: PlanCard with progress.
 *   - BUILD run in terminal state: ReceiptChip (with Commit if succeeded).
 *   - Zero BUILD cards when no active BUILD run.
 */
export function ChatSurface() {
  const { activeBuildRun, activeTurn, runs, confirm, cancel, commit } = useRun();

  const buildReceipts = runs.filter((r) => r.intent === "BUILD" && isTerminal(r.status));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Historical receipts (BUILD only — CHAT/DECIDE resolve into normal messages) */}
      {buildReceipts.map((r) => (
        <ReceiptChip key={r.id} run={r} onCommit={() => commit(r.id)} />
      ))}

      {/* Active turn indicator (CHAT/DECIDE) */}
      {activeTurn && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusBadge status={activeTurn.status} />
          <ThinkingIndicator />
        </div>
      )}

      {/* Exactly one live BUILD card, ever */}
      {activeBuildRun && (
        <>
          {(activeBuildRun.status === "received" || activeBuildRun.status === "thinking" || activeBuildRun.status === "planning") && !activeBuildRun.plan ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StatusBadge status={activeBuildRun.status} />
              <ThinkingIndicator />
            </div>
          ) : (
            <PlanCard
              run={activeBuildRun}
              onConfirm={() => confirm(activeBuildRun.id)}
              onCancel={() => cancel(activeBuildRun.id)}
            />
          )}
        </>
      )}

      {!activeBuildRun && !activeTurn && runs.length === 0 && (
        <div style={{ color: "var(--muted)", fontStyle: "italic" }}>
          No runs yet — start a mock lifecycle from the panel on the right.
        </div>
      )}
    </div>
  );
}
