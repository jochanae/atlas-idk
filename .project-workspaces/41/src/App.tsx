import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import Dashboard from './screens/Dashboard'
import Habits from './screens/Habits'
import Progress from './screens/Progress'
import { useHabits } from './store/useHabits'

export default function App() {
  const store = useHabits()

  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen max-w-md mx-auto bg-white relative overflow-hidden">
        {/* Screen content */}
        <div className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard store={store} />} />
            <Route path="/habits" element={<Habits store={store} />} />
            <Route path="/progress" element={<Progress store={store} />} />
          </Routes>
        </div>

        {/* Bottom nav */}
        <BottomNav />
      </div>
    </BrowserRouter>
  )
}