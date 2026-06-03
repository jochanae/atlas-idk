import { useState, useEffect, useCallback } from "react";
import { getAuthHeaders } from "@/lib/api";

export type GitHubConnectionStatus = "connected" | "read-only" | "not-connected";

export type NormalizedGitHubStatus = {
  canRead: boolean;
  canWrite: boolean;
  hasServerToken: boolean;
  status: GitHubConnectionStatus;
  label: string;
  tokenHeader: string | null;
};

type GitHubState = {
  isConnected: boolean;
  canRead: boolean;
  canWrite: boolean;
  hasServerToken: boolean;
  status: GitHubConnectionStatus;
  statusLabel: string;
  tokenHeader: string | null;
  isLoading: boolean;
  error: string | null;
  connect: (token: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
};

const GITHUB_STATUS_ERROR = "Token saved but GitHub returned an error — check your token has repo access.";

const NOT_CONNECTED_STATUS: NormalizedGitHubStatus = {
  canRead: false,
  canWrite: false,
  hasServerToken: false,
  status: "not-connected",
  label: "Not connected",
  tokenHeader: null,
};

type GitHubStatusResponse = {
  canRead?: boolean | null;
  canWrite?: boolean | null;
  hasServerToken?: boolean | null;
};

function githubStatusUrl(projectId?: number | null): string {
  if (projectId == null) return "/api/github/status";
  return `/api/github/status?projectId=${encodeURIComponent(String(projectId))}`;
}

function normalizeGitHubStatus(data: GitHubStatusResponse): NormalizedGitHubStatus {
  const canRead = !!data.canRead;
  const canWrite = !!data.canWrite;
  const hasServerToken = !!data.hasServerToken;
  const status: GitHubConnectionStatus = canWrite
    ? "connected"
    : canRead && hasServerToken
      ? "read-only"
      : "not-connected";

  return {
    canRead,
    canWrite,
    hasServerToken,
    status,
    label: status === "connected"
      ? "GitHub connected"
      : status === "read-only"
        ? "Read-only (no personal token)"
        : "Not connected",
    tokenHeader: canWrite ? "__account__" : canRead && hasServerToken ? "__server__" : null,
  };
}

export async function fetchGitHubStatus(projectId?: number | null): Promise<NormalizedGitHubStatus> {
  const res = await fetch(githubStatusUrl(projectId), {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as GitHubStatusResponse;
  return normalizeGitHubStatus(data);
}

export function useGitHub(projectId?: number | null): GitHubState {
  const [githubStatus, setGithubStatus] = useState<NormalizedGitHubStatus>(NOT_CONNECTED_STATUS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setIsLoading(true);
    try {
      const status = await fetchGitHubStatus(projectId);
      setGithubStatus(status);
      setError(null);
    } catch {
      setGithubStatus(NOT_CONNECTED_STATUS);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void check(); }, [check]);

  const connect = useCallback(async (token: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        credentials: "include",
        body: JSON.stringify({
          type: "github",
          label: "GitHub",
          token: token.trim(),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const status = await fetchGitHubStatus(projectId);
      setGithubStatus(status);
      if (!status.canWrite) {
        setError(GITHUB_STATUS_ERROR);
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      return false;
    }
  }, [projectId]);

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/connections", {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      const connections = (Array.isArray(data) ? data : data?.connections ?? []) as Array<{ id: number; type?: string | null }>;
      const github = connections.find((c) => c.type === "github");
      if (!github) { await check(); return; }
      await fetch(`/api/connections/${github.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      await check();
    } catch {}
  }, [check]);

  return {
    isConnected: githubStatus.canWrite,
    canRead: githubStatus.canRead,
    canWrite: githubStatus.canWrite,
    hasServerToken: githubStatus.hasServerToken,
    status: githubStatus.status,
    statusLabel: githubStatus.label,
    tokenHeader: githubStatus.tokenHeader,
    isLoading,
    error,
    connect,
    disconnect,
  };
}
