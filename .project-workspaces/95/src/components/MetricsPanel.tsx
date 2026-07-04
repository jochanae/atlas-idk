import React from 'react'
import { useFunnelStore } from '../hooks/useFunnelStore'

type MetricCardProps = {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
}

function MetricCard({ label, value, sub, accent }: MetricCardProps) {
  return (
    <div
      className="rounded-2xl border border-glass-border backdrop-blur-glass shadow-glass p-4 flex flex-col gap-1"
      style={{ background: 'rgba(255,255,255,0.03)' }}
    >
      <span className="text-xs text-white/40 tracking-wide uppercase">{label}</span>
      <span
        className={`text-3xl font-semibold tracking-tight ${
          accent ? 'text-amber-gold' : 'text-white/90'
        }`}
      >
        {value}
      </span>
      {sub && <span className="text-xs text-white/30">{sub}</span>}
    </div>
  )
}

export function MetricsPanel() {
  const { funnels, activeFunnels } = useFunnelStore()

  const totalLeads = funnels
    .filter((f) => f.status !== 'archived')
    .reduce((acc, f) => acc + f.leads, 0)

  const totalConversions = funnels
    .filter((f) => f.status !== 'archived')
    .reduce((acc, f) => acc + f.conversions, 0)

  const conversionRate =
    totalLeads > 0 ? ((totalConversions / totalLeads) * 100).toFixed(1) : '0.0'

  const topFunnel = [...funnels]
    .filter((f) => f.status === 'active' && f.leads > 0)
    .sort((a, b) => b.conversions / b.leads - a.conversions / a.leads)[0]

  return (
    <div className="px-4 pt-6 pb-2 space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-amber-gold tracking-wide">Metrics</h2>
        <p className="text-sm text-white/40 mt-0.5">Live conversion snapshot across active funnels.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Conversion Rate"
          value={`${conversionRate}%`}
          sub="across active funnels"
          accent
        />
        <MetricCard
          label="Active Funnels"
          value={activeFunnels.length}
          sub={`${funnels.length} total`}
        />
        <MetricCard
          label="Total Leads"
          value={totalLeads.toLocaleString()}
          sub="all time"
        />
        <MetricCard
          label="Conversions"
          value={totalConversions.toLocaleString()}
          sub="all time"
        />
      </div>

      {topFunnel && (
        <div
          className="rounded-2xl border border-amber-gold/20 backdrop-blur-glass shadow-amber-sm p-4"
          style={{ background: 'rgba(196,151,72,0.05)' }}
        >
          <p className="text-xs text-amber-muted/80 uppercase tracking-wide mb-1">Top Performing Funnel</p>
          <p className="text-sm font-medium text-white/85 truncate">{topFunnel.name}</p>
          <p className="text-xs text-amber-gold mt-1">
            {((topFunnel.conversions / topFunnel.leads) * 100).toFixed(1)}% conversion rate ·{' '}
            {topFunnel.leads} leads
          </p>
        </div>
      )}

      {funnels.length === 0 && (
        <div className="rounded-2xl border border-glass-border p-6 text-center"
          style={{ background: 'rgba(255,255,255,0.02)' }}>
          <p className="text-sm text-white/30">No funnel data yet.</p>
          <p className="text-xs text-white/20 mt-1">Generate your first funnel to see metrics here.</p>
        </div>
      )}
    </div>
  )
}