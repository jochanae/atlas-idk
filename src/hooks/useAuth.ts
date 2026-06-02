import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { apiUrl, getAuthHeaders } from "@/lib/api";

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

function toAuthUser(u: User | null): AuthUser | null {
  if (!u || !u.email) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const identities = u.identities ?? [];
  const name =
    (meta.display_name as string | undefined) ??
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    null;
  const avatarUrl =
    (meta.avatar_url as string | undefined) ??
    (meta.picture as string | undefined) ??
    null;
  const appMeta = (u.app_metadata ?? {}) as Record<string, unknown>;
  const role = appMeta.role === "admin" || appMeta.role === "super_admin" ? appMeta.role : "user";
  return {
    id: u.id,
    email: u.email,
    name,
    avatarUrl,
    role,
    subscriptionTier: (appMeta.subscription_tier as string | undefined) ?? "free",
    googleLinked: identities.some((i) => i.provider === "google"),
    hasPassword: identities.some((i) => i.provider === "email"),
  };
}

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
    googleLinked: readBoolean(source, ["googleLinked", "google_linked"]) ?? true,
    hasPassword: readBoolean(source, ["hasPassword", "has_password"]) ?? false,
  };
}

async function fetchBackendMe(): Promise<AuthUser | null> {
  try {
    const response = await fetch(apiUrl("/api/auth/me"), {
      credentials: "include",
      headers: getAuthHeaders(),
    });
    if (response.status === 401 || response.status === 403 || response.status === 404) return null;
    if (!response.ok) return null;
    return toBackendAuthUser(await response.json());
  } catch {
    return null;
  }
}

export async function fetchMe(): Promise<AuthUser | null> {
  const backendUser = await fetchBackendMe();
  if (backendUser) return backendUser;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return toAuthUser(data.user);
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        queryClient.setQueryData(["auth", "me"], toAuthUser(session.user));
        return;
      }
      void fetchBackendMe().then((user) => {
        queryClient.setQueryData(["auth", "me"], user);
      });
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  return { user: user ?? null, isLoading };
}

export function useRequireAuth() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [settled, setSettled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (user) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setSettled(false);
    } else if (!settled && !timerRef.current) {
      timerRef.current = setTimeout(() => setSettled(true), 3000);
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
    await supabase.auth.signOut().catch(() => {});
    try { localStorage.removeItem("atlas-token"); } catch {}
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
