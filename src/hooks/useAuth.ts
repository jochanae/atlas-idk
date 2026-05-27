import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { apiUrl, getAuthHeaders } from "@/lib/api";

export interface AuthUser {
  id: string | number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "user" | "admin" | "super_admin";
  subscriptionTier: string;
  googleLinked: boolean;
  hasPassword: boolean;
}

export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch(apiUrl("/api/auth/me"), {
      credentials: "include",
      headers: getAuthHeaders(),
    });

    if (res.status === 401) return null;
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return null;

    const data = await res.json() as Partial<AuthUser> | null;
    if (!data?.id || !data.email) return null;

    return {
      id: data.id,
      email: data.email,
      name: data.name ?? null,
      avatarUrl: data.avatarUrl ?? null,
      role: data.role === "admin" || data.role === "super_admin" ? data.role : "user",
      subscriptionTier: data.subscriptionTier ?? "free",
      googleLinked: Boolean(data.googleLinked),
      hasPassword: data.hasPassword !== false,
    };
  } catch {
    return null;
  }
}

export function useAuth() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  return { user: user ?? null, isLoading };
}

export function useRequireAuth() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [user, isLoading, navigate]);
  return { user, isLoading };
}

export function useLogout() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  return async () => {
    await fetch(apiUrl("/api/auth/logout"), { method: "POST", credentials: "include" }).catch(() => {});
    try {
      localStorage.removeItem("atlas-token");
    } catch {}
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
