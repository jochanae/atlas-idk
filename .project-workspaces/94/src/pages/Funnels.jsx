import React from 'react'
import FunnelPrompt from '../components/FunnelPrompt'
import FunnelCard from '../components/FunnelCard'
import { useDashboard } from '../hooks/useDashboard'

export default function Funnels() {
  const { funnels } = useDashboard()
  const activeFunnels = funnels.filter(f => f.active)
  const pausedFunnels = funnels.filter(f => !f.active)

  return (
    <div className="scroll-area h-full">
      <div className="px-4 pt-8 pb-6 flex flex-col gap-6">

        {/* Header */}
        <div>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(245,158,11,0.7)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 4
            }}
          >
            Lead Generation
          </p>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.95)',
              letterSpacing: '-0.02em',
              lineHeight: 1.2
            }}
          >
            Your Funnels
          </h1>
        </div>

        {/* Generator */}
        <FunnelPrompt />

        {/* Active funnels */}
        {activeFunnels.length > 0 && (
          <section>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.3)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 12
              }}
            >
              Active · {activeFunnels.length}
            </h2>
            <div className="flex flex-col gap-3">
              {activeFunnels.map(funnel => (
                <FunnelCard key={funnel.id} funnel={funnel} compact />
              ))}
            </div>
          </section>
        )}

        {/* Paused funnels */}
        {pausedFunnels.length > 0 && (
          <section>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.3)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 12
              }}
            >
              Paused · {pausedFunnels.length}
            </h2>
            <div className="flex flex-col gap-3">
              {pausedFunnels.map(funnel => (
                <FunnelCard key={funnel.id} funnel={funnel} compact />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {funnels.length === 0 && (
          <div
            className="flex flex-col items-center justify-center rounded-2xl"
            style={{
              padding: '48px 24px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)'
            }}
          >
            <div
              className="rounded-full flex items-center justify-center mb-4"
              style={{
                width: 52,
                height: 52,
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.2)'
              }}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M3 4h16l-6 7v6l-4-2V11L3 4z" fill="rgba(245,158,11,0.25)" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
              No funnels yet
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 1.6 }}>
              Describe your offer above and generate your first 3-step lead funnel.
            </p>
          </div>
        )}

        <div style={{ height: 16 }} />
      </div>
    </div>
  )
}
