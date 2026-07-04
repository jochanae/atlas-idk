import React, { useState, useEffect, useCallback } from 'react'
import SparklineChart from './components/SparklineChart.jsx'
import Toast from './components/Toast.jsx'

// ── Format helpers ───────────────────────────────────────────────────────────
function formatCurrency(cents) {
  const value = cents / 100
  if (value >= 1_000_000) return '$' + (value / 1_000_000).toFixed(2) + 'M'
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function buildSparklinePoints(sparklineRows, totalCents) {
  if (!sparklineRows || sparklineRows.length === 0) {
    const v = totalCents / 100 / 1000
    return Array.from({ length: 24 }, () => v)
  }
  const points = sparklineRows.map(r => Number(r.delta_cents))
  const base = (totalCents / 100 / 1000) - points.reduce((s, v) => s + v / 100, 0)
  let running = base
  return points.map(delta => { running += delta / 100; return Math.max(0, running) })
}

// ── Avatar ───────────────────────────────────────────────────────────────────
function UserAvatar({ user }) {
  const [imgError, setImgError] = useState(false)

  if (user?.picture && !imgError) {
    return (
      <img
        src={user.picture}
        alt={user.name ?? 'Profile'}
        onError={() => setImgError(true)}
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          objectFit: 'cover',
          border: '1px solid rgba(251,191,36,0.25)',
          display: 'block',
        }}
      />
    )
  }

  // Fallback — initials if name exists, else person icon
  if (user?.name && !imgError) {
    const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    return (
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          background: 'rgba(251,191,36,0.12)',
          border: '1px solid rgba(251,191,36,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 600,
          color: '#fbbf24',
          letterSpacing: '0.04em',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {initials}
      </div>
    )
  }

  // Default icon fallback
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 12,
        background: 'rgba(251,191,36,0.08)',
        border: '1px solid rgba(251,191,36,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5" r="3" stroke="#fbbf24" strokeWidth="1.5"/>
        <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </div>
  )
}

// ── Dashboard (/) ────────────────────────────────────────────────────────────
export default function App() {
  const [summary, setSummary] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() })
    setTimeout(() => setToast(null), 3200)
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const [summaryRes, meRes] = await Promise.all([
          fetch('/api/ledger/summary', { credentials: 'include' }),
          fetch('/api/auth/me', { credentials: 'include' }),
        ])
        if (!summaryRes.ok) throw new Error('fetch failed')
        const data = await summaryRes.json()
        setSummary(data)
        if (meRes.ok) {
          const meData = await meRes.json()
          setUser(meData)
        }
      } catch {
        showToast('Could not load portfolio — check your connection', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const totalCents = summary?.totalCents ?? 0
  const assetCount = summary?.assetCount ?? 0
  const byCategory = summary?.byCategory ?? []
  const sparklineRows = summary?.sparkline ?? []
  const sparkPoints = buildSparklinePoints(sparklineRows, totalCents)

  const sparkChange = sparkPoints.length > 1
    ? (((sparkPoints[sparkPoints.length - 1] - sparkPoints[0]) / (sparkPoints[0] || 1)) * 100).toFixed(2)
    : '0.00'
  const isUp = parseFloat(sparkChange) >= 0

  return (
    <div className="obsidian-bg min-h-dvh">
      <div className="max-w-lg mx-auto px-4 pt-6 pb-6 safe-bottom flex flex-col gap-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <p className="section-label" style={{ letterSpacing: '0.18em' }}>The Obsidian Ledger</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>
              {loading ? '—' : `${assetCount} ${assetCount === 1 ? 'asset' : 'assets'} tracked`}
            </p>
          </div>
          <UserAvatar user={user} />
        </div>

        {/* ── Zone 1: Portfolio Summary Card ── */}
        <div className="glass-card-elevated p-6 amber-glow-border">
          <div className="flex items-start justify-between mb-1">
            <p className="section-label">Total Portfolio Value</p>
            {!loading && (
              <span className={isUp ? 'trend-up' : 'trend-down'}>
                {isUp ? '↑' : '↓'} {Math.abs(sparkChange)}% 24h
              </span>
            )}
          </div>

          <div className="mt-3 mb-5">
            {loading ? (
              <div style={{ height: 48, display: 'flex', alignItems: 'center' }}>
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14 }}>Loading…</span>
              </div>
            ) : (
              <>
                <span
                  className="value-display amber-glow"
                  style={{ fontSize: 'clamp(2.4rem, 10vw, 3.2rem)', lineHeight: 1 }}
                >
                  {formatCurrency(totalCents)}
                </span>
                <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  Live · USD
                </p>
              </>
            )}
          </div>

          {/* Sparkline */}
          <SparklineChart data={sparkPoints} isUp={isUp} />

          <div className="flex justify-between mt-2">
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>24h ago</span>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>Now</span>
          </div>
        </div>

        {/* ── Category summary cards ── */}
        {!loading && byCategory.length > 0 && (
          <div className="glass-card px-4 py-4">
            <p className="section-label mb-3">By Category</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {byCategory.map(cat => {
                const pct = totalCents > 0 ? Math.round((Number(cat.total_cents) / totalCents) * 100) : 0
                const colors = { 'Watches': '#fbbf24', 'Fine Art': '#a78bfa', 'Fashion': '#f472b6' }
                const color = colors[cat.category] ?? '#888'
                return (
                  <div key={cat.category}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: color, letterSpacing: '0.08em' }}>
                        {(cat.category || '').toUpperCase()}
                      </span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                        {pct}% · {cat.count} items
                      </span>
                    </div>
                    <div style={{ height: 2, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: color, opacity: 0.7, borderRadius: 2 }}/>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && assetCount === 0 && (
          <div className="glass-card px-4 py-8 text-center">
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>No assets yet</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', marginTop: 6 }}>
              Tap + ADD to log your first asset
            </p>
          </div>
        )}

      </div>

      {toast && <Toast key={toast.id} message={toast.message} type={toast.type} />}
    </div>
  )
}