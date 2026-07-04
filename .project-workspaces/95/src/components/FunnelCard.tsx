import React, { useState } from 'react'
import type { Funnel } from '../types'
import { useFunnelStore } from '../hooks/useFunnelStore'

type Props = {
  funnel: Funnel
}

const STATUS_LABELS: Record<Funnel['status'], string> = {
  active: 'Active',
  draft: 'Draft',
  archived: 'Archived',
}

const STATUS_COLORS: Record<Funnel['status'], string> = {
  active: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  draft: 'text-white/50 bg-white/5 border-white/10',
  archived: 'text-white/30 bg-white/3 border-white/8',
}

export function FunnelCard({ funnel }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { updateFunnel, archiveFunnel, duplicateFunnel, deleteFunnel } = useFunnelStore()

  const conversionRate =
    funnel.leads > 0 ? ((funnel.conversions / funnel.leads) * 100).toFixed(1) : '0.0'

  const handleStatusToggle = () => {
    if (funnel.status === 'active') updateFunnel(funnel.id, { status: 'draft' })
    else if (funnel.status === 'draft') updateFunnel(funnel.id, { status: 'active' })
  }

  const handleDelete = () => {
    if (confirmDelete) {
      deleteFunnel(funnel.id)
    } else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
    }
  }

  return (
    <div
      className="rounded-2xl border border-glass-border backdrop-blur-glass shadow-glass overflow-hidden animate-fade-up"
      style={{ background: 'rgba(255,255,255,0.03)' }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} funnel: ${funnel.name}`}
        className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 active:bg-white/5"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[funnel.status]}`}
            >
              {STATUS_LABELS[funnel.status]}
            </span>
          </div>
          <p className="text-sm font-medium text-white/90 truncate">{funnel.name}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-white/40">{funnel.leads} leads</span>
            <span className="text-xs text-amber-gold font-medium">{conversionRate}% conv.</span>
          </div>
        </div>
        <span className="text-white/30 text-lg mt-0.5 flex-shrink-0">
          {expanded ? '↑' : '↓'}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-glass-border">
          {/* Steps */}
          <div className="px-4 py-3 space-y-3">
            {funnel.steps.map((step) => (
              <div
                key={step.step}
                className="flex gap-3"
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-gold/15 border border-amber-gold/30 flex items-center justify-center mt-0.5">
                  <span className="text-xs text-amber-gold font-semibold">{step.step}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white/85">{step.title}</p>
                  <p className="text-xs text-white/45 leading-relaxed mt-0.5">{step.description}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-amber-muted/80 font-medium">CTA:</span>
                    <span className="text-xs text-amber-light">{step.cta}</span>
                    <span className="ml-auto text-xs text-white/30">~{step.conversionTarget}% target</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="border-t border-glass-border px-4 py-3 flex items-center gap-2 flex-wrap">
            {funnel.status !== 'archived' && (
              <button
                onClick={handleStatusToggle}
                aria-label={funnel.status === 'active' ? 'Set funnel to draft' : 'Set funnel to active'}
                className="text-xs px-3 py-1.5 rounded-lg border border-glass-border text-white/60 hover:text-white/90 hover:bg-white/5 transition-all active:scale-95"
              >
                {funnel.status === 'active' ? '⏸ Pause' : '▶ Activate'}
              </button>
            )}
            <button
              onClick={() => duplicateFunnel(funnel.id)}
              aria-label="Duplicate funnel"
              className="text-xs px-3 py-1.5 rounded-lg border border-glass-border text-white/60 hover:text-white/90 hover:bg-white/5 transition-all active:scale-95"
            >
              ⧉ Duplicate
            </button>
            {funnel.status !== 'archived' && (
              <button
                onClick={() => archiveFunnel(funnel.id)}
                aria-label="Archive funnel"
                className="text-xs px-3 py-1.5 rounded-lg border border-glass-border text-white/60 hover:text-white/90 hover:bg-white/5 transition-all active:scale-95"
              >
                ↓ Archive
              </button>
            )}
            <button
              onClick={handleDelete}
              aria-label={confirmDelete ? 'Confirm delete funnel' : 'Delete funnel'}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all active:scale-95 ml-auto ${
                confirmDelete
                  ? 'border-red-500/50 text-red-400 bg-red-500/10'
                  : 'border-glass-border text-white/30 hover:text-red-400 hover:border-red-500/30'
              }`}
            >
              {confirmDelete ? 'Confirm delete' : '× Delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}