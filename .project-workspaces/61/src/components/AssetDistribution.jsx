import React from 'react'

const CATEGORIES = [
  {
    key: 'watches',
    label: 'Timepieces',
    icon: '⌚',
    color: '#d4a017',
    glowColor: 'rgba(212,160,23,0.2)',
    borderColor: 'rgba(212,160,23,0.25)',
    bgColor: 'rgba(212,160,23,0.06)'
  },
  {
    key: 'fashion',
    label: 'Fashion',
    icon: '👜',
    color: '#8ab4d4',
    glowColor: 'rgba(138,180,212,0.15)',
    borderColor: 'rgba(138,180,212,0.2)',
    bgColor: 'rgba(138,180,212,0.05)'
  },
  {
    key: 'art',
    label: 'Fine Art',
    icon: '🎨',
    color: '#b48dd4',
    glowColor: 'rgba(180,141,212,0.15)',
    borderColor: 'rgba(180,141,212,0.2)',
    bgColor: 'rgba(180,141,212,0.05)'
  }
]

function formatCompact(value) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value}`
}

function CategoryShape({ category, value, total, active, onPress }) {
  const cat = CATEGORIES.find(c => c.key === category)
  if (!cat || !value) return null

  const pct = ((value / total) * 100).toFixed(0)
  const isActive = active === null || active === category

  return (
    <button
      onClick={onPress}
      className="press-effect flex-1 flex flex-col items-center gap-2 py-4 px-2 rounded-2xl transition-all duration-300"
      style={{
        background: active === category ? cat.bgColor : 'rgba(255,255,255,0.02)',
        border: `1px solid ${active === category ? cat.borderColor : 'rgba(255,255,255,0.05)'}`,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: active === category
          ? `0 0 20px ${cat.glowColor}, 0 8px 24px rgba(0,0,0,0.3)`
          : '0 4px 16px rgba(0,0,0,0.2)',
        opacity: isActive ? 1 : 0.4,
        transform: active === category ? 'scale(1.02)' : 'scale(1)'
      }}
    >
      {/* Icon in frosted circle */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{
          background: `radial-gradient(circle, ${cat.bgColor} 0%, transparent 70%)`,
          border: `1px solid ${cat.borderColor}`,
          fontSize: '18px'
        }}
      >
        {cat.icon}
      </div>

      {/* Category label */}
      <span
        className="text-xs font-medium tracking-wide"
        style={{
          color: active === category ? cat.color : 'rgba(255,255,255,0.4)',
          fontSize: '10px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase'
        }}
      >
        {cat.label}
      </span>

      {/* Value */}
      <span
        className="font-medium"
        style={{
          fontSize: '14px',
          color: active === category ? cat.color : 'rgba(255,255,255,0.7)',
          fontVariantNumeric: 'tabular-nums'
        }}
      >
        {formatCompact(value)}
      </span>

      {/* Percentage bar */}
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: '2px', background: 'rgba(255,255,255,0.06)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${cat.color}88, ${cat.color})`,
            boxShadow: `0 0 6px ${cat.glowColor}`
          }}
        />
      </div>

      {/* Percentage label */}
      <span
        style={{
          fontSize: '9px',
          color: active === category ? cat.color : 'rgba(255,255,255,0.25)',
          letterSpacing: '0.06em'
        }}
      >
        {pct}%
      </span>
    </button>
  )
}

export default function AssetDistribution({ categoryTotals, totalValue, activeCategory, onCategorySelect }) {
  function handlePress(key) {
    onCategorySelect(prev => prev === key ? null : key)
  }

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: 'rgba(12,15,26,0.7)',
        border: '1px solid rgba(255,255,255,0.05)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)'
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-xs uppercase tracking-widest"
          style={{ color: 'rgba(255,255,255,0.25)', fontSize: '9px', letterSpacing: '0.18em' }}
        >
          Asset Distribution
        </span>
        {activeCategory && (
          <button
            onClick={() => onCategorySelect(null)}
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              color: 'rgba(212,160,23,0.7)',
              border: '1px solid rgba(212,160,23,0.2)',
              fontSize: '9px',
              letterSpacing: '0.06em'
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {CATEGORIES.map(cat => (
          <CategoryShape
            key={cat.key}
            category={cat.key}
            value={categoryTotals[cat.key] || 0}
            total={totalValue}
            active={activeCategory}
            onPress={() => handlePress(cat.key)}
          />
        ))}
      </div>

      {/* Donut hint — mini visual bar */}
      <div className="flex mt-3 rounded-full overflow-hidden" style={{ height: '3px' }}>
        {CATEGORIES.map(cat => {
          const pct = ((categoryTotals[cat.key] || 0) / totalValue) * 100
          return (
            <div
              key={cat.key}
              className="transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: cat.color,
                opacity: activeCategory === null || activeCategory === cat.key ? 1 : 0.2
              }}
            />
          )
        })}
      </div>
    </div>
  )
}