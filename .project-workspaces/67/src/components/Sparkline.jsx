import React from 'react'

export default function Sparkline({ data, width = 160, height = 40, positive = true }) {
  if (!data || data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((val - min) / range) * (height - 6) - 3
    return [x, y]
  })

  const pathD = points.reduce((acc, [x, y], i) => {
    if (i === 0) return `M ${x} ${y}`
    const [px, py] = points[i - 1]
    const cpx = (px + x) / 2
    return `${acc} C ${cpx} ${py}, ${cpx} ${y}, ${x} ${y}`
  }, '')

  // Fill path — close the curve at the bottom
  const lastPoint = points[points.length - 1]
  const firstPoint = points[0]
  const fillD = `${pathD} L ${lastPoint[0]} ${height} L ${firstPoint[0]} ${height} Z`

  const strokeColor = positive ? '#d4a017' : '#9b6b6b'
  const gradientId = `spark-gradient-${Math.random().toString(36).slice(2, 7)}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.35" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Fill area under curve */}
      <path d={fillD} fill={`url(#${gradientId})`} />

      {/* Main sparkline */}
      <path
        d={pathD}
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* End dot */}
      <circle
        cx={lastPoint[0]}
        cy={lastPoint[1]}
        r="2.5"
        fill={strokeColor}
        style={{
          filter: `drop-shadow(0 0 4px ${strokeColor})`
        }}
      />
    </svg>
  )
}