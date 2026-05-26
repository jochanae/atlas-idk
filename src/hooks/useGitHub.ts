import { useState, useEffect, useCallback } from "react";
import { getAuthHeaders } from "@/lib/api";

type GitHubState = {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  connect: (token: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
};

export function useGitHub(): GitHubState {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/connections", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Array<{ type: string }>;
      const hasGitHub = data.some((c) => c.type === "github");
      setIsConnected(hasGitHub);
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
      setIsConnected(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      return false;
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      const res = await fetch("/api/connections", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json() as Array<{ id: number; type: string }>;
      const github = data.find((c) => c.type === "github");
      if (!github) { setIsConnected(false); return; }
      await fetch(`/api/connections/${github.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      setIsConnected(false);
    } catch {}
  }, []);

  return { isConnected, isLoading, error, connect, disconnect };
}
