import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDashboard } from '../hooks/useDashboard'

const NAV_ITEMS = [
  {
    path: '/',
    label: 'Dashboard',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="2" width="8" height="8" rx="2" fill={active ? '#f59e0b' : 'none'} stroke={active ? '#f59e0b' : 'rgba(255,255,255,0.4)'} strokeWidth="1.5" />
        <rect x="12" y="2" width="8" height="8" rx="2" fill={active ? 'rgba(245,158,11,0.3)' : 'none'} stroke={active ? '#f59e0b' : 'rgba(255,255,255,0.4)'} strokeWidth="1.5" />
        <rect x="2" y="12" width="8" height="8" rx="2" fill={active ? 'rgba(245,158,11,0.3)' : 'none'} stroke={active ? '#f59e0b' : 'rgba(255,255,255,0.4)'} strokeWidth="1.5" />
        <rect x="12" y="12" width="8" height="8" rx="2" fill="none" stroke={active ? '#f59e0b' : 'rgba(255,255,255,0.4)'} strokeWidth="1.5" />
      </svg>
    )
  },
  {
    path: '/funnels',
    label: 'Funnels',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M3 4h16l-6 7v6l-4-2V11L3 4z" fill={active ? 'rgba(245,158,11,0.25)' : 'none'} stroke={active ? '#f59e0b' : 'rgba(255,255,255,0.4)'} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    path: '/links',
    label: 'Links',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M9 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke={active ? '#f59e0b' : 'rgba(255,255,255,0.4)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 9a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke={active ? '#f59e0b' : 'rgba(255,255,255,0.4)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { metrics } = useDashboard()

  return (
    <nav
      className="bottom-nav glass"
      style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(6,6,8,0.92)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)'
      }}
    >
      <div className="flex items-center justify-around px-4 pt-3 pb-2">
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center gap-1 min-w-[60px] py-1 transition-all duration-200"
              style={{ opacity: active ? 1 : 0.5 }}
            >
              <div className="relative">
                {item.icon(active)}
                {item.path === '/funnels' && metrics.activeFunnels > 0 && (
                  <span
                    className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-obsidian-950 font-bold"
                    style={{
                      width: 14,
                      height: 14,
                      fontSize: 9,
                      background: '#f59e0b',
                      color: '#060608'
                    }}
                  >
                    {metrics.activeFunnels}
                  </span>
                )}
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: active ? 600 : 400,
                  color: active ? '#f59e0b' : 'rgba(255,255,255,0.4)',
                  letterSpacing: '0.04em'
                }}
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