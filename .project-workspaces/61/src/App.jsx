import React, { useState, useRef, useEffect, useCallback } from 'react'

// ─── Mock Data ──────────────────────────────────────────────────────────────

const SPARKLINE_DATA = [
  2.1, 2.3, 2.2, 2.5, 2.4, 2.6, 2.8, 2.7, 2.9, 3.0,
  2.8, 3.1, 3.3, 3.2, 3.5, 3.4, 3.6, 3.8, 3.7, 3.9,
  3.8, 4.0, 4.2, 4.1, 4.3, 4.5, 4.4, 4.6, 4.8, 4.72
]

const CATEGORIES = [
  { id: 'all', label: 'All Assets', count: 12 },
  { id: 'art', label: 'Fine Art', count: 4 },
  { id: 'watches', label: 'Watches', count: 5 },
  { id: 'fashion', label: 'Fashion', count: 3 },
]

const ASSETS = [
  {
    id: 1,
    category: 'watches',
    name: 'Patek Philippe Nautilus',
    detail: '5711/1A-010 · 2019',
    value: 185000,
    change: +12.4,
    acquired: 'Mar 2021',
    icon: '⌚',
    accentColor: 'rgba(212,160,23,0.9)'
  },
  {
    id: 2,
    category: 'art',
    name: 'Basquiat Study No. 4',
    detail: 'Acrylic on canvas · 1983',
    value: 340000,
    change: +28.1,
    acquired: 'Nov 2019',
    icon: '🎨',
    accentColor: 'rgba(180,140,255,0.9)'
  },
  {
    id: 3,
    category: 'fashion',
    name: '1986 Chanel Classic Flap',
    detail: 'Black caviar leather · Medium',
    value: 12800,
    change: +18.7,
    acquired: 'Aug 2022',
    icon: '👜',
    accentColor: 'rgba(212,160,23,0.9)'
  },
  {
    id: 4,
    category: 'watches',
    name: 'Rolex Daytona Paul Newman',
    detail: '6239 · Ref. 1969',
    value: 510000,
    change: +41.2,
    acquired: 'Jan 2020',
    icon: '⌚',
    accentColor: 'rgba(212,160,23,0.9)'
  },
  {
    id: 5,
    category: 'art',
    name: 'Hockney Pool Study',
    detail: 'Lithograph · Signed · 1978',
    value: 95000,
    change: -3.2,
    acquired: 'Jun 2021',
    icon: '🖼️',
    accentColor: 'rgba(100,180,255,0.9)'
  },
  {
    id: 6,
    category: 'fashion',
    name: 'Hermès Birkin 35',
    detail: 'Togo leather · Gold hw · 2007',
    value: 28500,
    change: +22.3,
    acquired: 'Dec 2020',
    icon: '👜',
    accentColor: 'rgba(212,160,23,0.9)'
  },
  {
    id: 7,
    category: 'watches',
    name: 'AP Royal Oak Offshore',
    detail: '26400SO · Tourbillon',
    value: 148000,
    change: +9.8,
    acquired: 'Feb 2022',
    icon: '⌚',
    accentColor: 'rgba(212,160,23,0.9)'
  },
  {
    id: 8,
    category: 'art',
    name: 'Koons Balloon Dog (Blue)',
    detail: 'Mirror-polished steel · 1994',
    value: 680000,
    change: +52.4,
    acquired: 'Oct 2018',
    icon: '🎨',
    accentColor: 'rgba(100,180,255,0.9)'
  },
  {
    id: 9,
    category: 'watches',
    name: 'Vacheron Overseas Dual Time',
    detail: '7900V/110A · 2020',
    value: 42000,
    change: +6.1,
    acquired: 'Sep 2022',
    icon: '⌚',
    accentColor: 'rgba(212,160,23,0.9)'
  },
  {
    id: 10,
    category: 'art',
    name: 'Kusama Infinity Dots',
    detail: 'Silkscreen · Ed. 45/100 · 2010',
    value: 125000,
    change: +33.8,
    acquired: 'Jul 2020',
    icon: '🎨',
    accentColor: 'rgba(255,140,100,0.9)'
  },
  {
    id: 11,
    category: 'fashion',
    name: 'Louis Vuitton Speedy 30',
    detail: 'Monogram Canvas · Vintage 1988',
    value: 4500,
    change: +11.2,
    acquired: 'Apr 2023',
    icon: '👜',
    accentColor: 'rgba(212,160,23,0.9)'
  },
  {
    id: 12,
    category: 'watches',
    name: 'F.P. Journe Chronomètre',
    detail: 'Bleu · Platinum · 2017',
    value: 225000,
    change: +18.9,
    acquired: 'May 2021',
    icon: '⌚',
    accentColor: 'rgba(212,160,23,0.9)'
  }
]

