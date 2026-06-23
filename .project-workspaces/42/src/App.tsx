import { useState } from 'react'
import { TabName } from './types'
import { useHabits } from './store'
import BottomNav from './components/BottomNav'
import Dashboard from './screens/Dashboard'
import Habits from './screens/Habits'
import Progress from './screens/Progress'

export default function App() {
  const [tab, setTab] = useState<TabName>('dashboard')
  const store = useHabits()

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {tab === 'dashboard' && <Dashboard {...store} />}
        {tab === 'habits'    && <Habits    {...store} />}
        {tab === 'progress'  && <Progress  habits={store.habits} />}
      </div>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}