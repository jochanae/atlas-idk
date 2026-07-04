import React from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { FunnelsPage } from './pages/FunnelsPage'
import { MetricsPage } from './pages/MetricsPage'
import { LinksPage } from './pages/LinksPage'

export default function App() {
  return (
    <HashRouter>
      <div
        className="relative min-h-screen w-full overflow-x-hidden"
        style={{
          background: 'linear-gradient(160deg, #0a0a0f 0%, #0f0f1a 40%, #0a0a12 100%)',
        }}
      >
        {/* Ambient smoky gradient orbs */}
        <div
          aria-hidden="true"
          className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden"
        >
          <div
            className="absolute top-[-20%] right-[-10%] w-96 h-96 rounded-full opacity-20"
            style={{
              background: 'radial-gradient(circle, rgba(196,151,72,0.15) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
          <div
            className="absolute bottom-[20%] left-[-15%] w-80 h-80 rounded-full opacity-15"
            style={{
              background: 'radial-gradient(circle, rgba(100,80,160,0.2) 0%, transparent 70%)',
              filter: 'blur(80px)',
            }}
          />
        </div>

        {/* Page content */}
        <main className="relative z-10">
          <Routes>
            <Route path="/" element={<FunnelsPage />} />
            <Route path="/metrics" element={<MetricsPage />} />
            <Route path="/links" element={<LinksPage />} />
          </Routes>
        </main>

        <BottomNav />
      </div>
    </HashRouter>
  )
}