import React from 'react'
import type { SocialLink } from '../hooks/useSocialLinks'

interface Props {
  link: SocialLink
  onToggle: (id: string) => void
  onClick: (id: string) => void
}

export default function SocialLinkRow({ link, onToggle, onClick }: Props) {
  return (
    <div
      className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0"
      style={{ opacity: link.active ? 1 : 0.45 }}
    >
      {/* Platform icon */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base"
        style={{ background: link.color }}
      >
        {link.icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0" onClick={() => link.active && onClick(link.id)}>
        <p className="text-white text-sm font-medium">{link.platform}</p>
        <p className="text-white/35 text-xs">{link.handle}</p>
      </div>

      {/* Click count */}
      {link.active && (
        <div className="text-right shrink-0 mr-2">
          <p className="text-amber-400 text-sm font-semibold">
            {link.clicks > 999
              ? `${(link.clicks / 1000).toFixed(1)}k`
              : link.clicks}
          </p>
          <p className="text-white/25 text-xs">clicks</p>
        </div>
      )}

      {/* Toggle */}
      <button
        onClick={() => onToggle(link.id)}
        className="shrink-0 w-10 h-6 rounded-full transition-all active:scale-95 relative"
        style={{
          background: link.active
            ? 'linear-gradient(90deg, rgba(245,158,11,0.7), rgba(245,158,11,0.5))'
            : 'rgba(255,255,255,0.08)',
          border: link.active
            ? '1px solid rgba(245,158,11,0.4)'
            : '1px solid rgba(255,255,255,0.1)',
        }}
        aria-label={`Toggle ${link.platform} link`}
        aria-pressed={link.active}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
          style={{
            background: link.active ? '#f59e0b' : 'rgba(255,255,255,0.3)',
            left: link.active ? 'calc(100% - 22px)' : '2px',
            boxShadow: link.active ? '0 2px 6px rgba(245,158,11,0.4)' : 'none',
          }}
        />
      </button>
    </div>
  )
}