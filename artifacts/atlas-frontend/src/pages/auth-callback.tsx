import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { setAuthToken } from "@/hooks/useAuth";

// OAuth providers redirect here with a bearer token after the backend sets the
// `atlas-session` cookie. Store the token so API calls can authenticate across
// origins, then continue to the app.
export default function AuthCallback() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) {
      setAuthToken(token);
      try {
        sessionStorage.setItem("atlas-just-authed", "1");
      } catch {
        // This flag only controls the welcome toast, so storage failures are non-blocking.
      }
      queryClient.removeQueries({ queryKey: ["auth", "me"] });
    }

    // Sign-in choreography:
    //  - First ever            → full activation (~3.6s)
    //  - Away 30+ days         → welcome-back (~1.4s, "Welcome back")
    //  - Recent return         → warm-boot pulse (~450ms)
    // A Settings "Replay activation" toggle clears atlas-activation-seen so
    // the next sign-in re-runs the full sequence.
    let mode: "full" | "welcome" | "warm" = "full";
    try {
      const seen = localStorage.getItem("atlas-activation-seen") === "1";
      const last = localStorage.getItem("atlas-last-sign-in");
      if (seen) {
        const lastMs = last ? Date.parse(last) : NaN;
        const away = Number.isFinite(lastMs) ? Date.now() - lastMs : 0;
        mode = away >= 30 * 24 * 60 * 60 * 1000 ? "welcome" : "warm";
      }
    } catch {}
    try { sessionStorage.setItem("atlas-activation-mode", mode); } catch {}
    navigate("/activate", { replace: true });
  }, [navigate, queryClient]);

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
