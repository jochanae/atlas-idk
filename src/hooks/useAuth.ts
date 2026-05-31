import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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

export async function fetchMe(): Promise<AuthUser | null> {
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
      queryClient.setQueryData(["auth", "me"], toAuthUser(session?.user ?? null));
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

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