const CATEGORY_BREAKDOWN = [
  { id: 'art', label: 'Fine Art', value: 1240000, pct: 57, color: 'rgba(180,140,255,0.85)' },
  { id: 'watches', label: 'Watches', value: 1110000, pct: 51, color: 'rgba(212,160,23,0.85)' },
  { id: 'fashion', label: 'Fashion', value: 45800, pct: 2, color: 'rgba(100,180,255,0.7)' },
]

// ─── Utilities ───────────────────────────────────────────────────────────────

const fmt = (n) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toLocaleString()}`
}

const fmtFull = (n) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0 })

// ─── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({ data, width = 180, height = 44 }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - min) / range) * (height - 8) - 4
  }))

  const linePath = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')

  const fillPath = `${linePath} L${width},${height} L0,${height} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} overflow="visible">
      <defs>
        <linearGradient id="sparkGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#b8860b" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#f5d485" stopOpacity="1" />
          <stop offset="100%" stopColor="#d4a017" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="sparkFill" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#d4a017" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#d4a017" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} className="sparkline-fill" />
      <path d={linePath} className="sparkline-path" />
      {/* Live dot */}
      <circle
        cx={pts[pts.length - 1].x}
        cy={pts[pts.length - 1].y}
        r={3}
        fill="#f5d485"
        style={{ filter: 'drop-shadow(0 0 4px rgba(245,212,133,0.8))' }}
      />
    </svg>
  )
}

// ─── Distribution Bar ─────────────────────────────────────────────────────────

