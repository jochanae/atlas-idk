import React from 'react'
import { useNavigate } from 'react-router-dom'

const CATEGORY_COLORS = {
  'Watches': '#fbbf24',
  'Fine Art': '#a78bfa',
  'Fashion': '#f472b6'
}

function formatCurrency(value) {
  if (value >= 1_000_000) return '$' + (value / 1_000_000).toFixed(2) + 'M'
  return '$' + value.toLocaleString('en-US')
}

function CategoryDot({ category }) {
  const color = CATEGORY_COLORS[category] || '#888'
  return (
    <span
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color,
        marginRight: 5,
        boxShadow: `0 0 4px ${color}80`,
        flexShrink: 0
      }}
    />
  )
}

export default function AssetList({ assets }) {
  const navigate = useNavigate()

  if (assets.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: 'rgba(255,255,255,0.2)' }}>
        <p style={{ fontSize: 13 }}>No assets in this category</p>
        <p style={{ fontSize: 11, marginTop: 4 }}>Add one via Quick Transaction below</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {assets.map((asset, i) => {
        const color = CATEGORY_COLORS[asset.category] || '#888'
        const isUp = asset.change24h >= 0

        return (
          <div key={asset.id}>
            <div
              className="asset-row"
              onClick={() => navigate(`/assets/${asset.id}`)}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {/* Left */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3 }}>
                    <CategoryDot category={asset.category} />
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: '#e8e8f0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.3
                      }}
                    >
                      {asset.name}
                    </p>
                  </div>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 11 }}>
                    {asset.category} · {asset.acquired}
                  </p>
                </div>

                {/* Right */}
                <div style={{ textAlign: 'right', marginLeft: 12, flexShrink: 0 }}>
                  <p
                    className="value-display"
                    style={{ fontSize: 13, color: '#e8e8f0', lineHeight: 1.3 }}
                  >
                    {formatCurrency(asset.value)}
                  </p>
                  {asset.change24h !== 0 && (
                    <span className={isUp ? 'trend-up' : 'trend-down'} style={{ fontSize: 10 }}>
                      {isUp ? '+' : ''}{asset.change24h}%
                    </span>
                  )}
                </div>

                {/* Chevron — now signals navigation, not expand */}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  style={{
                    marginLeft: 8,
                    flexShrink: 0,
                    color: 'rgba(255,255,255,0.2)',
                    transform: 'rotate(-90deg)'
                  }}
                >
                  <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            {/* Divider */}
            {i < assets.length - 1 && (
              <div
                style={{
                  height: 1,
                  background: 'rgba(255,255,255,0.04)',
                  margin: '0 0'
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
