import React from 'react'
import type { Funnel } from '../hooks/useFunnelState'

interface Props {
  funnel: Funnel
  isNew: boolean
  onToggle: (id: string) => void
  onArchive: (id: string) => void
}

export default function FunnelCard({ funnel, isNew, onToggle, onArchive }: Props) {
  const statusColor =
    funnel.status === 'active'
      ? 'bg-amber-400/20 text-amber-400'
      : funnel.status === 'paused'
      ? 'bg-white/10 text-white/40'
      : 'bg-red-400/10 text-red-400/60'

  const statusLabel =
    funnel.status === 'active' ? 'Active' : funnel.status === 'paused' ? 'Paused' : 'Archived'

  const daysAgo = Math.floor(
    (Date.now() - funnel.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  )
  const dateLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`

  if (funnel.status === 'archived') return null

  return (
    <div
      className={`glass rounded-2xl p-5 ${isNew ? 'ambient-glow' : ''}`}
      style={
        isNew
          ? {
              animation: 'fadeInUp 0.5s ease forwards',
              boxShadow: '0 0 32px rgba(245, 158, 11, 0.08)',
            }
          : {}
      }
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <p className="text-white/60 text-xs uppercase tracking-widest font-medium mb-1">
            {dateLabel}
          </p>
          <p className="text-white text-sm font-medium leading-snug line-clamp-2">
            {funnel.prompt}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      {/* Steps */}
      <div className="space-y-2.5 mb-4">
        {funnel.steps.map((step, i) => (
          <div
            key={step.id}
            className={`flex gap-3 items-start ${isNew ? 'step-reveal' : ''}`}
            style={isNew ? { animationDelay: `${i * 0.1 + 0.2}s` } : {}}
          >
            <div className="shrink-0 w-7 h-7 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
              <span className="text-amber-400 text-xs font-bold">{i + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-amber-400/80 text-xs font-semibold uppercase tracking-wide mb-0.5">
                {step.label}
              </p>
              <p className="text-white/60 text-xs leading-relaxed">{step.action}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Stats row */}
      {(funnel.leads > 0 || funnel.conversion > 0) && (
        <div className="flex gap-4 mb-4 pt-3 border-t border-white/5">
          <div>
            <p className="text-white/30 text-xs">Leads</p>
            <p className="text-white text-sm font-semibold">{funnel.leads}</p>
          </div>
          <div>
            <p className="text-white/30 text-xs">Conversion</p>
            <p className="text-amber-400 text-sm font-semibold">{funnel.conversion}%</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onToggle(funnel.id)}
          className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95"
          style={{
            background:
              funnel.status === 'active'
                ? 'rgba(255,255,255,0.06)'
                : 'rgba(245,158,11,0.12)',
            color:
              funnel.status === 'active'
                ? 'rgba(255,255,255,0.4)'
                : 'rgb(245,158,11)',
            border:
              funnel.status === 'active'
                ? '1px solid rgba(255,255,255,0.08)'
                : '1px solid rgba(245,158,11,0.25)',
          }}
        >
          {funnel.status === 'active' ? 'Pause' : 'Resume'}
        </button>
        <button
          onClick={() => onArchive(funnel.id)}
          className="py-2 px-4 rounded-xl text-xs font-semibold text-white/25 transition-all active:scale-95"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          Archive
        </button>
      </div>
    </div>
  )
}