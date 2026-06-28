import React from 'react'
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Plants from './pages/Plants'
import Settings from './pages/Settings'

function NavBar() {
  const linkClass = ({ isActive }) =>
    `flex flex-col items-center gap-1 text-xs font-medium px-4 py-2 rounded-lg transition-colors ${
      isActive
        ? 'text-garden-green bg-garden-pale'
        : 'text-gray-500 hover:text-garden-green'
    }`

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center px-4 py-2 z-50">
      <NavLink to="/" className={linkClass} end>
        <span className="text-lg">🌿</span>
        Dashboard
      </NavLink>
      <NavLink to="/plants" className={linkClass}>
        <span className="text-lg">🪴</span>
        Plants
      </NavLink>
      <NavLink to="/settings" className={linkClass}>
        <span className="text-lg">⚙️</span>
        Settings
      </NavLink>
    </nav>
  )
}

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen pb-20">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/plants" element={<Plants />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
        <NavBar />
      </div>
    </HashRouter>
  )
}