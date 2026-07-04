import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

type NavItem = {
  path: string
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Funnels', icon: '⚡' },
  { path: '/metrics', label: 'Metrics', icon: '◎' },
  { path: '/links', label: 'Links', icon: '⊕' },
]

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-glass-border backdrop-blur-glass"
      style={{
        background: 'rgba(10,10,15,0.92)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-center justify-around px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-label={`Navigate to ${item.label}`}
              aria-current={isActive ? 'page' : undefined}
              className="flex flex-col items-center gap-1 px-6 py-2 rounded-2xl transition-all duration-200 active:scale-90"
              style={{
                background: isActive ? 'rgba(196,151,72,0.1)' : 'transparent',
              }}
            >
              <span
                className={`text-xl transition-all duration-200 ${
                  isActive ? 'opacity-100' : 'opacity-30'
                }`}
              >
                {item.icon}
              </span>
              <span
                className={`text-xs font-medium tracking-wide transition-all duration-200 ${
                  isActive ? 'text-amber-gold' : 'text-white/30'
                }`}
              >
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}