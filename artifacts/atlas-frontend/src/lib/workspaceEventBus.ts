import { useEffect } from "react";

type WorkspaceEventMap = {
  "lens-change": { lens: string };
  "tab-change": { tab: string };
  "mobile-tab-change": { tab: string };
  "flow-nodes": { nodes: unknown[] };
  "step-event": { verb: string; target?: string; status?: "ok" | "warn" | "fail" };
  "done-event": { content: string; [key: string]: unknown };
  "memory-chips": { chips: unknown[] };
  "preview-code": { code: string; path?: string };
  "auto-name": { key: number };
  "scenario-buffer": { text: string };
  /** Fired whenever an entry is created, updated, or changed status (commit/park/extract). */
  "entry-changed": { projectId: number };
  /** Fired when a chat run (classic or Nexus) transitions from pending to complete. */
  "run-completed": { projectId: number; messageId?: number | null };
};

type EventListener<T> = (data: T) => void;

class WorkspaceEventBus {
  private listeners: Map<string, Set<EventListener<unknown>>> = new Map();

  emit<K extends keyof WorkspaceEventMap>(event: K, data: WorkspaceEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try { fn(data as unknown); } catch { /* ignore listener errors */ }
    }
  }

  on<K extends keyof WorkspaceEventMap>(
    event: K,
    listener: EventListener<WorkspaceEventMap[K]>
  ): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener as EventListener<unknown>);
    return () => this.off(event, listener);
  }

  off<K extends keyof WorkspaceEventMap>(
    event: K,
    listener: EventListener<WorkspaceEventMap[K]>
  ): void {
    this.listeners.get(event)?.delete(listener as EventListener<unknown>);
  }
}

export const workspaceEventBus = new WorkspaceEventBus();

/**
 * React hook — subscribes to a workspaceEventBus event for the lifetime of the
 * component (or until deps change).  Callback is stable-ref'd so callers don't
 * need to memoize it themselves.
 *
 * @example
 *   useWorkspaceEvent("entry-changed", ({ projectId }) => {
 *     if (projectId === myProjectId) void queryClient.invalidateQueries(...);
 *   }, [myProjectId]);
 */
export function useWorkspaceEvent<K extends keyof WorkspaceEventMap>(
  event: K,
  callback: (data: WorkspaceEventMap[K]) => void,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deps: any[] = [],
): void {
  useEffect(() => {
    return workspaceEventBus.on(event, callback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ...deps]);
}
