import React, { useState } from 'react'
import BottomNav, { NavTab } from './components/BottomNav'
import DashboardScreen from './screens/DashboardScreen'
import FunnelsScreen from './screens/FunnelsScreen'
import LinksScreen from './screens/LinksScreen'
import SettingsScreen from './screens/SettingsScreen'
import { useFunnelState } from './hooks/useFunnelState'
import { useMetrics } from './hooks/useMetrics'
import { useSocialLinks } from './hooks/useSocialLinks'

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard')
  const { funnels, generating, lastGenerated, generateFunnel, toggleStatus, archiveFunnel } =
    useFunnelState()
  const metrics = useMetrics(funnels)
  const { links, toggleLink, trackClick, addLink } = useSocialLinks()

  const handleGenerate = (prompt: string) => {
    generateFunnel(prompt)
    if (activeTab === 'dashboard') {
      setTimeout(() => setActiveTab('funnels'), 1500)
    }
  }

  return (
    <div
      className="smoky-bg min-h-screen max-w-md mx-auto relative overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Ambient top glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-64 h-32 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center top, rgba(245,158,11,0.07) 0%, transparent 70%)',
        }}
      />

      {/* Screen content */}
      <div className="relative z-10 overflow-y-auto" style={{ height: '100dvh' }}>
        {activeTab === 'dashboard' && (
          <DashboardScreen
            metrics={metrics}
            funnels={funnels}
            generating={generating}
            onGenerate={handleGenerate}
            onNavigateToFunnels={() => setActiveTab('funnels')}
          />
        )}
        {activeTab === 'funnels' && (
          <FunnelsScreen
            funnels={funnels}
            lastGenerated={lastGenerated}
            generating={generating}
            onGenerate={handleGenerate}
            onToggle={toggleStatus}
            onArchive={archiveFunnel}
          />
        )}
        {activeTab === 'links' && (
          <LinksScreen
            links={links}
            onToggle={toggleLink}
            onTrackClick={trackClick}
            onAdd={addLink}
          />
        )}
        {activeTab === 'settings' && <SettingsScreen />}
      </div>

      {/* Bottom navigation */}
      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  )
}