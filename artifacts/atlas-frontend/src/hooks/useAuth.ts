import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect } from "react";

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "user" | "admin" | "super_admin";
  subscriptionTier: string;
  googleLinked: boolean;
  hasPassword: boolean;
}

export const AUTH_TOKEN_KEY = "atlas-auth-token";

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // Ignore storage failures; auth can still rely on cookies/query state.
  }
}

export function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", {
    credentials: "include",
    headers: { ...authHeaders() },
  });
  if (res.status === 401) {
    setAuthToken(null);
    return null;
  }
  if (!res.ok) throw new Error("Auth check failed");
  return res.json() as Promise<AuthUser>;
}

export function useAuth() {
  // Session freshness policy (attachment-pipeline audit):
  // - Do NOT refetch on window focus / reconnect: native file pickers blur the
  //   tab and would otherwise race auth/me → false "session expired" redirects.
  // - Do NOT use staleTime: Infinity + refetchOnMount: false: that permanently
  //   masks expired/revoked sessions until a hard reload.
  // - Keep a finite staleTime so remounts / route changes can revalidate.
  // - install-api-fetch still hard-redirects on confirmed API 401 + /auth/me 401.
  const { data: user, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMe,
    // A single transient failure must not null-out the session and bounce to
    // /login mid-compose (file-picker blur races were clearing the composer).
    retry: 1,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return { user: user ?? null, isLoading };
}

export function useRequireAuth() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!isLoading && !user) {
      try {
        // Dynamic import avoids circular deps with attachAudit at module init.
        void import("@/lib/attachAuditLog").then(({ attachAuditLog }) => {
          attachAuditLog(
            "router_navigation",
            { method: "useRequireAuth", to: "/login", reason: "no_user" },
            "global",
          );
        });
      } catch {
        /* ignore */
      }
      navigate("/login");
    }
  }, [user, isLoading, navigate]);
  return { user, isLoading };
}

export function useLogout() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  return async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    try {
      localStorage.removeItem("atlas-auth-token");
    } catch {
      // Continue logout even if storage is unavailable.
    }
    setAuthToken(null);
    queryClient.setQueryData(["auth", "me"], null);
    navigate("/login");
  };
}

export function isSuperAdmin(user: AuthUser | null) {
  return user?.role === "super_admin";
}

export function isAdmin(user: AuthUser | null) {
  return user?.role === "super_admin" || user?.role === "admin";
}
