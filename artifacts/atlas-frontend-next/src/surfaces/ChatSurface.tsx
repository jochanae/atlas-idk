import { useRun } from "@/context/RunProvider";
import { PlanCard, ThinkingIndicator, StatusBadge } from "@/components/RunUi";
import { AtlasReceipt } from "@/components/AtlasReceipt";
import { RepositoryFeed } from "@/components/RepositoryFeed";
import { useRunHydration } from "@/hooks/useRunHydration";
import { useRepositoryEvents } from "@/hooks/useRepositoryEvents";
import { isTerminal, type Run } from "@contract";

/**
 * ChatSurface — reads only from RunContext + hydration hooks.
 *
 * Two-layer activity model:
 *   Layer 1 — Atlas receipts: inline, one per terminal BUILD run. Data
 *             hydrated via useRunHydration; loading/error/empty/disconnected
 *             states rendered by the receipt itself.
 *   Layer 2 — Repository feed: quiet collapsible group of external activity.
 *             Events tied to an Atlas run's runId are filtered out.
 */
export function ChatSurface() {
  const { activeBuildRun, activeTurn, runs, confirm, cancel, commit, connectionStatus } = useRun();
  const disconnected = connectionStatus === "disconnected";

  const terminalBuilds = runs.filter((r) => r.intent === "BUILD" && isTerminal(r.status));
  const chatTurns = runs.filter((r) => r.intent !== "BUILD" && isTerminal(r.status));
  const ownedRunIds = terminalBuilds.map((r) => r.id);
  const feed = useRepositoryEvents({ ownedRunId: terminalBuilds[0]?.id });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {chatTurns.map((r) => (
        <div key={r.id} style={{ fontSize: 14, color: "var(--text)" }}>
          {r.response ?? <span style={{ color: "var(--muted)", fontStyle: "italic" }}>—</span>}
        </div>
      ))}

      {terminalBuilds.map((r) => (
        <ReceiptRow key={r.id} run={r} disconnected={disconnected} onCommit={() => commit(r.id)} />
      ))}

      <RepositoryFeed
        events={feed.data}
        ownedRunIds={ownedRunIds}
        state={feed.status}
        onRetry={feed.reload}
      />

      {activeTurn && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusBadge status={activeTurn.status} />
          <ThinkingIndicator />
        </div>
      )}

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

function ReceiptRow({ run, disconnected, onCommit }: { run: Run; disconnected: boolean; onCommit: () => void }) {
  const hydration = useRunHydration(run.id, run.status === "succeeded" || run.status === "failed");
  return (
    <AtlasReceipt
      run={run}
      hydration={{ changes: hydration.changes, outputs: hydration.outputs }}
      disconnected={disconnected}
      onCommit={onCommit}
    />
  );
}
