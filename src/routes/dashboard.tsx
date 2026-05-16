import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardStats } from "@/lib/railway.functions";

export const Route = createFileRoute("/dashboard")({ component: DashboardPage });

function DashboardPage() {
  const fetchStats = useServerFn(getDashboardStats);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchStats();
        if (!cancelled) { setStats(data); setLoading(false); }
      } catch (e: any) {
        if (!cancelled) { setError(e?.message ?? "Failed to load"); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [fetchStats]);

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Home</Link>
        </div>

        {loading && <div className="text-muted-foreground text-sm">Loading stats…</div>}
        {error && <div className="text-destructive text-sm">Error: {error}</div>}
        {stats && (
          <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto">
            {JSON.stringify(stats, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
