import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ListChecks, TrendingUp } from 'lucide-react'

const tabs = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/habits',    label: 'Habits',    Icon: ListChecks },
  { to: '/progress',  label: 'Progress',  Icon: TrendingUp },
]

export default function BottomNav() {
  return (
    <nav className="flex border-t border-gray-100 bg-white pb-safe">
      {tabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-3 gap-1 text-xs font-medium transition-colors ${
              isActive ? 'text-green-500' : 'text-gray-400'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                size={22}
                strokeWidth={isActive ? 2.5 : 1.8}
                className={isActive ? 'text-green-500' : 'text-gray-400'}
              />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}