import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useEffect } from "react";
import { FooterAuditLine } from "@/components/atlas/FooterAuditLine";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/think-freely")({
  component: ThinkFreelyPage,
  head: () => ({
    meta: [
      { title: "Atlas — Think Freely" },
      {
        name: "description",
        content: "Atlas Think Freely workspace.",
      },
    ],
  }),
});

function ThinkFreelyPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, navigate, user]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <FooterAuditLine />
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Atlas
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Think Freely</h1>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">
          This surface is available again. Return to the workspace to continue.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center justify-center rounded-sm border border-border px-4 py-2 text-xs font-mono uppercase tracking-[0.1em] text-foreground transition-colors hover:bg-accent"
        >
          Back to workspace
        </Link>
      </main>
    </div>
  );
}