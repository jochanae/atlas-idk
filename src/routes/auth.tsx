import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
          <div className="flex items-baseline gap-3">
            <span className="font-semibold tracking-tight text-base">Atlas</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--ember)]">
              Decision Enforcement
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-xl font-semibold tracking-tight">
              {mode === "signin" ? "Sign in" : "Create account"}
            </h1>
            <p className="text-xs text-muted-foreground font-mono mt-2">
              The system remembers everything.
            </p>
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

          <div className="mt-10 text-center">
            <Link
              to="/ledger"
              className="text-[10px] uppercase tracking-[0.15em] font-mono text-muted-foreground/60 hover:text-muted-foreground"
            >
              View ledger overview
            </Link>
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
