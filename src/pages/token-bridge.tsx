import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

const SESSION_TOKEN_STORAGE_KEY = "atlas-token";

export default function TokenBridge() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      navigate("/login?reason=missing_token", { replace: true });
      return;
    }

    try {
      localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
    } catch {
      navigate("/login?reason=token_storage_failed", { replace: true });
      return;
    }

    try { sessionStorage.setItem("atlas-just-authed", "1"); } catch {}
    queryClient.removeQueries({ queryKey: ["auth", "me"] });
    navigate("/home", { replace: true });
  }, [navigate, queryClient]);

  return (
    <div style={{
      minHeight: "100dvh", width: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 16,
      background: "var(--atlas-bg)", color: "var(--atlas-fg)",
    }}>
      <LoadingSpinner size="md" />
      <p style={{
        margin: 0, color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)",
        fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase",
      }}>
        Signing you in
      </p>
    </div>
  );
}
