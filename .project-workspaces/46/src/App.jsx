import React from 'react'
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom'
import Today from './screens/Today'
import Weekly from './screens/Weekly'
import SavedCities from './screens/SavedCities'

function BottomNav() {
  const base = 'flex flex-col items-center gap-1 text-xs font-medium transition-colors py-2 px-4'
  const active = 'text-sky-400'
  const inactive = 'text-slate-500'

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-800 flex justify-around items-center pb-safe max-w-md mx-auto">
      <NavLink to="/" end className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>
        <span className="text-xl">🌡️</span>
        Today
      </NavLink>
      <NavLink to="/weekly" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>
        <span className="text-xl">📅</span>
        Weekly
      </NavLink>
      <NavLink to="/cities" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>
        <span className="text-xl">📍</span>
        Cities
      </NavLink>
    </nav>
  )
}

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen bg-slate-950 max-w-md mx-auto relative">
        <div className="pb-20">
          <Routes>
            <Route path="/"       element={<Today />} />
            <Route path="/weekly" element={<Weekly />} />
            <Route path="/cities" element={<SavedCities />} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    </HashRouter>
  )
}