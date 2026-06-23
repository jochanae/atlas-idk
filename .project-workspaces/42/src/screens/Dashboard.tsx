import { CheckCircle2, Circle, Flame } from 'lucide-react'
import { Habit } from '../types'
import { todayStr, getStreak } from '../store'

interface Props {
  habits: Habit[]
  toggleToday: (id: string) => void
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getWeekDates() {
  const dates: { label: string; dateStr: string; isToday: boolean }[] = []
  const today = new Date()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay())
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek)
    d.setDate(startOfWeek.getDate() + i)
    dates.push({
      label: DAY_LABELS[d.getDay()],
      dateStr: d.toISOString().slice(0, 10),
      isToday: d.toISOString().slice(0, 10) === todayStr(),
    })
  }
  return dates
}

export default function Dashboard({ habits, toggleToday }: Props) {
  const today = todayStr()
  const weekDates = getWeekDates()
  const completedToday = habits.filter(h => h.completedDates.includes(today)).length
  const total = habits.length
  const pct = total > 0 ? Math.round((completedToday / total) * 100) : 0

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="px-4 pt-12 pb-6">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm text-gray-400 mb-0.5">{greeting}</p>
        <h1 className="text-2xl font-bold text-gray-900">Today's Habits</h1>
      </div>

      {/* Weekly strip */}
      <div className="flex gap-1 mb-6">
        {weekDates.map(({ label, dateStr, isToday }) => {
          const anyDone = habits.some(h => h.completedDates.includes(dateStr))
          return (
            <div key={dateStr} className="flex-1 flex flex-col items-center gap-1">
              <span className={`text-[10px] font-medium ${isToday ? 'text-brand-600' : 'text-gray-400'}`}>
                {label}
              </span>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                isToday
                  ? anyDone
                    ? 'bg-brand-500 border-brand-500 text-white'
                    : 'border-brand-400 text-brand-600'
                  : anyDone
                    ? 'bg-brand-100 border-brand-100 text-brand-700'
                    : 'border-gray-100 text-gray-300'
              }`}>
                {new Date(dateStr + 'T12:00:00').getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Progress summary */}
      <div className="bg-brand-50 rounded-2xl p-4 mb-6 flex items-center gap-4">
        <div className="relative w-14 h-14 flex-shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" fill="none" stroke="#dcfce7" strokeWidth="6" />
            <circle
              cx="24" cy="24" r="20" fill="none"
              stroke="#22c55e" strokeWidth="6"
              strokeDasharray={`${2 * Math.PI * 20}`}
              strokeDashoffset={`${2 * Math.PI * 20 * (1 - pct / 100)}`}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-brand-700">
            {pct}%
          </span>
        </div>
        <div>
          <p className="text-brand-700 font-semibold text-base">
            {completedToday} of {total} done
          </p>
          <p className="text-brand-600 text-sm">
            {pct === 100 ? '🎉 Perfect day!' : `${total - completedToday} left to go`}
          </p>
        </div>
      </div>

      {/* Habit list */}
      <div className="space-y-3">
        {habits.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">
            No habits yet — add one in the Habits tab.
          </p>
        )}
        {habits.map(habit => {
          const done = habit.completedDates.includes(today)
          const streak = getStreak(habit)
          return (
            <button
              key={habit.id}
              onClick={() => toggleToday(habit.id)}
              className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all active:scale-[0.98] text-left ${
                done
                  ? 'border-transparent bg-brand-50'
                  : 'border-gray-100 bg-white'
              }`}
            >
              <span className="text-2xl">{habit.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={`font-medium truncate ${done ? 'text-brand-700 line-through decoration-brand-300' : 'text-gray-800'}`}>
                  {habit.name}
                </p>
                {streak > 0 && (
                  <p className="text-xs text-orange-500 flex items-center gap-0.5 mt-0.5">
                    <Flame size={12} />
                    {streak} day streak
                  </p>
                )}
              </div>
              {done
                ? <CheckCircle2 size={24} className="text-brand-500 flex-shrink-0" />
                : <Circle size={24} className="text-gray-200 flex-shrink-0" />
              }
            </button>
          )
        })}
      </div>
    </div>
  )
}