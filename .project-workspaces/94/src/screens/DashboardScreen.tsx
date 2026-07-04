import React from 'react'
import MetricCard from '../components/MetricCard'
import FunnelGenerator from '../components/FunnelGenerator'
import type { MetricCard as MetricCardType } from '../hooks/useMetrics'
import type { Funnel } from '../hooks/useFunnelState'

interface Props {
  metrics: MetricCardType[]
  funnels: Funnel[]
  generating: boolean
  onGenerate: (prompt: string) => void
  onNavigateToFunnels: () => void
}

export default function DashboardScreen({
  metrics,
  funnels,
  generating,
  onGenerate,
  onNavigateToFunnels,
}: Props) {
  const activeFunnels = funnels.filter((f) => f.status === 'active')

  return (
    <div className="px-4 pt-6 pb-28 space-y-6">
      {/* Header */}
      <div>
        <p className="text-white/30 text-xs uppercase tracking-widest font-medium mb-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="text-white text-2xl font-semibold tracking-tight">
          Your Dashboard
        </h1>
        <p className="text-white/40 text-sm mt-1 leading-relaxed">
          {activeFunnels.length} active funnel{activeFunnels.length !== 1 ? 's' : ''} running
        </p>
      </div>

      {/* Funnel generator — hero moment */}
      <FunnelGenerator onGenerate={onGenerate} generating={generating} />

      {/* Metrics grid */}
      <div>
        <p className="text-white/25 text-xs uppercase tracking-widest font-medium mb-3">
          Performance
        </p>
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((metric, i) => (
            <MetricCard key={metric.id} metric={metric} index={i} />
          ))}
        </div>
      </div>

      {/* Recent funnels preview */}
      {activeFunnels.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-white/25 text-xs uppercase tracking-widest font-medium">
              Active Funnels
            </p>
            <button
              onClick={onNavigateToFunnels}
              className="text-amber-400/70 text-xs font-medium"
            >
              See all →
            </button>
          </div>
          <div className="space-y-2">
            {activeFunnels.slice(0, 2).map((funnel) => (
              <button
                key={funnel.id}
                onClick={onNavigateToFunnels}
                className="w-full glass rounded-xl p-3 text-left active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white/70 text-xs leading-snug line-clamp-1 flex-1">
                    {funnel.prompt}
                  </p>
                  <span className="shrink-0 text-xs text-amber-400/60 font-medium">
                    {funnel.conversion > 0 ? `${funnel.conversion}%` : 'New'}
                  </span>
                </div>
                <div className="flex gap-3 mt-2">
                  {funnel.steps.map((step) => (
                    <span key={step.id} className="text-white/25 text-xs">
                      {step.label}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}