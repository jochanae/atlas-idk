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

    // Store the token as a bearer so cross-origin API calls work even when
    // the cookie set by /session/exchange isn't sent back to this origin.
    try {
      localStorage.setItem("atlas-token", exchangeTokenValue);
    } catch {
      // ignore storage failures
    }

    async function exchangeToken() {
      try {
        const res = await fetch(apiUrl(`/api/auth/session/exchange?token=${encodeURIComponent(exchangeTokenValue)}`), {
          credentials: "include",
        });
        // Even if the cookie can't be set cross-origin, the bearer token
        // we stored above is enough — proceed as long as the request didn't
        // outright fail.
        if (!cancelled && res.ok) {
          navigate("/home", { replace: true });
          return;
        }
      } catch {
        // Redirect below.
      }

      if (!cancelled) {
        // Bearer is stored; try /home anyway. useRequireAuth will bounce
        // back to landing if the token turns out to be invalid.
        navigate("/home", { replace: true });
      }
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
