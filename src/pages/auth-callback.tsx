import { useEffect } from "react";
import { useLocation } from "wouter";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

// OAuth providers redirect back to the backend, which sets the `atlas-session`
// cookie and bounces the browser to /home. This page is kept as a thin
// fallback redirect for any stale links.
export default function AuthCallback() {
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate("/home", { replace: true });
  }, [navigate]);

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
