import React from 'react'

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

function formatValue(value) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value}`
}

export default function TransactionFeed({ transactions }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: 'rgba(10,12,20,0.6)',
        border: '1px solid rgba(255,255,255,0.04)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)'
      }}
    >
      <span
        className="text-xs uppercase tracking-widest mb-3 block"
        style={{ color: 'rgba(255,255,255,0.2)', fontSize: '9px', letterSpacing: '0.18em' }}
      >
        Recent Entries
      </span>

      <div className="flex flex-col gap-2">
        {transactions.map(tx => (
          <div
            key={tx.id}
            className="flex items-center gap-3 animate-fade-in-up"
          >
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: 'rgba(212,160,23,0.6)' }}
            />
            <div className="flex-1 min-w-0">
              <p
                className="truncate"
                style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}
              >
                {tx.parsed.name}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                style={{ fontSize: '12px', color: 'rgba(212,160,23,0.7)', fontVariantNumeric: 'tabular-nums' }}
              >
                {formatValue(tx.parsed.value)}
              </span>
              <span
                style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}
              >
                {timeAgo(tx.timestamp)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}