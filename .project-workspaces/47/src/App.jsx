import React from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ExpenseProvider } from './context/ExpenseContext'
import BottomNav from './components/BottomNav'
import Dashboard from './screens/Dashboard'
import Transactions from './screens/Transactions'
import Reports from './screens/Reports'

export default function App() {
  return (
    <ExpenseProvider>
      <HashRouter>
        <div className="max-w-md mx-auto min-h-screen flex flex-col bg-white relative">
          <div className="flex-1 overflow-y-auto pb-20">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/reports" element={<Reports />} />
            </Routes>
          </div>
          <BottomNav />
        </div>
      </HashRouter>
    </ExpenseProvider>
  )
}