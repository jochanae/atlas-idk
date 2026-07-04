import React from 'react'
import type { MetricCard as MetricCardType } from '../hooks/useMetrics'

interface Props {
  metric: MetricCardType
  index: number
}

export default function MetricCard({ metric, index }: Props) {
  const trendColor =
    metric.trend === 'up'
      ? 'text-amber-400'
      : metric.trend === 'down'
      ? 'text-red-400/70'
      : 'text-white/30'

  const trendSymbol =
    metric.trend === 'up' ? '↑' : metric.trend === 'down' ? '↓' : '—'

  return (
    <div
      className="glass rounded-2xl p-4 animate-fade-in-up"
      style={{ animationDelay: `${index * 0.08}s`, opacity: 0 }}
    >
      <p className="text-white/40 text-xs font-medium uppercase tracking-widest mb-2 line-height-relaxed">
        {metric.label}
      </p>
      <p className="text-white text-2xl font-semibold tracking-tight mb-1">
        {metric.value}
      </p>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium ${trendColor}`}>
          {trendSymbol} {metric.trendValue}
        </span>
      </div>
      <p className="text-white/25 text-xs mt-1">{metric.subtext}</p>
    </div>
  )
}