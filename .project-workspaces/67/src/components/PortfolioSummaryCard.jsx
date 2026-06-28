import React from 'react'
import Sparkline from './Sparkline'
import { portfolioSummary, sparklineData } from '../data/mockPortfolio'

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

export default function PortfolioSummaryCard() {
  const { totalValue, change24h, changePercent24h, lastUpdated } = portfolioSummary
  const isPositive = change24h >= 0

  return (
    <div
      className="glass-gold glow-gold rounded-2xl p-6 animate-fade-up"
      style={{ animationDelay: '0ms' }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <span
          className="text-xs font-medium tracking-[0.2em] uppercase"
          style={{ color: 'rgba(232, 188, 90, 0.6)' }}
        >
          Total Portfolio Value
        </span>
        <span
          className="text-xs"
          style={{ color: 'rgba(255,255,255,0.25)' }}
        >
          Updated {lastUpdated}
        </span>
      </div>

      {/* Main value */}
      <div className="flex items-end justify-between mt-3 mb-4">
        <div>
          <h1
            className="font-display text-gradient-gold leading-none"
            style={{ fontSize: 'clamp(2.4rem, 10vw, 3.5rem)', letterSpacing: '-0.02em' }}
          >
            {formatCurrency(totalValue)}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <span
              className="text-sm font-medium"
              style={{ color: isPositive ? '#7ec87e' : '#c87e7e' }}
            >
              {isPositive ? '▲' : '▼'} {formatCurrency(Math.abs(change24h))}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: isPositive ? 'rgba(126, 200, 126, 0.1)' : 'rgba(200, 126, 126, 0.1)',
                border: isPositive ? '1px solid rgba(126, 200, 126, 0.25)' : '1px solid rgba(200, 126, 126, 0.25)',
                color: isPositive ? '#7ec87e' : '#c87e7e'
              }}
            >
              {isPositive ? '+' : ''}{changePercent24h.toFixed(2)}%
            </span>
            <span
              className="text-xs"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              24h
            </span>
          </div>
        </div>

        {/* Sparkline */}
        <div className="flex flex-col items-end gap-1">
          <Sparkline
            data={sparklineData}
            width={140}
            height={44}
            positive={isPositive}
          />
          <span
            className="text-xs"
            style={{ color: 'rgba(212, 160, 23, 0.4)' }}
          >
            24hr trend
          </span>
        </div>
      </div>

      {/* Divider */}
      <div
        style={{
          height: '1px',
          background: 'linear-gradient(90deg, rgba(212,160,23,0.25) 0%, rgba(212,160,23,0.05) 100%)'
        }}
      />

      {/* Bottom stats row */}
      <div className="flex justify-between mt-4">
        <Stat label="Assets" value="22" />
        <Stat label="Categories" value="3" />
        <Stat label="Best Performer" value="+34.2%" highlight />
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-xs tracking-wide uppercase"
        style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.65rem' }}
      >
        {label}
      </span>
      <span
        className="text-sm font-semibold"
        style={{ color: highlight ? '#d4a017' : 'rgba(255,255,255,0.8)' }}
      >
        {value}
      </span>
    </div>
  )
}