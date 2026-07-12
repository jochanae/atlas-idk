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
export interface RunContextValue {
  activeBuildRun: Run | null;
  activeTurn: Run | null;
  runs: Run[];
  messages: ConversationMessage[];
  messagesStatus: "loading" | "ready" | "error" | "idle";
  loadMoreMessages: () => Promise<void>;
  hasMoreMessages: boolean;

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
