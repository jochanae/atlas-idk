import { createFileRoute, Link } from "@tanstack/react-router";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { FooterAuditLine } from "@/components/atlas/FooterAuditLine";
import { relativeTime } from "@/lib/atlas";

export const Route = createFileRoute("/guard-report")({
  component: GuardReportPage,
  head: () => ({
    meta: [
      { title: "Atlas — Guard Report" },
      {
        name: "description",
        content: "Atlas Output Guard health report — violations, repairs, and system integrity.",
      },
    ],
  }),
});

type GuardMessage = {
  id: string;
  intent_type: string | null;
  output_guard_violation: string | null;
  output_guard_repaired: boolean;
  created_at: string;
  content: string;
};

function GuardReportPage() {
  const { user, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<GuardMessage[]>([]);
  const [allMessages, setAllMessages] = useState<GuardMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      // Fetch all assistant messages for stats
      const { data: all } = await supabase
        .from("chat_messages")
        .select("id, intent_type, output_guard_violation, output_guard_repaired, created_at, content")
        .eq("user_id", user.id)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(1000);
      const rows = (all ?? []) as GuardMessage[];
      setAllMessages(rows);
      // Filter to only violations
      setMessages(rows.filter((m) => m.output_guard_violation));
      setLoading(false);
    })();
  }, [user]);

  const stats = useMemo(() => {
    const total = allMessages.length;
    const violations = messages.length;
    const repaired = messages.filter((m) => m.output_guard_repaired).length;
    const unrepaired = violations - repaired;
    const repairRate = violations > 0 ? Math.round((repaired / violations) * 100) : 0;
    const healthRate = total > 0 ? Math.round(((total - unrepaired) / total) * 100) : 100;

    // By violation type
    const byType: Record<string, { count: number; repaired: number }> = {};
    for (const m of messages) {
      const t = m.output_guard_violation ?? "unknown";
      if (!byType[t]) byType[t] = { count: 0, repaired: 0 };
      byType[t].count++;
      if (m.output_guard_repaired) byType[t].repaired++;
    }

    // By intent
    const byIntent: Record<string, number> = {};
    for (const m of allMessages) {
      const i = m.intent_type ?? "unclassified";
      byIntent[i] = (byIntent[i] ?? 0) + 1;
    }

    return { total, violations, repaired, unrepaired, repairRate, healthRate, byType, byIntent };
  }, [messages, allMessages]);

  if (authLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <FooterAuditLine />

      {/* Header */}
      <header style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Link
            to="/"
            style={{
              fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "var(--muted-text)", textDecoration: "none",
            }}
          >
            ← Workspace
          </Link>
          <Link
            to="/ledger"
            style={{
              fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "var(--accent-gold)", textDecoration: "none",
            }}
          >
            Ledger →
          </Link>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>
          Guard Report
        </h1>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-text)", margin: "4px 0 0", letterSpacing: "0.06em" }}>
          System health · Output validation metrics
        </p>
      </header>

      {loading ? (
        <div style={{ padding: 80, display: "flex", justifyContent: "center" }}>
          <LoadingSpinner size="lg" text="Analyzing guard data…" />
        </div>
      ) : (
        <main style={{ padding: "16px 18px" }}>
          {/* ── Summary cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <StatCard label="Total Responses" value={stats.total} />
            <StatCard label="System Health" value={`${stats.healthRate}%`} accent={stats.healthRate >= 95 ? "var(--phosphor)" : stats.healthRate >= 80 ? "var(--accent-gold)" : "var(--ember)"} />
            <StatCard label="Violations" value={stats.violations} accent="var(--ember)" />
            <StatCard label="Auto-Repaired" value={`${stats.repaired} (${stats.repairRate}%)`} accent="var(--accent-gold)" />
          </div>

          {/* ── Violation breakdown ── */}
          {Object.keys(stats.byType).length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <SectionHeader>Violations by Type</SectionHeader>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(stats.byType)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([type, { count, repaired }]) => (
                    <div
                      key={type}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "8px 12px", borderRadius: 8,
                        background: "rgba(28, 25, 23, 0.55)", border: "1px solid var(--border)",
                      }}
                    >
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--foreground)" }}>
                        {type}
                      </span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ember)" }}>
                          {count}×
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent-gold)" }}>
                          {repaired} repaired
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* ── Intent distribution ── */}
          <section style={{ marginBottom: 24 }}>
            <SectionHeader>Intent Distribution</SectionHeader>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(stats.byIntent)
                .sort((a, b) => b[1] - a[1])
                .map(([intent, count]) => {
                  const color = intent === "BUILD" ? "#60a5fa" : intent === "DECIDE" ? "#fbbf24" : intent === "THINK" ? "#a78bfa" : "var(--muted-text)";
                  return (
                    <div
                      key={intent}
                      style={{
                        padding: "6px 12px", borderRadius: 8,
                        background: `color-mix(in oklab, ${color} 10%, transparent)`,
                        border: `1px solid color-mix(in oklab, ${color} 25%, transparent)`,
                        fontFamily: "var(--font-mono)", fontSize: 10,
                      }}
                    >
                      <span style={{ color, fontWeight: 600 }}>{intent}</span>
                      <span style={{ color: "var(--muted-text)", marginLeft: 6 }}>{count}</span>
                    </div>
                  );
                })}
            </div>
          </section>

          {/* ── Recent violations ── */}
          {messages.length > 0 && (
            <section>
              <SectionHeader>Recent Violations</SectionHeader>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {messages.slice(0, 20).map((m) => (
                  <div
                    key={m.id}
                    style={{
                      padding: "10px 12px", borderRadius: 8,
                      background: "rgba(28, 25, 23, 0.55)", border: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 9, padding: "1px 6px", borderRadius: 4,
                          background: m.output_guard_repaired ? "rgba(234,179,8,0.12)" : "rgba(239,68,68,0.12)",
                          color: m.output_guard_repaired ? "#fbbf24" : "#f87171",
                          border: `1px solid ${m.output_guard_repaired ? "rgba(234,179,8,0.2)" : "rgba(239,68,68,0.2)"}`,
                        }}>
                          {m.output_guard_repaired ? "🔧 repaired" : "⚠ failed"}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ember)" }}>
                          {m.output_guard_violation}
                        </span>
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--muted-text)" }}>
                        {relativeTime(m.created_at)}
                      </span>
                    </div>
                    <p style={{
                      fontSize: 11, lineHeight: 1.5,
                      color: "color-mix(in oklab, var(--foreground) 60%, transparent)",
                      margin: 0, overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {m.content.slice(0, 120)}…
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {stats.violations === 0 && (
            <div style={{ padding: "60px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--phosphor)" }}>
                No guard violations recorded. System operating at full integrity.
              </p>
            </div>
          )}
        </main>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div
      style={{
        padding: "14px 14px", borderRadius: 10,
        background: "rgba(28, 25, 23, 0.55)", border: "1px solid var(--border)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: accent ?? "var(--foreground)", letterSpacing: "-0.02em" }}>
        {value}
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
        textTransform: "uppercase", color: "var(--accent-gold)", fontWeight: 600,
        margin: "0 0 10px",
      }}
    >
      {children}
    </h2>
  );
}
