import React from 'react'

const CATEGORY_META = {
  watches: { color: '#d4a017', label: 'Timepiece', borderColor: 'rgba(212,160,23,0.2)' },
  fashion: { color: '#8ab4d4', label: 'Fashion', borderColor: 'rgba(138,180,212,0.15)' },
  art: { color: '#b48dd4', label: 'Fine Art', borderColor: 'rgba(180,141,212,0.15)' }
}

function formatValue(value) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value}`
}

function AssetCard({ asset, isNew }) {
  const meta = CATEGORY_META[asset.category] || CATEGORY_META.fashion
  const gain = asset.value - asset.acquiredAt
  const gainPct = ((gain / asset.acquiredAt) * 100).toFixed(1)
  const isUp = gain >= 0
  const change24hUp = asset.change24h >= 0

  return (
    <div
      className="rounded-2xl p-4 press-effect transition-all duration-500"
      style={{
        background: isNew
          ? 'rgba(212,160,23,0.06)'
          : 'rgba(12,15,26,0.6)',
        border: isNew
          ? '1px solid rgba(212,160,23,0.25)'
          : `1px solid ${meta.borderColor}`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: isNew
          ? '0 0 24px rgba(212,160,23,0.1), 0 8px 24px rgba(0,0,0,0.3)'
          : '0 4px 16px rgba(0,0,0,0.2)',
        animation: isNew ? 'fadeInUp 0.4s ease forwards' : undefined
      }}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left */}
        <div className="flex-1 min-w-0">
          {/* Category badge */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <div
              className="w-1 h-1 rounded-full"
              style={{ background: meta.color }}
            />
            <span
              className="text-xs uppercase tracking-widest"
              style={{ color: meta.color, fontSize: '8px', letterSpacing: '0.16em', opacity: 0.8 }}
            >
              {meta.label}
            </span>
            {asset.year && (
              <span
                style={{ color: 'rgba(255,255,255,0.2)', fontSize: '8px' }}
              >
                · {asset.year}
              </span>
            )}
          </div>

          {/* Name */}
          <p
            className="font-display text-white leading-tight truncate"
            style={{ fontSize: '15px', fontWeight: 500, letterSpacing: '0.01em' }}
          >
            {asset.name}
          </p>

          {/* Tag */}
          {asset.tag && (
            <p
              className="mt-0.5 truncate"
              style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}
            >
              {asset.tag}
            </p>
          )}
        </div>

        {/* Right */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span
            className="font-display font-medium"
            style={{
              fontSize: '17px',
              color: 'rgba(255,255,255,0.9)',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.01em'
            }}
          >
            {formatValue(asset.value)}
          </span>

          {/* 24h change */}
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              fontSize: '10px',
              color: change24hUp ? '#d4a017' : '#9a7040',
              background: change24hUp ? 'rgba(212,160,23,0.08)' : 'rgba(120,80,0,0.08)',
              border: `1px solid ${change24hUp ? 'rgba(212,160,23,0.15)' : 'rgba(120,80,0,0.15)'}`,
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {change24hUp ? '+' : ''}{asset.change24h.toFixed(1)}%
          </span>

          {/* Total gain */}
          <span
            style={{
              fontSize: '10px',
              color: isUp ? 'rgba(212,160,23,0.6)' : 'rgba(150,100,0,0.6)',
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {isUp ? '+' : ''}{formatValue(Math.abs(gain))} ({isUp ? '+' : ''}{gainPct}%)
          </span>
        </div>
      </div>
    </div>
  )
}

export default function AssetList({ assets, lastAdded, activeCategory }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-xs uppercase tracking-widest"
          style={{ color: 'rgba(255,255,255,0.25)', fontSize: '9px', letterSpacing: '0.18em' }}
        >
          {activeCategory ? `${activeCategory} assets` : 'All Holdings'}
        </span>
        <span
          style={{ color: 'rgba(255,255,255,0.2)', fontSize: '10px' }}
        >
          {assets.length} item{assets.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {assets.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{
              background: 'rgba(12,15,26,0.4)',
              border: '1px solid rgba(255,255,255,0.04)'
            }}
          >
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '13px' }}>
              No assets in this category
            </p>
          </div>
        ) : (
          assets.map(asset => (
            <AssetCard
              key={asset.id}
              asset={asset}
              isNew={asset.id === lastAdded}
            />
          ))
        )}
      </div>
    </div>
  )
}