import { useEffect } from "react";
import { useLocation } from "wouter";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { apiUrl } from "@/lib/api";

export default function AuthCallback() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const redirectFailed = () => {
      navigate("/?auth_error=callback_failed", { replace: true });
    };

    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      redirectFailed();
      return;
    }

    const exchangeTokenValue = token;
    let cancelled = false;

    async function exchangeToken() {
      try {
        const res = await fetch(apiUrl(`/api/auth/session/exchange?token=${encodeURIComponent(exchangeTokenValue)}`), {
          credentials: "include",
        });
        const data = await res.json() as { ok?: boolean };

        if (!cancelled && res.ok && data.ok === true) {
          navigate("/home", { replace: true });
          return;
        }
      } catch {
        // Redirect below.
      }

      if (!cancelled) redirectFailed();
    }

    void exchangeToken();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        background: "var(--atlas-bg)",
        color: "var(--atlas-fg)",
      }}
    >
      <LoadingSpinner size="md" />
      <p
        style={{
          margin: 0,
          color: "var(--atlas-muted)",
          fontFamily: "var(--app-font-mono)",
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
        }}
      >
        Signing you in
      </p>
    </div>
  );
}
