import { useRun } from "@/context/RunProvider";
import type { PendingMessage } from "@/context/RunContext";
import { PlanCard, ThinkingIndicator, StatusBadge } from "@/components/RunUi";
import { AtlasReceipt } from "@/components/AtlasReceipt";
import { RepositoryFeed } from "@/components/RepositoryFeed";
import { Composer } from "@/components/Composer";
import { useRunHydration } from "@/hooks/useRunHydration";
import { useRepositoryEvents } from "@/hooks/useRepositoryEvents";
import { isTerminal, type Run, type ConversationMessage } from "@contract";

/**
 * ChatSurface — reads only from RunContext + hydration hooks.
 *
 * Renders (in order):
 *   1. Historical conversation messages (paginated via provider).
 *   2. Atlas receipts for terminal BUILD runs.
 *   3. Quiet repository-activity feed.
 *   4. Active-turn indicator (CHAT/DECIDE thinking).
 *   5. Active BUILD plan card / execution card.
 */
export function ChatSurface({
  conversationId,
  useMockActivity = false,
  showComposer = true,
}: {
  conversationId: string;
  useMockActivity?: boolean;
  showComposer?: boolean;
}) {
  const {
    activeBuildRun, activeTurn, runs,
    confirm, cancel, commit,
    connectionStatus,
    messages, messagesStatus, hasMoreMessages, loadMoreMessages,
    pendingMessages,
  } = useRun();
  const disconnected = connectionStatus === "disconnected";

  const terminalBuilds = runs.filter((r) => r.intent === "BUILD" && isTerminal(r.status));
  const ownedRunIds = terminalBuilds.map((r) => r.id);
  const feed = useRepositoryEvents({
    conversationId,
    useMockData: useMockActivity,
    ownedRunId: terminalBuilds[0]?.id,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0, overflow: "auto" }}>
        {hasMoreMessages && (
          <button
            onClick={loadMoreMessages}
            disabled={messagesStatus === "loading"}
            style={{
              alignSelf: "center", fontSize: 12, color: "var(--muted)",
              background: "transparent", border: "1px solid var(--border)",
              padding: "4px 10px", borderRadius: 999,
            }}
          >
            {messagesStatus === "loading" ? "Loading…" : "Load earlier messages"}
          </button>
        )}
        {messagesStatus === "error" && (
          <div style={{ color: "var(--fail)", fontSize: 12 }}>Couldn't load conversation history.</div>
        )}

        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}

        {pendingMessages.map((p) => (
          <PendingMessageRow key={p.clientId} pending={p} />
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
          (activeBuildRun.status === "received" || activeBuildRun.status === "thinking" || activeBuildRun.status === "planning") && !activeBuildRun.plan ? (
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
          )
        )}

        {!activeBuildRun && !activeTurn && runs.length === 0 && messages.length === 0 && pendingMessages.length === 0 && messagesStatus === "ready" && (
          <div style={{ color: "var(--muted)", fontStyle: "italic" }}>
            No conversation history yet.
          </div>
        )}
      </div>
      {showComposer && <Composer />}
    </div>
  );
}

function PendingMessageRow({ pending }: { pending: PendingMessage }) {
  return (
    <div
      style={{
        alignSelf: "flex-end",
        maxWidth: "82%",
        padding: "8px 12px",
        borderRadius: 12,
        background: "var(--panel-2)",
        border: "1px dashed var(--border)",
        fontSize: 14,
        color: "var(--text)",
        whiteSpace: "pre-wrap",
        opacity: pending.status === "error" ? 0.7 : 0.85,
      }}
      aria-live="polite"
    >
      {pending.content}
      <div style={{ marginTop: 4, fontSize: 11, color: pending.status === "error" ? "var(--fail)" : "var(--muted)" }}>
        {pending.status === "sending" && "Sending…"}
        {pending.status === "accepted" && "Accepted · syncing…"}
        {pending.status === "error" && `Failed: ${pending.error ?? "unknown error"}`}
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: ConversationMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "82%",
        padding: isUser ? "8px 12px" : 0,
        borderRadius: isUser ? 12 : 0,
        background: isUser ? "var(--panel-2)" : "transparent",
        border: isUser ? "1px solid var(--border)" : "none",
        fontSize: 14,
        color: "var(--text)",
        whiteSpace: "pre-wrap",
      }}
    >
      {message.content}
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
