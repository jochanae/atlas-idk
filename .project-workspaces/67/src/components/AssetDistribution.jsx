import React, { useState } from 'react'
import { categories, recentAssets, categoryColors } from '../data/mockPortfolio'

function formatCurrency(value) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
  return `$${value}`
}

// Frosted arc/shape for each category in the distribution ring
function DistributionRing({ categories, activeId, onSelect }) {
  const size = 180
  const cx = size / 2
  const cy = size / 2
  const outerR = 80
  const innerR = 52
  const gap = 0.04 // radians gap between segments

  let cumulativeAngle = -Math.PI / 2

  const segments = categories.map((cat) => {
    const angle = (cat.percent / 100) * 2 * Math.PI - gap
    const startAngle = cumulativeAngle + gap / 2
    const endAngle = startAngle + angle
    cumulativeAngle += (cat.percent / 100) * 2 * Math.PI

    const x1 = cx + outerR * Math.cos(startAngle)
    const y1 = cy + outerR * Math.sin(startAngle)
    const x2 = cx + outerR * Math.cos(endAngle)
    const y2 = cy + outerR * Math.sin(endAngle)
    const x3 = cx + innerR * Math.cos(endAngle)
    const y3 = cy + innerR * Math.sin(endAngle)
    const x4 = cx + innerR * Math.cos(startAngle)
    const y4 = cy + innerR * Math.sin(startAngle)

    const largeArc = angle > Math.PI ? 1 : 0

    const pathD = [
      `M ${x1} ${y1}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}`,
      'Z'
    ].join(' ')

    // Label position at midpoint angle
    const midAngle = startAngle + angle / 2
    const labelR = (outerR + innerR) / 2
    const lx = cx + labelR * Math.cos(midAngle)
    const ly = cy + labelR * Math.sin(midAngle)

    return { ...cat, pathD, lx, ly, midAngle, startAngle, endAngle }
  })

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ overflow: 'visible', flexShrink: 0 }}
    >
      <defs>
        {segments.map((seg) => (
          <filter key={`glow-${seg.id}`} id={`glow-${seg.id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ))}
      </defs>

      {segments.map((seg) => {
        const isActive = activeId === seg.id
        const opacity = activeId && !isActive ? 0.35 : 1
        const scale = isActive ? 1.04 : 1
        return (
          <g
            key={seg.id}
            onClick={() => onSelect(seg.id === activeId ? null : seg.id)}
            style={{
              cursor: 'pointer',
              transform: `scale(${scale})`,
              transformOrigin: `${cx}px ${cy}px`,
              transition: 'transform 0.2s ease, opacity 0.2s ease',
              opacity
            }}
          >
            <path
              d={seg.pathD}
              fill={`${seg.color}22`}
              stroke={seg.color}
              strokeWidth={isActive ? 1.5 : 0.8}
              style={{
                filter: isActive ? `drop-shadow(0 0 8px ${seg.color})` : undefined
              }}
            />
          </g>
        )
      })}

      {/* Center label */}
      <text
        x={cx}
        y={cy - 7}
        textAnchor="middle"
        className="font-display"
        style={{
          fill: 'rgba(255,255,255,0.7)',
          fontSize: '10px',
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          letterSpacing: '0.1em'
        }}
      >
        PORTFOLIO
      </text>
      <text
        x={cx}
        y={cy + 9}
        textAnchor="middle"
        style={{
          fill: '#d4a017',
          fontSize: '9px',
          fontFamily: 'Inter, sans-serif',
          letterSpacing: '0.05em'
        }}
      >
        3 CLASSES
      </text>
    </svg>
  )
}

function CategoryCard({ cat, isActive, onSelect }) {
  return (
    <button
      onClick={() => onSelect(cat.id === isActive ? null : cat.id)}
      className="tactile w-full text-left rounded-xl p-3.5 transition-all duration-200"
      style={{
        background: isActive
          ? `${cat.color}12`
          : 'rgba(255,255,255,0.02)',
        border: isActive
          ? `1px solid ${cat.color}55`
          : '1px solid rgba(255,255,255,0.05)',
        boxShadow: isActive
          ? `0 0 20px ${cat.color}18`
          : 'none'
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: cat.color, boxShadow: `0 0 6px ${cat.color}` }}
          />
          <span
            className="text-xs font-medium tracking-wide uppercase"
            style={{
              color: isActive ? cat.color : 'rgba(255,255,255,0.5)',
              fontSize: '0.65rem',
              letterSpacing: '0.12em'
            }}
          >
            {cat.label}
          </span>
        </div>
        <span
          className="text-xs font-semibold"
          style={{ color: isActive ? cat.color : 'rgba(255,255,255,0.35)' }}
        >
          {cat.percent}%
        </span>
      </div>

      <div className="flex items-end justify-between">
        <span
          className="font-display leading-none"
          style={{
            fontSize: '1.3rem',
            color: isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)',
            fontFamily: 'Cormorant Garamond, Georgia, serif'
          }}
        >
          {formatCurrency(cat.value)}
        </span>
        <span
          className="text-xs"
          style={{ color: 'rgba(255,255,255,0.25)' }}
        >
          {cat.count} items
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="mt-2.5 h-px w-full rounded-full overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: isActive ? `${cat.percent}%` : `${cat.percent * 0.7}%`,
            background: `linear-gradient(90deg, ${cat.color}88, ${cat.color})`,
            boxShadow: isActive ? `0 0 8px ${cat.color}` : 'none'
          }}
        />
      </div>
    </button>
  )
}

function AssetRow({ asset }) {
  const color = categoryColors[asset.category]
  return (
    <div
      className="glass tactile rounded-xl px-4 py-3.5 animate-fade-up"
      style={{
        borderColor: `${color}22`
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p
            className="font-display text-sm leading-tight mb-0.5 truncate"
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: '1rem'
            }}
          >
            {asset.name}
          </p>
          <p
            className="text-xs truncate"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            {asset.detail}
          </p>
        </div>
        <div className="flex flex-col items-end flex-shrink-0">
          <span
            className="text-sm font-semibold"
            style={{ color: '#d4a017' }}
          >
            {formatCurrency(asset.value)}
          </span>
          <span
            className="text-xs mt-0.5"
            style={{ color: asset.trend === 'up' ? 'rgba(126,200,126,0.7)' : 'rgba(255,255,255,0.2)' }}
          >
            {asset.trend === 'up' ? '▲ ' : '— '}{asset.acquired}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function AssetDistribution() {
  const [activeCategory, setActiveCategory] = useState(null)

  const filteredAssets = activeCategory
    ? recentAssets.filter(a => a.category === activeCategory)
    : recentAssets

  return (
    <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-xs font-medium tracking-[0.2em] uppercase"
          style={{ color: 'rgba(232, 188, 90, 0.6)' }}
        >
          Asset Distribution
        </h2>
        <button
          className="text-xs"
          style={{ color: 'rgba(255,255,255,0.25)' }}
        >
          View All →
        </button>
      </div>

      {/* Ring + category cards */}
      <div className="glass rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-4">
          <DistributionRing
            categories={categories}
            activeId={activeCategory}
            onSelect={setActiveCategory}
          />

          <div className="flex flex-col gap-2 flex-1 min-w-0">
            {categories.map(cat => (
              <CategoryCard
                key={cat.id}
                cat={cat}
                isActive={activeCategory === cat.id}
                onSelect={setActiveCategory}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Asset list */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between mb-1">
          <span
            className="text-xs font-medium tracking-[0.15em] uppercase"
            style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.65rem' }}
          >
            {activeCategory
              ? `${categories.find(c => c.id === activeCategory)?.label} Holdings`
              : 'Recent Holdings'}
          </span>
          <span
            className="text-xs"
            style={{ color: 'rgba(255,255,255,0.2)' }}
          >
            {filteredAssets.length} items
          </span>
        </div>
        {filteredAssets.map(asset => (
          <AssetRow key={asset.id} asset={asset} />
        ))}
      </div>
    </div>
  )
}