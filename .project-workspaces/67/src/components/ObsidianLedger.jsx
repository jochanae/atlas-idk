import React, { useState } from 'react'
import PortfolioSummaryCard from './PortfolioSummaryCard'
import AssetDistribution from './AssetDistribution'
import QuickTransaction from './QuickTransaction'

export default function ObsidianLedger() {
  const [activeTab, setActiveTab] = useState('overview')

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'holdings', label: 'Holdings' },
    { id: 'activity', label: 'Activity' }
  ]

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: 'radial-gradient(ellipse 120% 80% at 50% -10%, #0d0e1f 0%, #070709 50%, #050508 100%)',
        minHeight: '100dvh'
      }}
    >
      {/* Ambient background orbs */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: '-20%',
          left: '-10%',
          width: '60%',
          height: '50%',
          background: 'radial-gradient(circle, rgba(212,160,23,0.04) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          bottom: '10%',
          right: '-15%',
          width: '50%',
          height: '40%',
          background: 'radial-gradient(circle, rgba(139,167,199,0.04) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0
        }}
      />

      {/* Header */}
      <header
        className="relative z-10 flex items-center justify-between px-5 pt-12 pb-4"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.04)'
        }}
      >
        <div>
          <h1
            className="font-display tracking-tight"
            style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: '1.05rem',
              fontWeight: 400,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase'
            }}
          >
            The Obsidian
          </h1>
          <span
            className="text-gradient-gold font-display font-semibold block leading-none"
            style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: '1.5rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase'
            }}
          >
            Ledger
          </span>
        </div>

        {/* Status + menu */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full animate-sparkle"
              style={{ background: '#7ec87e', boxShadow: '0 0 6px #7ec87e' }}
            />
            <span
              className="text-xs"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              Live
            </span>
          </div>
          <button
            className="tactile w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="4" r="1.2" fill="rgba(255,255,255,0.4)" />
              <circle cx="8" cy="8" r="1.2" fill="rgba(255,255,255,0.4)" />
              <circle cx="8" cy="12" r="1.2" fill="rgba(255,255,255,0.4)" />
            </svg>
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div
        className="relative z-10 flex items-center gap-1 px-5 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="tactile flex-1 py-2 rounded-xl text-xs font-medium tracking-wide transition-all duration-200"
            style={{
              background: activeTab === tab.id
                ? 'rgba(212, 160, 23, 0.1)'
                : 'transparent',
              border: activeTab === tab.id
                ? '1px solid rgba(212, 160, 23, 0.25)'
                : '1px solid transparent',
              color: activeTab === tab.id
                ? '#d4a017'
                : 'rgba(255,255,255,0.3)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontSize: '0.65rem'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main scroll area */}
      <main
        className="relative z-10 px-5 py-5 flex flex-col gap-6"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 32px)',
          maxWidth: '480px',
          margin: '0 auto'
        }}
      >
        {/* Zone 1: Portfolio Summary */}
        <PortfolioSummaryCard />

        {/* Zone 2: Asset Distribution */}
        <AssetDistribution />

        {/* Divider */}
        <div
          style={{
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(212,160,23,0.15), transparent)'
          }}
        />

        {/* Zone 3: Quick Transaction */}
        <QuickTransaction />

        {/* Bottom signature */}
        <div className="flex items-center justify-center gap-2 pt-2 pb-4">
          <span
            style={{
              color: 'rgba(255,255,255,0.1)',
              fontSize: '0.6rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              fontFamily: 'Cormorant Garamond, Georgia, serif'
            }}
          >
            ✦ Private Portfolio Intelligence ✦
          </span>
        </div>
      </main>
    </div>
  )
}