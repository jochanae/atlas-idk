import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { FooterAuditLine } from "@/components/atlas/FooterAuditLine";
import { AtlasNav } from "@/components/atlas/AtlasNav";

export const Route = createFileRoute("/think-freely")({
  component: ThinkFreelyPage,
  head: () => ({
    meta: [
      { title: "Atlas — Think Freely" },
      {
        name: "description",
        content: "An off-the-record scratch surface. Nothing here is committed to the ledger.",
      },
    ],
  }),
});

function ThinkFreelyPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="font-mono text-xs text-muted-foreground">loading…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <FooterAuditLine state="healthy" />
      <AtlasNav />
      <header className="flex items-center justify-between px-5 py-3 md:pl-20">
        <Link
          to="/"
          className="text-[18px] font-medium tracking-[0.08em] text-foreground"
        >
          Atlas
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          Think Freely
        </span>
      </header>

      <main className="px-5 pt-12 pb-32 md:pl-20 max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-[24px] font-normal text-foreground tracking-tight mb-2">
            Off the record.
          </h1>
          <p className="font-mono text-[11px] tracking-[0.06em] text-[#57524E]">
            nothing here commits to the ledger
          </p>
        </div>

        <textarea
          placeholder="think out loud. drafts, doubts, half-thoughts…"
          className="w-full min-h-[60vh] bg-[#1C1917] border border-[#2C2926] rounded-lg p-4 text-[15px] leading-relaxed text-foreground placeholder:text-[#57524E] focus:outline-none focus:border-[#3C3530] resize-none font-sans"
        />
        <div className="flex justify-end mt-2">
          <span className="font-mono text-[10px] text-[#3C3530] tracking-[0.06em]">
            local only · not saved
          </span>
        </div>
      </main>
    </div>
  );
}
