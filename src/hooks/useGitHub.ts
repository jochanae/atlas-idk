import { useState, useEffect, useCallback } from "react";
import { getAuthHeaders } from "@/lib/api";

type GitHubState = {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  connect: (token: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
};

const GITHUB_STATUS_ERROR = "Token saved but GitHub returned an error — check your token has repo access.";

type ConnectionStatus = {
  type?: string | null;
  status?: string | null;
  state?: string | null;
};

function isFailedStatus(status: unknown): boolean {
  if (typeof status !== "string") return false;
  return ["failed", "error", "unauthorized", "invalid"].includes(status.toLowerCase());
}

function githubStatusFailed(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;

  const payload = data as {
    connections?: ConnectionStatus[];
    statuses?: Record<string, ConnectionStatus | string> | ConnectionStatus[];
    github?: ConnectionStatus | string;
  };

  const statuses: ConnectionStatus[] = [];
  if (Array.isArray(payload.connections)) {
    statuses.push(...payload.connections.filter((entry) => entry?.type === "github"));
  }
  if (Array.isArray(payload.statuses)) {
    statuses.push(...payload.statuses.filter((entry) => entry?.type === "github"));
  } else if (payload.statuses && typeof payload.statuses === "object") {
    for (const [key, value] of Object.entries(payload.statuses)) {
      if (typeof value === "string") {
        if (key === "github") statuses.push({ type: "github", status: value });
      } else if (key === "github" || value.type === "github") {
        statuses.push(value);
      }
    }
  }
  if (payload.github) {
    statuses.push(typeof payload.github === "string" ? { type: "github", status: payload.github } : payload.github);
  }

  return statuses.some((entry) => isFailedStatus(entry.status ?? entry.state));
}

async function verifyGithubStatus(): Promise<boolean> {
  const res = await fetch("/api/connections/status", {
    headers: getAuthHeaders(),
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return !githubStatusFailed(data);
}

export function useGitHub(): GitHubState {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/connections", {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const connections = (Array.isArray(data) ? data : data?.connections ?? []) as Array<{ type?: string | null }>;
      const hasGitHub = connections.some((c) => c.type === "github");
      if (!hasGitHub) {
        setIsConnected(false);
        return;
      }
      const statusOk = await verifyGithubStatus();
      setIsConnected(statusOk);
      setError(statusOk ? null : GITHUB_STATUS_ERROR);
    } catch {
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
      const statusOk = await verifyGithubStatus();
      if (!statusOk) {
        setIsConnected(false);
        setError(GITHUB_STATUS_ERROR);
        return false;
      }
      setIsConnected(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      return false;
    }
  }, []);

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
      if (!github) { setIsConnected(false); return; }
      await fetch(`/api/connections/${github.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      setIsConnected(false);
    } catch {}
  }, []);

  return { isConnected, isLoading, error, connect, disconnect };
}
