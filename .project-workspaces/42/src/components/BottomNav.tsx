import { LayoutDashboard, ListChecks, TrendingUp } from 'lucide-react'
import { TabName } from '../types'

interface Props {
  active: TabName
  onChange: (t: TabName) => void
}

const TABS: { id: TabName; label: string; Icon: React.FC<{ size?: number; strokeWidth?: number }> }[] = [
  { id: 'dashboard', label: 'Today',    Icon: LayoutDashboard },
  { id: 'habits',    label: 'Habits',   Icon: ListChecks },
  { id: 'progress',  label: 'Progress', Icon: TrendingUp },
]

export default function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="flex border-t border-gray-100 bg-white safe-area-inset-bottom">
      {TABS.map(({ id, label, Icon }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors ${
              isActive ? 'text-brand-600' : 'text-gray-400'
            }`}
          >
            <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}