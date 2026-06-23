import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ListChecks, BarChart2 } from 'lucide-react'

const tabs = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/habits', label: 'Habits', icon: ListChecks },
  { to: '/progress', label: 'Progress', icon: BarChart2 },
]

export default function BottomNav() {
  return (
    <nav className="flex border-t border-slate-700 bg-slate-900 pb-safe">
      {tabs.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
              isActive ? 'text-green-400' : 'text-slate-500 hover:text-slate-300'
            }`
          }
        >
          <Icon size={22} strokeWidth={isActive => isActive ? 2.5 : 1.8} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}