import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useHabits } from './store'
import BottomNav from './components/BottomNav'
import Dashboard from './screens/Dashboard'
import Habits from './screens/Habits'
import Progress from './screens/Progress'

export default function App() {
  const store = useHabits()

  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-900 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard {...store} />} />
            <Route path="/habits" element={<Habits {...store} />} />
            <Route path="/progress" element={<Progress {...store} />} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    </BrowserRouter>
  )
}