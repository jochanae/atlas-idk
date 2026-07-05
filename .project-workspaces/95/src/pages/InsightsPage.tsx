import { useFunnelStore } from '../hooks/useFunnelStore';

export default function InsightsPage() {
  const { funnels } = useFunnelStore();

  const active = funnels.filter((f) => !f.archived);
  const totalLeads = active.reduce((sum, f) => sum + (f.metrics?.leads ?? 0), 0);
  const avgConversion = active.length
    ? Math.round(active.reduce((sum, f) => sum + (f.metrics?.conversionRate ?? 0), 0) / active.length)
    : 0;
  const topFunnel = active.sort((a, b) => (b.metrics?.leads ?? 0) - (a.metrics?.leads ?? 0))[0];

  const statCards = [
    { label: 'Total Leads', value: totalLeads.toLocaleString(), sub: 'across all funnels' },
    { label: 'Avg Conversion', value: `${avgConversion}%`, sub: 'active funnels' },
    { label: 'Active Funnels', value: active.length, sub: 'running now' },
  ];

  return (
    <div className="px-4 pt-5 pb-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white tracking-tight">Insights</h1>
        <p className="text-xs text-white/40 mt-0.5">Aggregated performance signals</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl p-4 flex items-center justify-between"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div>
              <p className="text-xs text-white/40 tracking-wide">{card.label}</p>
              <p className="text-xs text-white/30 mt-0.5">{card.sub}</p>
            </div>
            <span className="text-2xl font-bold" style={{ color: '#F59E0B' }}>
              {card.value}
            </span>
          </div>
        ))}
      </div>

      {/* Top funnel */}
      {topFunnel && (
        <div
          className="rounded-2xl p-4 space-y-2"
          style={{
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.15)',
          }}
        >
          <p className="text-xs font-medium text-amber-400 tracking-wide uppercase">Top Funnel</p>
          <p className="text-sm font-semibold text-white">{topFunnel.name}</p>
          <div className="flex gap-4 mt-1">
            <span className="text-xs text-white/40">{topFunnel.metrics?.leads ?? 0} leads</span>
            <span className="text-xs text-white/40">{topFunnel.metrics?.conversionRate ?? 0}% CVR</span>
          </div>
        </div>
      )}

      {active.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-white/30 text-sm text-center">Create your first funnel to see insights here.</p>
        </div>
      )}
    </div>
  );
}