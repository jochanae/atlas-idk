import React, { useState } from 'react'
import { FunnelPrompt } from '../components/FunnelPrompt'
import { FunnelCard } from '../components/FunnelCard'
import { useFunnelStore } from '../hooks/useFunnelStore'

type FilterTab = 'active' | 'draft' | 'archived' | 'all'

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'draft', label: 'Draft' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
]

export function FunnelsPage() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('active')
  const { funnels, activeFunnels, draftFunnels, archivedFunnels } = useFunnelStore()

  const filteredFunnels =
    activeFilter === 'all'
      ? funnels
      : activeFilter === 'active'
      ? activeFunnels
      : activeFilter === 'draft'
      ? draftFunnels
      : archivedFunnels

  const counts: Record<FilterTab, number> = {
    active: activeFunnels.length,
    draft: draftFunnels.length,
    archived: archivedFunnels.length,
    all: funnels.length,
  }

  return (
    <div className="min-h-full pb-28">
      <FunnelPrompt />

      {/* Filter tabs */}
      {funnels.length > 0 && (
        <div className="px-4 pt-4">
          <div className="flex gap-1 p-1 rounded-2xl border border-glass-border"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                aria-label={`Filter by ${tab.label}`}
                aria-pressed={activeFilter === tab.key}
                className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                  activeFilter === tab.key
                    ? 'bg-amber-gold/15 text-amber-light border border-amber-gold/20'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                {tab.label}
                {counts[tab.key] > 0 && (
                  <span className="ml-1 opacity-60">({counts[tab.key]})</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Funnel list */}
      <div className="px-4 pt-3 space-y-3">
        {filteredFunnels.length === 0 ? (
          <div
            className="rounded-2xl border border-glass-border p-8 text-center"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            {funnels.length === 0 ? (
              <>
                <p className="text-4xl mb-3">⚡</p>
                <p className="text-sm text-white/50 font-medium">No funnels yet</p>
                <p className="text-xs text-white/25 mt-1">
                  Describe your offer above to generate your first funnel.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-white/40">No {activeFilter} funnels</p>
              </>
            )}
          </div>
        ) : (
          filteredFunnels.map((funnel) => (
            <FunnelCard key={funnel.id} funnel={funnel} />
          ))
        )}
      </div>
    </div>
  )
}