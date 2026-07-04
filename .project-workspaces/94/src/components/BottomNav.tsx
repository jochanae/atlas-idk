import React from 'react'

export type NavTab = 'dashboard' | 'funnels' | 'links' | 'settings'

interface Props {
  active: NavTab
  onChange: (tab: NavTab) => void
}

const TABS: { id: NavTab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Overview', icon: '◈' },
  { id: 'funnels', label: 'Funnels', icon: '⟁' },
  { id: 'links', label: 'Links', icon: '⊕' },
  { id: 'settings', label: 'Settings', icon: '◉' },
]

export default function BottomNav({ active, onChange }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: 'rgba(10, 10, 15, 0.92)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-center justify-around px-2 py-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-xl transition-all active:scale-95 min-w-[64px] ${
              active === tab.id ? 'nav-item-active' : 'nav-item'
            }`}
            aria-label={tab.label}
            aria-current={active === tab.id ? 'page' : undefined}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span
              className="text-xs font-medium tracking-wide"
              style={{ fontSize: '10px' }}
            >
              {tab.label}
            </span>
            {active === tab.id && (
              <span
                className="absolute bottom-0 w-1 h-1 rounded-full bg-amber-400"
                style={{ position: 'relative', marginTop: '-2px' }}
              />
            )}
          </button>
        ))}
      </div>
    </nav>
  )
}