function DistributionZone({ assets, activeCategory }) {
  const filtered = activeCategory === 'all'
    ? assets
    : assets.filter(a => a.category === activeCategory)

  const total = filtered.reduce((s, a) => s + a.value, 0)

  const byCategory = CATEGORY_BREAKDOWN.map(cat => {
    const catAssets = filtered.filter(a => a.category === cat.id)
    const catValue = catAssets.reduce((s, a) => s + a.value, 0)
    return { ...cat, value: catValue, pct: total > 0 ? Math.round((catValue / total) * 100) : 0, count: catAssets.length }
  }).filter(c => c.count > 0)

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-light tracking-widest text-white/40 uppercase">
          Distribution
        </span>
        <span className="text-xs text-white/25 tracking-wider">
          {filtered.length} assets
        </span>
      </div>

      {/* Frosted bar */}
      <div className="flex rounded-xl overflow-hidden h-3 gap-px">
        {byCategory.map(cat => (
          <div
            key={cat.id}
            style={{
              width: `${cat.pct}%`,
              background: cat.color,
              boxShadow: `0 0 8px ${cat.color}`,
              transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {byCategory.map(cat => (
          <div key={cat.id} className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: cat.color, boxShadow: `0 0 6px ${cat.color}` }}
            />
            <div className="flex flex-col">
              <span className="text-white/60 text-xs">{cat.label}</span>
              <span style={{ color: cat.color }} className="text-xs font-mono">{fmt(cat.value)}</span>
            </div>
            <span className="text-white/25 text-xs ml-auto">{cat.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Asset Card ───────────────────────────────────────────────────────────────

function AssetCard({ asset, index }) {
  const isPositive = asset.change >= 0

  return (
    <div
      className="glass tactile rounded-xl p-3.5 flex items-center gap-3"
      style={{
        animationDelay: `${index * 60}ms`,
      }}
    >
      {/* Icon blob */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
        style={{
          background: `radial-gradient(circle at 35% 35%, ${asset.accentColor.replace('0.9', '0.15')}, rgba(255,255,255,0.03))`,
          border: `1px solid ${asset.accentColor.replace('0.9', '0.2')}`,
        }}
      >
        {asset.icon}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="font-display text-white/90 text-sm font-light leading-tight truncate">
          {asset.name}
        </p>
        <p className="text-white/30 text-xs mt-0.5 truncate tracking-wide">
          {asset.detail}
        </p>
      </div>

      {/* Value + change */}
      <div className="text-right flex-shrink-0">
        <p
          className="font-mono text-sm font-light"
          style={{ color: '#e8c468' }}
        >
          {fmt(asset.value)}
        </p>
        <p
          className="text-xs mt-0.5"
          style={{ color: isPositive ? 'rgba(100,220,120,0.9)' : 'rgba(255,100,100,0.9)' }}
        >
          {isPositive ? '↑' : '↓'} {Math.abs(asset.change)}%
        </p>
      </div>
    </div>
  )
}

// ─── Quick Transaction Input ──────────────────────────────────────────────────

function QuickTransaction({ onAdd }) {
  const [value, setValue] = useState('')
  const [status, setStatus] = useState(null) // null | 'processing' | 'success' | 'error'
  const [parsedPreview, setParsedPreview] = useState(null)
  const inputRef = useRef(null)

  const parseInput = useCallback((text) => {
    if (!text.trim()) return null
    const valueMatch = text.match(/\$?([\d,]+(?:\.\d{1,2})?)/i)
    const parsedValue = valueMatch
      ? parseInt(valueMatch[1].replace(/,/g, ''), 10)
      : null

    const categoryMatch =
      /watch|rolex|patek|ap |omega/i.test(text) ? 'watches' :
      /art|painting|canvas|print|sculpture/i.test(text) ? 'art' :
      /bag|tote|chanel|hermès|hermes|louis|purse|fashion/i.test(text) ? 'fashion' :
      null

    return parsedValue ? { value: parsedValue, category: categoryMatch } : null
  }, [])

  const handleChange = (e) => {
    const t = e.target.value
    setValue(t)
    if (t.length > 4) {
      setParsedPreview(parseInput(t))
    } else {
      setParsedPreview(null)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!value.trim() || status === 'processing') return

    setStatus('processing')
    setTimeout(() => {
      const parsed = parseInput(value)
      if (parsed) {
        setStatus('success')
        onAdd({ text: value, ...parsed })
        setTimeout(() => {
          setValue('')
          setParsedPreview(null)
          setStatus(null)
        }, 1200)
      } else {
        setStatus('error')
        setTimeout(() => setStatus(null), 2000)
      }
    }, 800)
  }

  const placeholders = [
    'Add Patek 5726A, £38,000…',
    'Add vintage 1986 Chanel tote, $4,500…',
    'Log Basquiat print, valued at $92K…',
    'Add Rolex 16750 GMT, $28,500…'
  ]

  const [phIndex] = useState(() => Math.floor(Math.random() * placeholders.length))

  return (
    <div className="glass-gold rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-light tracking-widest text-white/40 uppercase">
          Quick Entry
        </span>
        {parsedPreview && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-white/30">Detected:</span>
            <span style={{ color: '#e8c468' }} className="font-mono">
              {fmt(parsedPreview.value)}
            </span>
            {parsedPreview.category && (
              <span className="text-white/40 capitalize">{parsedPreview.category}</span>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="relative">
        <div
          className="relative rounded-xl overflow-hidden"
          style={{
            background: 'rgba(0,0,0,0.35)',
            border: status === 'success'
              ? '1px solid rgba(100,220,120,0.4)'
              : status === 'error'
              ? '1px solid rgba(255,100,100,0.4)'
              : '1px solid rgba(212,160,23,0.15)',
            transition: 'border-color 300ms ease'
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleChange}
            placeholder={placeholders[phIndex]}
            className="obsidian-input w-full bg-transparent px-4 py-3.5 pr-14 text-sm text-white/80 placeholder-white/20 font-mono"
            style={{ fontSize: '14px', letterSpacing: '0.02em' }}
            disabled={status === 'processing' || status === 'success'}
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />

          {/* Submit button */}
          <button
            type="submit"
            className="tactile absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center"
            style={{
              background: status === 'success'
                ? 'rgba(100,220,120,0.2)'
                : 'rgba(212,160,23,0.15)',
              border: status === 'success'
                ? '1px solid rgba(100,220,120,0.4)'
                : '1px solid rgba(212,160,23,0.3)',
              transition: 'all 300ms ease'
            }}
            disabled={!value.trim() || status === 'processing'}
          >
            {status === 'processing' ? (
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(212,160,23,0.3)" strokeWidth="2" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#d4a017" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : status === 'success' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="rgba(100,220,120,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="rgba(212,160,23,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>

        {status === 'error' && (
          <p className="text-xs mt-2 px-1" style={{ color: 'rgba(255,100,100,0.8)' }}>
            Could not parse value — include a price like "$4,500" or "£38K"
          </p>
        )}

        {status === 'success' && (
          <p className="text-xs mt-2 px-1" style={{ color: 'rgba(100,220,120,0.8)' }}>
            Asset logged to ledger
          </p>
        )}
      </form>

      <p className="text-white/20 text-xs tracking-wider">
        Natural language · Watches · Art · Fashion · Currency aware
      </p>
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header() {
  const now = new Date()
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="flex items-start justify-between pt-1">
      <div>
        <h1
          className="font-display text-white/90 font-light leading-none"
          style={{ fontSize: '22px', letterSpacing: '0.04em' }}
        >
          The Obsidian
        </h1>
        <h1
          className="font-display gold-shimmer font-light leading-none mt-0.5"
          style={{ fontSize: '22px', letterSpacing: '0.04em' }}
        >
          Ledger
        </h1>
      </div>
      <div className="text-right">
        <p className="font-mono text-white/60 text-xs">{time}</p>
        <p className="font-mono text-white/25 text-xs mt-0.5">{date}</p>
        <div className="flex items-center justify-end gap-1 mt-1.5">
          <div
            className="dot-pulse w-1.5 h-1.5 rounded-full"
            style={{ background: 'rgba(100,220,120,0.9)', boxShadow: '0 0 4px rgba(100,220,120,0.6)' }}
          />
          <span className="text-white/25 text-xs">Live</span>
        </div>
      </div>
    </div>
  )
}

// ─── Portfolio Summary Card ───────────────────────────────────────────────────

function SummaryCard({ assets }) {
  const total = assets.reduce((s, a) => s + a.value, 0)
  const avgChange = assets.reduce((s, a) => s + a.change, 0) / assets.length
  const isUp = avgChange >= 0

  const dayChange = total * (avgChange / 100)

  return (
    <div
      className="rounded-2xl p-5 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(212,160,23,0.08) 0%, rgba(255,255,255,0.03) 50%, rgba(10,8,20,0.6) 100%)',
        backdropFilter: 'blur(32px) saturate(200%)',
        WebkitBackdropFilter: 'blur(32px) saturate(200%)',
        border: '1px solid rgba(212,160,23,0.2)',
        boxShadow: '0 0 40px rgba(212,160,23,0.08), inset 0 1px 0 rgba(212,160,23,0.15), 0 30px 60px rgba(0,0,0,0.5)'
      }}
    >
      {/* Ambient glow orb */}
      <div
        className="ambient-orb"
        style={{
          width: 180, height: 180,
          top: -60, right: -40,
          background: 'radial-gradient(circle, rgba(212,160,23,0.12), transparent 70%)'
        }}
      />

      <div className="relative z-10">
        <p className="text-white/35 text-xs tracking-widest uppercase font-mono mb-3">
          Total Portfolio Value
        </p>

        {/* Main value */}
        <div
          className="font-display gold-shimmer font-light leading-none mb-1"
          style={{ fontSize: 'clamp(36px, 9vw, 48px)', letterSpacing: '-0.01em' }}
        >
          {fmtFull(total)}
        </div>

        {/* Day change */}
        <div className="flex items-center gap-2 mt-2 mb-4">
          <span
            className="text-sm font-mono"
            style={{ color: isUp ? 'rgba(100,220,120,0.9)' : 'rgba(255,100,100,0.9)' }}
          >
            {isUp ? '▲' : '▼'} {fmt(Math.abs(dayChange))} today
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-mono"
            style={{
              background: isUp ? 'rgba(100,220,120,0.1)' : 'rgba(255,100,100,0.1)',
              border: isUp ? '1px solid rgba(100,220,120,0.2)' : '1px solid rgba(255,100,100,0.2)',
              color: isUp ? 'rgba(100,220,120,0.9)' : 'rgba(255,100,100,0.9)'
            }}
          >
            {isUp ? '+' : ''}{avgChange.toFixed(1)}%
          </span>
        </div>

        {/* Sparkline row */}
        <div className="flex items-end justify-between gap-3">
          <div className="flex-1">
            <Sparkline data={SPARKLINE_DATA} width={180} height={44} />
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-white/25 text-xs">24h high</p>
            <p className="font-mono text-xs" style={{ color: '#e8c468' }}>
              {fmtFull(total * 1.031)}
            </p>
            <p className="text-white/25 text-xs mt-1">24h low</p>
            <p className="font-mono text-xs text-white/50">
              {fmtFull(total * 0.986)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Category Filter ──────────────────────────────────────────────────────────

function CategoryFilter({ active, onChange, assets }) {
  const counts = {
    all: assets.length,
    art: assets.filter(a => a.category === 'art').length,
    watches: assets.filter(a => a.category === 'watches').length,
    fashion: assets.filter(a => a.category === 'fashion').length,
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
      {CATEGORIES.map(cat => {
        const isActive = active === cat.id
        return (
          <button
            key={cat.id}
            onClick={() => onChange(cat.id)}
            className={`tactile flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-mono transition-all duration-200 ${isActive ? 'pill-active' : ''}`}
            style={{
              background: isActive
                ? 'rgba(212,160,23,0.14)'
                : 'rgba(255,255,255,0.04)',
              border: isActive
                ? '1px solid rgba(212,160,23,0.4)'
                : '1px solid rgba(255,255,255,0.07)',
              color: isActive ? '#e8c468' : 'rgba(255,255,255,0.4)',
            }}
          >
            {cat.label}
            <span
              className="text-xs px-1.5 py-0.5 rounded-full"
              style={{
                background: isActive ? 'rgba(212,160,23,0.2)' : 'rgba(255,255,255,0.06)',
                color: isActive ? '#f5d485' : 'rgba(255,255,255,0.3)',
              }}
            >
              {counts[cat.id]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [assets, setAssets] = useState(ASSETS)
  const [activeCategory, setActiveCategory] = useState('all')
  const [addedIds, setAddedIds] = useState([])

  const filteredAssets = activeCategory === 'all'
    ? assets
    : assets.filter(a => a.category === activeCategory)

  const handleAdd = useCallback(({ text, value, category }) => {
    const categoryMap = {
      watches: { icon: '⌚', accent: 'rgba(212,160,23,0.9)' },
      art: { icon: '🎨', accent: 'rgba(180,140,255,0.9)' },
      fashion: { icon: '👜', accent: 'rgba(212,160,23,0.9)' }
    }
    const cat = category || 'art'
    const { icon, accent } = categoryMap[cat] || categoryMap.art

    // Extract name from text (remove price part)
    const name = text
      .replace(/add\s*/i, '')
      .replace(/,?\s*(?:valued?\s+at\s+|@\s*)?\$?[\d,]+(?:K|M)?/i, '')
      .trim()
      .split(',')[0]
      .trim()

    const newAsset = {
      id: Date.now(),
      category: cat,
      name: name || 'New Asset',
      detail: 'Just added · ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      value,
      change: 0,
      acquired: new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      icon,
      accentColor: accent
    }

    setAssets(prev => [newAsset, ...prev])
    setAddedIds(prev => [...prev, newAsset.id])
    setActiveCategory('all')
  }, [])

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, #0a0b14 0%, #060608 35%, #080a10 70%, #0c0a08 100%)'
      }}
    >
      {/* Deep ambient orbs */}
      <div
        className="ambient-orb"
        style={{
          width: 300, height: 300,
          top: -100, left: -80,
          background: 'radial-gradient(circle, rgba(15,20,50,0.8), transparent 70%)',
          animation: 'drift 12s ease-in-out infinite'
        }}
      />
      <div
        className="ambient-orb"
        style={{
          width: 250, height: 250,
          bottom: 100, right: -80,
          background: 'radial-gradient(circle, rgba(212,160,23,0.06), transparent 70%)',
          animation: 'drift 16s ease-in-out infinite reverse'
        }}
      />

      {/* Scrollable content */}
      <div
        className="relative z-10 h-full overflow-y-auto asset-scroll"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="px-4 pt-12 pb-6 space-y-4 max-w-lg mx-auto">

          {/* Zone 0 — Header */}
          <Header />

          {/* Zone 1 — Portfolio Summary */}
          <SummaryCard assets={assets} />

          {/* Zone 2 — Distribution + Asset List */}
          <div className="space-y-3">
            <DistributionZone assets={assets} activeCategory={activeCategory} />

            {/* Category filter */}
            <CategoryFilter
              active={activeCategory}
              onChange={setActiveCategory}
              assets={assets}
            />

            {/* Asset cards */}
            <div className="space-y-2">
              {filteredAssets.map((asset, i) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  index={i}
                  isNew={addedIds.includes(asset.id)}
                />
              ))}
            </div>
          </div>

          {/* Zone 3 — Quick Transaction */}
          <QuickTransaction onAdd={handleAdd} />

          {/* Bottom rule */}
          <div className="flex items-center gap-3 py-2">
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
            <span className="text-white/15 text-xs font-mono tracking-widest">OL · 2025</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}