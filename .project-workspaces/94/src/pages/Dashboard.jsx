import React from 'react'
import FunnelPrompt from '../components/FunnelPrompt'
import MetricsPanel from '../components/MetricsPanel'
import { useDashboard } from '../hooks/useDashboard'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const { funnels, links } = useDashboard()
  const navigate = useNavigate()
  const activeFunnels = funnels.filter(f => f.active)
  const activeLinks = links.filter(l => l.active)

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
            Good morning
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
            Your Marketing<br />Dashboard
          </h1>
        </div>

        {/* Hero: Funnel Generator */}
        <FunnelPrompt />

        {/* Metrics */}
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
            Performance
          </h2>
          <MetricsPanel />
        </section>

        {/* Active funnels preview */}
        {activeFunnels.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.3)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase'
                }}
              >
                Active Funnels
              </h2>
              <button
                onClick={() => navigate('/funnels')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  color: '#f59e0b',
                  letterSpacing: '0.03em'
                }}
              >
                View all →
              </button>
            </div>
            <div
              className="rounded-2xl p-4"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)'
              }}
            >
              {activeFunnels.slice(0, 2).map((funnel, i) => (
                <div
                  key={funnel.id}
                  className="flex items-center justify-between"
                  style={{
                    paddingBottom: i < Math.min(activeFunnels.length, 2) - 1 ? 12 : 0,
                    marginBottom: i < Math.min(activeFunnels.length, 2) - 1 ? 12 : 0,
                    borderBottom: i < Math.min(activeFunnels.length, 2) - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none'
                  }}
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <p
                      style={{
                        fontSize: 12,
                        color: 'rgba(255,255,255,0.7)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {funnel.prompt}
                    </p>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                      {funnel.leads} leads · 3 steps
                    </p>
                  </div>
                  <span
                    className="pulse-amber flex-shrink-0"
                    style={{ fontSize: 8, color: '#f59e0b' }}
                  >
                    ●
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Active links preview */}
        {activeLinks.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.3)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase'
                }}
              >
                Active Links
              </h2>
              <button
                onClick={() => navigate('/links')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  color: '#f59e0b',
                  letterSpacing: '0.03em'
                }}
              >
                Manage →
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {activeLinks.map(link => (
                <div
                  key={link.id}
                  className="flex items-center gap-2 rounded-xl"
                  style={{
                    padding: '6px 12px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.7)'
                  }}
                >
                  <span>{link.icon}</span>
                  <span>{link.label}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Bottom spacer */}
        <div style={{ height: 16 }} />
      </div>
    </div>
  )
}