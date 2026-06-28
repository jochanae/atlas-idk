import React, { useMemo } from 'react'

function Sparkline({ data, width = 200, height = 40 }) {
  const points = useMemo(() => {
    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1
    const stepX = width / (data.length - 1)
    return data.map((v, i) => ({
      x: i * stepX,
      y: height - ((v - min) / range) * height
    }))
  }, [data, width, height])

  const pathD = points.reduce((d, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`
    const prev = points[i - 1]
    const cpx = (prev.x + p.x) / 2
    return `${d} C ${cpx} ${prev.y} ${cpx} ${p.y} ${p.x} ${p.y}`
  }, '')

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L 0 ${height} Z`

  const isUp = data[data.length - 1] >= data[0]
  const lineColor = isUp ? '#d4a017' : '#7c5c1a'
  const gradientId = `spark-gradient-${Math.random().toString(36).slice(2, 7)}`

  const changePercent = (((data[data.length - 1] - data[0]) / data[0]) * 100).toFixed(2)

  return (
    <div className="flex items-end gap-3">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#${gradientId})`} />
        <path
          d={pathD}
          fill="none"
          stroke={lineColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Last point dot */}
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="2.5"
          fill={lineColor}
        />
      </svg>
      <div className="flex flex-col items-end pb-1">
        <span
          className="text-xs font-medium"
          style={{ color: isUp ? '#d4a017' : '#9a7040', fontSize: '11px' }}
        >
          {isUp ? '+' : ''}{changePercent}%
        </span>
        <span
          className="text-xs"
          style={{ color: 'rgba(255,255,255,0.25)', fontSize: '9px', letterSpacing: '0.06em' }}
        >
          24H
        </span>
      </div>
    </div>
  )
}

function formatCurrency(value) {
  if (value >= 1_000_000) {
    return {
      main: `$${(value / 1_000_000).toFixed(2)}`,
      suffix: 'M'
    }
  }
  return {
    main: `$${value.toLocaleString('en-US')}`,
    suffix: ''
  }
}

export default function PortfolioSummary({ totalValue, sparklineData, assets }) {
  const { main, suffix } = formatCurrency(totalValue)

  const totalGain = assets.reduce((sum, a) => sum + (a.value - a.acquiredAt), 0)
  const gainPercent = ((totalGain / assets.reduce((s, a) => s + a.acquiredAt, 0)) * 100).toFixed(1)
  const isGain = totalGain >= 0

  const assetCount = assets.length

  return (
    <div
      className="relative rounded-3xl overflow-hidden p-6 glow-ambient"
      style={{
        background: 'linear-gradient(145deg, rgba(18,22,38,0.9) 0%, rgba(12,15,26,0.95) 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)'
      }}
    >
      {/* Decorative corner accent */}
      <div
        className="absolute top-0 right-0 w-32 h-32 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at top right, rgba(212,160,23,0.06) 0%, transparent 60%)'
        }}
      />

      {/* Label */}
      <div className="flex items-center justify-between mb-1">
        <span
          className="text-xs tracking-widest uppercase"
          style={{ color: 'rgba(255,255,255,0.3)', fontSize: '9px', letterSpacing: '0.18em' }}
        >
          Total Portfolio Value
        </span>
        <span
          className="text-xs"
          style={{ color: 'rgba(255,255,255,0.2)', fontSize: '9px' }}
        >
          {assetCount} assets
        </span>
      </div>

      {/* Main value */}
      <div className="flex items-baseline gap-1 mt-1 mb-4">
        <span
          className="font-display text-gold-gradient"
          style={{
            fontSize: 'clamp(36px, 10vw, 52px)',
            fontWeight: 600,
            lineHeight: 1,
            background: 'linear-gradient(135deg, #f5d98b 0%, #d4a017 45%, #c49010 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}
        >
          {main}
        </span>
        {suffix && (
          <span
            className="font-display"
            style={{
              fontSize: '28px',
              fontWeight: 400,
              background: 'linear-gradient(135deg, #f5d98b 0%, #d4a017 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              opacity: 0.8
            }}
          >
            {suffix}
          </span>
        )}
      </div>

      {/* Sparkline */}
      <Sparkline data={sparklineData} width={220} height={44} />

      {/* Divider */}
      <div
        className="mt-4 mb-3"
        style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)' }}
      />

      {/* Stats row */}
      <div className="flex items-center justify-between">
        <div>
          <p
            className="text-xs mb-0.5"
            style={{ color: 'rgba(255,255,255,0.25)', fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase' }}
          >
            Unrealised Gain
          </p>
          <p
            className="font-medium"
            style={{
              fontSize: '15px',
              color: isGain ? '#d4a017' : '#9a7040',
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {isGain ? '+' : ''}{formatCurrency(Math.abs(totalGain)).main}{formatCurrency(Math.abs(totalGain)).suffix}
            <span
              className="ml-1.5 text-xs"
              style={{ opacity: 0.7, fontSize: '11px' }}
            >
              ({isGain ? '+' : ''}{gainPercent}%)
            </span>
          </p>
        </div>

        <div className="text-right">
          <p
            className="text-xs mb-0.5"
            style={{ color: 'rgba(255,255,255,0.25)', fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase' }}
          >
            Cost Basis
          </p>
          <p
            className="font-medium"
            style={{ fontSize: '15px', color: 'rgba(255,255,255,0.5)' }}
          >
            {formatCurrency(assets.reduce((s, a) => s + a.acquiredAt, 0)).main}{formatCurrency(assets.reduce((s, a) => s + a.acquiredAt, 0)).suffix}
          </p>
        </div>
      </div>
    </div>
  )
}