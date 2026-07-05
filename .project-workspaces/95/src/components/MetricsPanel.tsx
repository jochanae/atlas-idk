import { useFunnelStore } from '../hooks/useFunnelStore';

interface Props {
  expanded?: boolean;
}

export default function MetricsPanel({ expanded = false }: Props) {
  const { funnels } = useFunnelStore();
  const active = funnels.filter((f) => !f.archived);

  const totalLeads = active.reduce((sum, f) => sum + f.metrics.leads, 0);
  const avgCVR = active.length
    ? Math.round(active.reduce((sum, f) => sum + f.metrics.conversionRate, 0) / active.length)
    : 0;
  const totalClicks = active.reduce((sum, f) => sum + f.metrics.clicks, 0);

  const cards = [
    { label: 'Active Funnels', value: active.length, unit: '', color: '#F59E0B' },
    { label: 'Total Leads', value: totalLeads, unit: '', color: '#F59E0B' },
    { label: 'Avg CVR', value: `${avgCVR}%`, unit: '', color: '#F59E0B' },
    ...(expanded ? [{ label: 'Total Clicks', value: totalClicks, unit: '', color: '#F59E0B' }] : []),
  ];

  return (
    <div className={`grid gap-3 ${expanded ? 'grid-cols-1' : 'grid-cols-3'}`}>
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl flex flex-col items-center justify-center py-4 px-3"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <span className="text-2xl font-bold" style={{ color: card.color }}>
            {card.value}
          </span>
          <span className="text-[10px] text-white/35 tracking-wide mt-1 text-center">{card.label}</span>
        </div>
      ))}
    </div>
  );
}