import React from 'react'

const SETTINGS_SECTIONS = [
  {
    title: 'Account',
    items: [
      { label: 'Profile', sub: 'Name, handle, and avatar', icon: '👤' },
      { label: 'Notifications', sub: 'Lead alerts and weekly reports', icon: '🔔' },
      { label: 'Connected Apps', sub: 'Webhooks and integrations', icon: '🔌' },
    ],
  },
  {
    title: 'Dashboard',
    items: [
      { label: 'Metric Preferences', sub: 'Choose what you track', icon: '📊' },
      { label: 'Funnel Templates', sub: 'Customize default steps', icon: '⟁' },
      { label: 'Link Page Settings', sub: 'Custom domain and branding', icon: '🔗' },
    ],
  },
  {
    title: 'Data',
    items: [
      { label: 'Export Data', sub: 'CSV export of all metrics', icon: '📤' },
      { label: 'Integrations', sub: 'Mailchimp, ConvertKit, Stripe', icon: '⚡' },
    ],
  },
]

export default function SettingsScreen() {
  return (
    <div className="px-4 pt-6 pb-28 space-y-6">
      <div>
        <h1 className="text-white text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-white/40 text-sm mt-1">Configure your dashboard</p>
      </div>

      {/* Profile card */}
      <div
        className="glass-amber rounded-2xl p-4 flex items-center gap-4"
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          🌟
        </div>
        <div>
          <p className="text-white text-sm font-semibold">Your Workspace</p>
          <p className="text-white/40 text-xs">Free plan · 2 active funnels</p>
        </div>
        <button
          className="ml-auto text-xs text-amber-400/70 font-medium px-3 py-1.5 rounded-lg"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}
        >
          Upgrade
        </button>
      </div>

      {/* Settings sections */}
      {SETTINGS_SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="text-white/25 text-xs uppercase tracking-widest font-medium mb-3">
            {section.title}
          </p>
          <div className="glass rounded-2xl overflow-hidden">
            {section.items.map((item, i) => (
              <button
                key={item.label}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/5 transition-colors"
                style={{
                  borderBottom:
                    i < section.items.length - 1
                      ? '1px solid rgba(255,255,255,0.04)'
                      : 'none',
                }}
              >
                <span className="text-base w-6 text-center">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white/80 text-sm font-medium">{item.label}</p>
                  <p className="text-white/30 text-xs">{item.sub}</p>
                </div>
                <span className="text-white/20 text-sm">›</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <p className="text-center text-white/15 text-xs pb-2">
        Axiom Dashboard · v1.0.0
      </p>
    </div>
  )
}