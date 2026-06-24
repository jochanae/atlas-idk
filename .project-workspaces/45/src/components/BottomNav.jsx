import { NavLink } from 'react-router-dom';

export default function BottomNav() {
  const base = 'flex flex-col items-center gap-1 text-xs font-medium transition-colors duration-200';
  const active = 'text-indigo-500';
  const inactive = 'text-gray-400 dark:text-gray-500';

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 transition-colors duration-300">
      <div className="max-w-md mx-auto flex justify-around py-3 px-6">
        <NavLink to="/" end className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>
          <span className="text-xl">🏠</span>
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/habits" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>
          <span className="text-xl">✅</span>
          <span>Habits</span>
        </NavLink>
        <NavLink to="/progress" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>
          <span className="text-xl">📈</span>
          <span>Progress</span>
        </NavLink>
      </div>
    </nav>
  );
}