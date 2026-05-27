import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect } from "react";
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

async function fetchMe(): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    if (/Auth session missing/i.test(error.message)) return null;
    throw error;
  }

  const user = data.user;
  if (!user) return null;

  const fullName = [
    user.user_metadata?.full_name,
    user.user_metadata?.name,
    user.user_metadata?.user_name,
  ].find((value) => typeof value === "string" && value.trim().length > 0) as string | undefined;

  const avatarUrl = [
    user.user_metadata?.avatar_url,
    user.user_metadata?.picture,
  ].find((value) => typeof value === "string" && value.trim().length > 0) as string | undefined;

  const providerList = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata.providers.map((provider) => String(provider).toLowerCase())
    : [];

  return {
    id: user.id,
    email: user.email ?? "",
    name: fullName ?? null,
    avatarUrl: avatarUrl ?? null,
    role: "user",
    subscriptionTier: "free",
    googleLinked: providerList.includes("google"),
    hasPassword: providerList.includes("email"),
  };
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
    await supabase.auth.signOut();
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
