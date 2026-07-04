import React from 'react'
import FunnelCard from '../components/FunnelCard'
import FunnelGenerator from '../components/FunnelGenerator'
import type { Funnel } from '../hooks/useFunnelState'

interface Props {
  funnels: Funnel[]
  lastGenerated: string | null
  generating: boolean
  onGenerate: (prompt: string) => void
  onToggle: (id: string) => void
  onArchive: (id: string) => void
}

export default function FunnelsScreen({
  funnels,
  lastGenerated,
  generating,
  onGenerate,
  onToggle,
  onArchive,
}: Props) {
  const visible = funnels.filter((f) => f.status !== 'archived')

  return (
    <div className="px-4 pt-6 pb-28 space-y-5">
      <div>
        <h1 className="text-white text-2xl font-semibold tracking-tight">Funnels</h1>
        <p className="text-white/40 text-sm mt-1">
          {visible.length} funnel{visible.length !== 1 ? 's' : ''} — tap to manage
        </p>
      </div>

      <FunnelGenerator onGenerate={onGenerate} generating={generating} />

      {generating && (
        <div className="glass rounded-2xl p-5 flex items-center gap-4">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-amber-400"
                style={{
                  animation: `shimmer 1.2s ease-in-out infinite`,
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
          <p className="text-white/50 text-sm">Generating your 3-step funnel…</p>
        </div>
      )}

      {visible.length === 0 && !generating && (
        <div className="text-center py-12">
          <p className="text-white/20 text-4xl mb-3">⟁</p>
          <p className="text-white/30 text-sm">No funnels yet</p>
          <p className="text-white/20 text-xs mt-1">Type a prompt above to generate your first one</p>
        </div>
      )}

      <div className="space-y-4">
        {visible.map((funnel) => (
          <FunnelCard
            key={funnel.id}
            funnel={funnel}
            isNew={funnel.id === lastGenerated}
            onToggle={onToggle}
            onArchive={onArchive}
          />
        ))}
      </div>
    </div>
  )
}