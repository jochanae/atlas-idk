import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Atlas — Sign in" },
      {
        name: "description",
        content: "Sign in to Atlas — the decision enforcement system.",
      },
    ],
  }),
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error("Email and password required");
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Auth failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <FooterAuditLine />
      <header className="border-b border-border">
        <div className="max-w-[1400px] mx-auto px-6 py-5 flex items-center justify-between">
          <span className="font-semibold tracking-tight text-base">Atlas</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-xl font-semibold tracking-tight">
              {mode === "signin" ? "Welcome back." : "Create your account."}
            </h1>
            <p className="text-xs text-muted-foreground font-mono mt-2">
              {mode === "signin"
                ? "Pick up where the record left off."
                : "Begin the permanent record."}
            </p>
          </div>

          <OAuthButtons />

          <div className="my-5 flex items-center gap-3" aria-hidden>
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-muted-foreground/70">
              or
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                className="atlas-input"
                placeholder="you@domain.com"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="atlas-input"
                placeholder="••••••••"
              />
            </Field>
            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 px-4 py-2 text-xs font-medium uppercase tracking-[0.1em] bg-[color:var(--ember)] text-[color:var(--background)] rounded-sm hover:brightness-110 disabled:opacity-50 transition-all"
            >
              {submitting
                ? "Working…"
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          <div className="mt-5 text-center">
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-[11px] font-mono text-muted-foreground hover:text-foreground"
            >
              {mode === "signin"
                ? "No account? Create one →"
                : "← Back to sign in"}
            </button>
          </div>

        </div>
      </main>

      <style>{`
        .atlas-input {
          width: 100%;
          background: var(--background);
          color: var(--foreground);
          border: 1px solid var(--border);
          border-radius: 3px;
          padding: 9px 11px;
          font-size: 13px;
          outline: none;
          transition: border-color 120ms;
        }
        .atlas-input:focus { border-color: var(--ember); }
        .atlas-input::placeholder { color: var(--muted-text); }
      `}</style>
    </div>
  );
}

function OAuthButtons() {
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);

  const signIn = async (provider: "google" | "apple") => {
    setBusy(provider);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message || `${provider} sign-in failed`);
        setBusy(null);
        return;
      }
      if (result.redirected) return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      toast.error(msg);
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => signIn("google")}
        disabled={busy !== null}
        className="atlas-oauth-btn"
        aria-label="Continue with Google"
      >
        <GoogleMonoIcon />
        <span>{busy === "google" ? "Connecting…" : "Continue with Google"}</span>
      </button>
      <button
        type="button"
        onClick={() => signIn("apple")}
        disabled={busy !== null}
        className="atlas-oauth-btn"
        aria-label="Continue with Apple"
      >
        <AppleMonoIcon />
        <span>{busy === "apple" ? "Connecting…" : "Continue with Apple"}</span>
      </button>
      <style>{`
        .atlas-oauth-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 40px;
          padding: 9px 14px;
          background: #0B0B0D;
          color: color-mix(in oklab, white 92%, transparent);
          border: 1px solid color-mix(in oklab, var(--accent-gold) 22%, var(--border));
          border-radius: 4px;
          font-size: 12.5px;
          font-weight: 500;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: border-color 180ms var(--ease-cinematic),
                      background 180ms var(--ease-cinematic),
                      box-shadow 180ms var(--ease-cinematic),
                      transform 180ms var(--ease-cinematic);
        }
        .atlas-oauth-btn:hover:not(:disabled) {
          border-color: color-mix(in oklab, var(--accent-gold) 65%, var(--border));
          background: #111114;
          opacity: 0.8;
          box-shadow: 0 0 0 1px color-mix(in oklab, var(--accent-gold) 20%, transparent),
                      0 0 24px -4px color-mix(in oklab, var(--accent-gold) 45%, transparent),
                      0 6px 24px -10px color-mix(in oklab, var(--accent-gold) 35%, transparent);
          transform: translateY(-1px);
        }
        .atlas-oauth-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .atlas-oauth-btn svg { width: 16px; height: 16px; flex-shrink: 0; }
      `}</style>
    </div>
  );
}

function GoogleMonoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M21.6 12.227c0-.709-.064-1.39-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.995 3.018v2.51h3.227c1.886-1.737 2.986-4.295 2.986-7.351z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.964-.895 6.618-2.422l-3.227-2.51c-.895.6-2.04.955-3.391.955-2.605 0-4.81-1.76-5.6-4.124H3.064v2.59A9.996 9.996 0 0 0 12 22z"
      />
      <path
        fill="#FBBC05"
        d="M6.4 13.9a6.01 6.01 0 0 1 0-3.8V7.51H3.064a9.996 9.996 0 0 0 0 8.98L6.4 13.9z"
      />
      <path
        fill="#EA4335"
        d="M12 5.977c1.468 0 2.786.504 3.823 1.495l2.866-2.866C16.96 2.99 14.696 2 12 2 8.09 2 4.71 4.244 3.064 7.51L6.4 10.1c.79-2.364 2.995-4.123 5.6-4.123z"
      />
    </svg>
  );
}

function AppleMonoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.365 1.43c0 1.14-.413 2.226-1.238 3.06-.83.834-1.846 1.357-2.95 1.282-.083-1.084.42-2.215 1.176-2.99.86-.876 2.33-1.521 3.012-1.352zM20.5 17.36c-.554 1.28-.82 1.85-1.534 2.978-.998 1.578-2.405 3.544-4.146 3.56-1.546.014-1.943-.99-4.04-.978-2.097.011-2.534 1.008-4.082.99-1.74-.018-3.073-1.79-4.07-3.367-2.79-4.408-3.083-9.583-1.36-12.336.85-1.36 2.39-2.27 3.823-2.27 1.46 0 2.376.79 3.585.79 1.172 0 1.886-.79 3.575-.79 1.27 0 2.62.69 3.582 1.882-3.146 1.715-2.633 6.18.667 7.541z" />
    </svg>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-mono mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function FooterAuditLine() {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 h-[2px] z-50"
      style={{ background: "var(--phosphor)" }}
      aria-hidden
    />
  );
}
