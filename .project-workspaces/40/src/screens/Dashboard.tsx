import { HabitStore } from '../types'
import { todayISO, getLast7Days, getStreak, formatDate } from '../utils'
import { CheckCircle2, Circle, Flame, Trophy } from 'lucide-react'

type Props = Pick<HabitStore, 'habits' | 'toggleHabit'>

export default function Dashboard({ habits, toggleHabit }: Props) {
  const today = todayISO()
  const last7 = getLast7Days()

  const completedToday = habits.filter((h) => h.completedDates.includes(today)).length
  const totalHabits = habits.length
  const overallStreak = habits.reduce(
    (best, h) => Math.max(best, getStreak(h.completedDates)),
    0
  )

  const allDone = totalHabits > 0 && completedToday === totalHabits

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div className="pt-2">
        <p className="text-slate-400 text-sm">{formatDate(today)}</p>
        <h1 className="text-2xl font-bold text-white mt-0.5">
          {allDone ? 'All done! 🎉' : 'Good day.'}
        </h1>
      </div>

      {/* Today's summary card */}
      <div className="bg-slate-800 rounded-2xl p-4 flex items-center justify-between">
        <div>
          <p className="text-slate-400 text-sm">Today's progress</p>
          <p className="text-3xl font-bold text-white mt-1">
            {completedToday}
            <span className="text-slate-500 text-xl font-normal"> / {totalHabits}</span>
          </p>
          <p className="text-slate-400 text-xs mt-1">habits completed</p>
        </div>
        <div className="relative w-16 h-16">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15.9"
              fill="none"
              stroke="#22c55e"
              strokeWidth="3"
              strokeDasharray={`${totalHabits > 0 ? (completedToday / totalHabits) * 100 : 0} 100`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
            {totalHabits > 0 ? Math.round((completedToday / totalHabits) * 100) : 0}%
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800 rounded-2xl p-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-500/20 rounded-xl flex items-center justify-center">
            <Flame size={18} className="text-orange-400" />
          </div>
          <div>
            <p className="text-xl font-bold text-white">{overallStreak}</p>
            <p className="text-slate-400 text-xs">Best streak</p>
          </div>
        </div>
        <div className="bg-slate-800 rounded-2xl p-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-yellow-500/20 rounded-xl flex items-center justify-center">
            <Trophy size={18} className="text-yellow-400" />
          </div>
          <div>
            <p className="text-xl font-bold text-white">{totalHabits}</p>
            <p className="text-slate-400 text-xs">Total habits</p>
          </div>
        </div>
      </div>

      {/* Today's habits */}
      <div>
        <h2 className="text-slate-400 text-sm font-medium mb-3 uppercase tracking-wide">
          Today
        </h2>
        {habits.length === 0 ? (
          <div className="bg-slate-800 rounded-2xl p-6 text-center">
            <p className="text-slate-400 text-sm">No habits yet.</p>
            <p className="text-slate-500 text-xs mt-1">Head to Habits to add some.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {habits.map((habit) => {
              const done = habit.completedDates.includes(today)
              return (
                <button
                  key={habit.id}
                  onClick={() => toggleHabit(habit.id, today)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-2xl transition-all active:scale-95 ${
                    done ? 'bg-slate-800/60' : 'bg-slate-800'
                  }`}
                >
                  {done ? (
                    <CheckCircle2 size={24} style={{ color: habit.color }} />
                  ) : (
                    <Circle size={24} className="text-slate-600" />
                  )}
                  <span className="text-lg">{habit.emoji}</span>
                  <span
                    className={`flex-1 text-left text-sm font-medium ${
                      done ? 'line-through text-slate-500' : 'text-white'
                    }`}
                  >
                    {habit.name}
                  </span>
                  {getStreak(habit.completedDates) > 0 && (
                    <span className="text-xs text-orange-400 flex items-center gap-0.5">
                      <Flame size={12} />
                      {getStreak(habit.completedDates)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Week mini-view */}
      {habits.length > 0 && (
        <div>
          <h2 className="text-slate-400 text-sm font-medium mb-3 uppercase tracking-wide">
            This week
          </h2>
          <div className="bg-slate-800 rounded-2xl p-4">
            <div className="grid grid-cols-7 gap-1">
              {last7.map((day) => {
                const dayLabel = new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)
                const completedCount = habits.filter((h) => h.completedDates.includes(day)).length
                const ratio = totalHabits > 0 ? completedCount / totalHabits : 0
                const isToday = day === today
                return (
                  <div key={day} className="flex flex-col items-center gap-1">
                    <span className="text-slate-500 text-xs">{dayLabel}</span>
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-medium ${
                        isToday ? 'ring-2 ring-green-400 ring-offset-1 ring-offset-slate-800' : ''
                      }`}
                      style={{
                        backgroundColor:
                          ratio === 0
                            ? '#1e293b'
                            : ratio === 1
                            ? '#22c55e'
                            : `rgba(34,197,94,${0.2 + ratio * 0.6})`,
                        color: ratio > 0.5 ? '#fff' : '#94a3b8',
                      }}
                    >
                      {new Date(day + 'T12:00:00').getDate()}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}