import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Funnels from './pages/Funnels'
import Links from './pages/Links'
import BottomNav from './components/BottomNav'
import { DashboardProvider } from './hooks/useDashboard'

export default function App() {
  return (
    <DashboardProvider>
      <div className="relative flex flex-col h-full w-full overflow-hidden" style={{ background: '#060608' }}>
        {/* Ambient background blobs — persistent across routes */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="ambient-blob"
            style={{
              width: 320,
              height: 320,
              top: -80,
              left: -60,
              background: '#f59e0b'
            }}
          />
          <div
            className="ambient-blob"
            style={{
              width: 260,
              height: 260,
              top: '30%',
              right: -80,
              background: '#7c3aed',
              opacity: 0.1
            }}
          />
          <div
            className="ambient-blob"
            style={{
              width: 200,
              height: 200,
              bottom: 120,
              left: '20%',
              background: '#f59e0b',
              opacity: 0.08
            }}
          />
        </div>

        {/* Page content */}
        <div className="relative flex-1 scroll-area z-10">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/funnels" element={<Funnels />} />
            <Route path="/links" element={<Links />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>

        {/* Bottom navigation */}
        <div className="relative z-20">
          <BottomNav />
        </div>
      </div>
    </DashboardProvider>
  )
}