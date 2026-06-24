import React from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { HabitsProvider } from './context/HabitsContext'
import BottomNav from './components/BottomNav'
import Dashboard from './screens/Dashboard'
import Habits from './screens/Habits'
import Progress from './screens/Progress'

export default function App() {
  return (
    <HabitsProvider>
      <HashRouter>
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
      </HashRouter>
    </HabitsProvider>
  )
}