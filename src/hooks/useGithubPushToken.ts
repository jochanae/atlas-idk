import { useEffect, useState } from "react";

type AccountConnection = {
  type?: string | null;
  token?: string | null;
  accessToken?: string | null;
  githubToken?: string | null;
  meta?: {
    token?: string | null;
    accessToken?: string | null;
    githubToken?: string | null;
  } | null;
};

type AccountGithubTokenState =
  | { loaded: false }
  | { loaded: true; hasConnection: boolean; token: string | null };

function githubTokenFromConnection(connection: AccountConnection): string | null {
  return connection.token ?? connection.accessToken ?? connection.githubToken ??
    connection.meta?.token ?? connection.meta?.accessToken ?? connection.meta?.githubToken ?? null;
}

export function useGithubPushToken(projectToken?: string | null): string | null {
  const [accountTokenState, setAccountTokenState] = useState<AccountGithubTokenState>({ loaded: false });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/connections", { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (cancelled) return;
        const connections = (Array.isArray(data) ? data : data?.connections ?? []) as AccountConnection[];
        const githubConnection = connections.find((connection) => connection?.type === "github");
        setAccountTokenState({
          loaded: true,
          hasConnection: !!githubConnection,
          token: githubConnection ? githubTokenFromConnection(githubConnection) : null,
        });
      })
      .catch(() => {
        if (!cancelled) setAccountTokenState({ loaded: true, hasConnection: false, token: null });
      });
    return () => { cancelled = true; };
  }, []);

  if (!accountTokenState.loaded) return null;
  return accountTokenState.hasConnection ? accountTokenState.token : projectToken ?? null;
}
