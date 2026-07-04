import type { Habit } from './HabitTracker'

interface Props {
  habit: Habit
  completedToday: boolean
  onToggle: () => void
}

export default function HabitCard({ habit, completedToday, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      className={`
        w-full text-left rounded-2xl p-4 border transition-all duration-200 active:scale-[0.98]
        flex items-center justify-between gap-4
        ${completedToday
          ? 'bg-emerald-950 border-emerald-700 shadow-[0_0_16px_rgba(16,185,129,0.15)]'
          : 'bg-gray-900 border-gray-800 hover:border-gray-600'
        }
      `}
      aria-pressed={completedToday}
      aria-label={`${habit.name} — ${completedToday ? 'completed' : 'not completed'}`}
    >
      {/* Left: icon + name */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-2xl shrink-0">{habit.icon}</span>
        <div className="min-w-0">
          <p className={`font-semibold text-base truncate ${completedToday ? 'text-emerald-300' : 'text-white'}`}>
            {habit.name}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {habit.streak > 0
              ? `${habit.streak} day streak 🔥`
              : 'No streak yet'}
          </p>
        </div>
      </div>

      {/* Right: streak badge + checkbox */}
      <div className="flex items-center gap-3 shrink-0">
        {habit.streak >= 3 && (
          <span className="bg-orange-950 text-orange-400 border border-orange-800 text-xs font-semibold px-2 py-0.5 rounded-full">
            {habit.streak}🔥
          </span>
        )}

        {/* Custom checkbox */}
        <div
          className={`
            w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-200
            ${completedToday
              ? 'bg-emerald-500 border-emerald-500'
              : 'bg-transparent border-gray-600'
            }
          `}
        >
          {completedToday && (
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
    </button>
  )
}