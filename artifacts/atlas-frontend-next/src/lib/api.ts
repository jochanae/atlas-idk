/**
 * Live REST client for the V1.2 Run Lifecycle Contract.
 *
 * All endpoints from docs/RUN_LIFECYCLE_CONTRACT.md §8 plus the paginated
 * conversation history endpoint from the foundational rule.
 *
 * Base URL:
 *   VITE_API_URL (build-time env), else same-origin.
 *
 * Auth: cookie-based session (credentials: "include").
 */
import type {
  Run,
  RunStep,
  RunChange,
  RunTerminalPage,
  RunArtifact,
  ConfirmResponse,
  CancelResponse,
  CommitResponse,
  ConversationPage,
  RunApiError,
} from "@contract";

const RAW_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
export const API_BASE = RAW_BASE.replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export class ApiError extends Error {
  status: number;
  body: RunApiError | { error: string } | null;
  constructor(status: number, body: RunApiError | { error: string } | null, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch { /* ignore */ }
    const msg = body?.message ?? body?.error ?? `HTTP ${res.status} ${path}`;
    throw new ApiError(res.status, body, msg);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export function listRuns(conversationId: string, projectId?: number): Promise<Run[]> {
  const p = new URLSearchParams({ conversationId });
  if (projectId != null) p.set("projectId", String(projectId));
  return req<Run[]>(`/api/runs?${p.toString()}`);
}

export function getRun(runId: string): Promise<Run> {
  return req<Run>(`/api/runs/${runId}`);
}

export function getSteps(runId: string): Promise<RunStep[]> {
  return req<RunStep[]>(`/api/runs/${runId}/steps`);
}

export function getChanges(runId: string): Promise<RunChange[]> {
  return req<RunChange[]>(`/api/runs/${runId}/changes`);
}

export function getTerminal(runId: string, page = 1, pageSize = 100): Promise<RunTerminalPage> {
  const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return req<RunTerminalPage>(`/api/runs/${runId}/terminal?${p.toString()}`);
}

export function getOutputs(runId: string): Promise<RunArtifact[]> {
  return req<RunArtifact[]>(`/api/runs/${runId}/outputs`);
}

export function confirmRun(runId: string): Promise<ConfirmResponse> {
  return req<ConfirmResponse>(`/api/runs/${runId}/confirm`, { method: "POST" });
}

export function cancelRun(runId: string): Promise<CancelResponse> {
  return req<CancelResponse>(`/api/runs/${runId}/cancel`, { method: "POST" });
}

export function commitRun(runId: string): Promise<CommitResponse> {
  return req<CommitResponse>(`/api/runs/${runId}/commit`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Conversation history
// ---------------------------------------------------------------------------

export function listMessages(
  conversationId: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<ConversationPage> {
  const p = new URLSearchParams();
  if (opts.cursor) p.set("cursor", opts.cursor);
  if (opts.limit) p.set("limit", String(opts.limit));
  const qs = p.toString();
  return req<ConversationPage>(
    `/api/conversations/${conversationId}/messages${qs ? `?${qs}` : ""}`,
  );
}

// ---------------------------------------------------------------------------
// Repository quiet updates
// ---------------------------------------------------------------------------
// Mirrors the legacy /api/nexus/activity payload the RepositoryFeed already
// consumes shape-wise. Kept here so a Phase-2 endpoint rename is a one-line
// change.

export function listRepositoryActivity(conversationId?: string): Promise<unknown[]> {
  const p = new URLSearchParams();
  if (conversationId) p.set("conversationId", conversationId);
  const qs = p.toString();
  return req<unknown[]>(`/api/nexus/activity${qs ? `?${qs}` : ""}`);
}
