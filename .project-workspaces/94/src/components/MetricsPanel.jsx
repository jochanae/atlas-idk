import React from 'react'
import { useDashboard } from '../hooks/useDashboard'

function MetricCard({ label, value, sub, accent, large }) {
  return (
    <div
      className="rounded-2xl flex flex-col"
      style={{
        background: accent
          ? 'rgba(245, 158, 11, 0.06)'
          : 'rgba(255, 255, 255, 0.04)',
        border: `1px solid ${accent ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.07)'}`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: large ? '18px 16px' : '14px 16px',
        flex: large ? '1 1 100%' : '1 1 calc(50% - 6px)'
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.35)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 6
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: large ? 32 : 24,
          fontWeight: 700,
          color: accent ? '#f59e0b' : 'rgba(255,255,255,0.92)',
          lineHeight: 1.1,
          letterSpacing: '-0.02em'
        }}
      >
        {value}
      </span>
      {sub && (
        <span
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.3)',
            marginTop: 4,
            letterSpacing: '0.02em'
          }}
        >
          {sub}
        </span>
      )}
    </div>
  )
}

export default function MetricsPanel() {
  const { metrics } = useDashboard()

  return (
    <div className="flex flex-col gap-3">
      {/* Top row — conversion rate hero */}
      <MetricCard
        label="Conversion Rate"
        value={`${metrics.conversionRate}%`}
        sub={`↑ ${metrics.weeklyGrowth}% this week`}
        accent
        large
      />

      {/* Bottom row — supporting metrics */}
      <div className="flex gap-3">
        <MetricCard
          label="Total Leads"
          value={metrics.totalLeads.toLocaleString()}
          sub="all funnels"
        />
        <MetricCard
          label="Active Funnels"
          value={metrics.activeFunnels}
          sub="running now"
        />
      </div>

      <div className="flex gap-3">
        <MetricCard
          label="Clicks Today"
          value={metrics.clicksToday.toLocaleString()}
          sub="across all links"
        />
        <MetricCard
          label="Weekly Growth"
          value={`+${metrics.weeklyGrowth}%`}
          sub="vs last week"
        />
      </div>
    </div>
  )
}