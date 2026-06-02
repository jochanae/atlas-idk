import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "user" | "admin" | "super_admin";
  subscriptionTier: string;
  googleLinked: boolean;
  hasPassword: boolean;
}

const STORED_AUTH_USER_KEY = "atlas-user";

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function readBoolean(record: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return null;
}

function toBackendAuthUser(payload: unknown): AuthUser | null {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  const source = root?.user && typeof root.user === "object" ? root.user as Record<string, unknown> : root;
  if (!source) return null;

  const id = readString(source, ["id", "userId", "sub"]);
  const email = readString(source, ["email"]);
  if (!id || !email) return null;

  const role = readString(source, ["role"]);
  return {
    id,
    email,
    name: readString(source, ["name", "displayName", "fullName"]) ?? null,
    avatarUrl: readString(source, ["avatarUrl", "avatar_url", "picture"]) ?? null,
    role: role === "admin" || role === "super_admin" ? role : "user",
    subscriptionTier: readString(source, ["subscriptionTier", "subscription_tier", "tier"]) ?? "free",
    googleLinked: readBoolean(source, ["googleLinked", "google_linked"]) ?? false,
    hasPassword: readBoolean(source, ["hasPassword", "has_password"]) ?? false,
  };
}

function readStoredAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORED_AUTH_USER_KEY);
    return raw ? toBackendAuthUser(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeStoredAuthUser(user: AuthUser) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORED_AUTH_USER_KEY, JSON.stringify(user));
  } catch {}
}

function removeStoredAuthUser() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORED_AUTH_USER_KEY);
  } catch {}
}

export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const response = await fetch(apiUrl("/api/auth/me"), {
      credentials: "include",
    });
    if (!response.ok) return readStoredAuthUser();
    const user = toBackendAuthUser(await response.json());
    if (user) {
      writeStoredAuthUser(user);
      return user;
    }
    return readStoredAuthUser();
  } catch {
    return readStoredAuthUser();
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
  const [settled, setSettled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (user) {
      setSettled(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    if (!isLoading && !settled) {
      timerRef.current = setTimeout(() => setSettled(true), 5000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [user, isLoading, settled]);

  useEffect(() => {
    if (settled && !isLoading && !user) navigate("/login");
  }, [settled, user, isLoading, navigate]);

  return { user, isLoading };
}

export function useLogout() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  return async () => {
    try {
      await fetch(apiUrl("/api/auth/logout"), {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    removeStoredAuthUser();
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
