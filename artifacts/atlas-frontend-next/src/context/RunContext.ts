import { createContext, useContext } from "react";
import type {
  Run,
  RunStep,
  RunChange,
  RunTerminalPage,
  RunArtifact,
  ConversationMessage,
  RunIntent,
} from "@contract";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

/**
 * Superset of the V1.2 RunContextValue used by both the live and mock
 * providers. Mock-only helpers are optional; live provider leaves them
 * undefined so surfaces can key off their presence.
 */
export interface PendingMessage {
  clientId: string;               // stable local id ("pending-…")
  idempotencyKey: string;
  content: string;
  status: "sending" | "accepted" | "error";
  error?: string;
  runId?: string;                 // filled after 202
  userMessageId?: string;         // filled after 202
}

export type SendMessageResult =
  | { ok: true; runId: string; userMessageId: string; intent: RunIntent | null; duplicate: boolean }
  | { ok: false; error: string; code?: string };

export interface RunContextValue {
  activeBuildRun: Run | null;
  activeTurn: Run | null;
  runs: Run[];
  messages: ConversationMessage[];
  messagesStatus: "loading" | "ready" | "error" | "idle";
  loadMoreMessages: () => Promise<void>;
  hasMoreMessages: boolean;

  /** Optimistic user messages awaiting server persistence. */
  pendingMessages: PendingMessage[];
  /** Composer entry point. Generates no ids itself — caller passes idempotencyKey. */
  sendMessage(content: string, idempotencyKey: string): Promise<SendMessageResult>;

  confirm(runId: string): Promise<void>;
  cancel(runId: string): Promise<void>;
  commit(runId: string, opts?: { fail?: boolean }): Promise<void>;

  fetchSteps(runId: string): Promise<RunStep[]>;
  fetchChanges(runId: string): Promise<RunChange[]>;
  fetchTerminal(runId: string, page: number): Promise<RunTerminalPage>;
  fetchOutputs(runId: string): Promise<RunArtifact[]>;

  connectionStatus: ConnectionStatus;

  /** Mock-only. Undefined in the live provider. */
  __setConnectionStatus?: (status: ConnectionStatus) => void;
  /** Mock-only. Undefined in the live provider. */
  __startMockRun?: (intent: RunIntent, story?: string) => string;
}

export const RunContext = createContext<RunContextValue | null>(null);

export function useRun(): RunContextValue {
  const ctx = useContext(RunContext);
  if (!ctx) throw new Error("useRun must be used within a RunProvider");
  return ctx;
}
