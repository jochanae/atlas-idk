import { useEffect } from "react";
import { useLocation } from "wouter";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { supabase } from "@/integrations/supabase/client";

// Supabase OAuth lands back on window.location.origin and the SDK hydrates the
// session automatically. This page is kept as a thin redirect so any stale
// links to /auth/callback still land somewhere sensible.
export default function AuthCallback() {
  const [, navigate] = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Give the SDK a tick to process any hash/code in the URL.
      await supabase.auth.getSession().catch(() => null);
      if (!cancelled) navigate("/home", { replace: true });
    })();
    return () => { cancelled = true; };
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
