import { useRun } from "@/context/RunProvider";
import { PlanCard, ThinkingIndicator, StatusBadge } from "@/components/RunUi";
import { AtlasReceipt } from "@/components/AtlasReceipt";
import { RepositoryFeed } from "@/components/RepositoryFeed";
import { mockRepositoryEvents } from "@/mocks/mockActivity";
import { isTerminal } from "@contract";

/**
 * ChatSurface — reads only from RunContext.
 *
 * Two-layer activity model:
 *   Layer 1 — Atlas receipts: inline, one per terminal BUILD run. Rendered
 *             from run.summary + run.commit + fetched changes/artifacts.
 *             CHAT/DECIDE turns render prose (run.response), never a receipt.
 *   Layer 2 — Repository feed: quiet collapsible group of external repo
 *             activity. Events tied to an Atlas run's runId are filtered
 *             out — the receipt owns that story.
 *
 * The one-live-card rule still holds: exactly zero or one live BUILD card.
 */
export function ChatSurface() {
  const { activeBuildRun, activeTurn, runs, confirm, cancel, commit } = useRun();

  const terminalBuilds = runs.filter((r) => r.intent === "BUILD" && isTerminal(r.status));
  const chatTurns = runs.filter((r) => r.intent !== "BUILD" && isTerminal(r.status));

  const ownedRunIds = terminalBuilds.map((r) => r.id);
  // Phase 1: mock feed. Phase 2: hydrate from /api/nexus/activity via a
  // singleton hook in RunProvider so no surface adds its own fetch.
  const repoEvents = mockRepositoryEvents(terminalBuilds[0]?.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Terminal CHAT/DECIDE turns — prose only, no card */}
      {chatTurns.map((r) => (
        <div key={r.id} style={{ fontSize: 14, color: "var(--text)" }}>
          {r.response ?? <span style={{ color: "var(--muted)", fontStyle: "italic" }}>—</span>}
        </div>
      ))}

      {/* Terminal BUILD runs — one AtlasReceipt each */}
      {terminalBuilds.map((r) => (
        <AtlasReceipt
          key={r.id}
          run={r}
          // In Phase 2 these will be hydrated via fetchChanges / fetchOutputs
          // and cached on the run. For now we infer changesCount from stepsDone.
          changesCount={r.stepsDone}
          onCommit={() => commit(r.id)}
          onDetails={() => { /* switch to Changes tab */ }}
        />
      ))}

      {/* Quiet repository updates (Layer 2). Feed dedups against Atlas run IDs. */}
      <RepositoryFeed events={repoEvents} ownedRunIds={ownedRunIds} />

      {/* Active turn indicator (CHAT/DECIDE) */}
      {activeTurn && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusBadge status={activeTurn.status} />
          <ThinkingIndicator />
        </div>
      )}

      {/* Exactly one live BUILD card */}
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
