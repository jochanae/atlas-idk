import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { HabitsProvider } from './context/HabitsContext'
import BottomNav from './components/BottomNav'
import Dashboard from './screens/Dashboard'
import Habits from './screens/Habits'
import Progress from './screens/Progress'

// BASE_URL is set by Vite to the --base flag value (/api/devserver/workspace/N/proxy/).
// React Router's basename must not have a trailing slash.
const routerBase = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/'

export default function App() {
  return (
    <HabitsProvider>
      <BrowserRouter basename={routerBase}>
        <div className="max-w-md mx-auto min-h-screen bg-white relative flex flex-col">
          <div className="flex-1 overflow-y-auto pb-20">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/habits" element={<Habits />} />
              <Route path="/progress" element={<Progress />} />
            </Routes>
          </div>
          <BottomNav />
        </div>
      </BrowserRouter>
    </HabitsProvider>
  )
}