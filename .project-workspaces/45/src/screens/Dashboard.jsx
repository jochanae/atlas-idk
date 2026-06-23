import React from 'react'
import { useHabits } from '../context/HabitsContext'

export default function Dashboard() {
  const { habits, toggleToday, isTodayComplete, getTodayCompletions } = useHabits()

  const todayDone = getTodayCompletions().length
  const total = habits.length
  const pct = total === 0 ? 0 : Math.round((todayDone / total) * 100)

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="px-5 pt-10 pb-6">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm text-gray-400 mb-0.5">{today}</p>
        <h1 className="text-2xl font-bold text-gray-900">
          {pct === 100 ? '🎉 All done!' : pct > 0 ? 'Keep going' : 'Good morning'}
        </h1>
      </div>

      {/* Ring progress */}
      <div className="flex items-center justify-center mb-8">
        <div className="relative w-36 h-36">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#f0fdf4" strokeWidth="10" />
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke="#22c55e"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 42}`}
              strokeDashoffset={`${2 * Math.PI * 42 * (1 - pct / 100)}`}
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-gray-900">{pct}%</span>
            <span className="text-xs text-gray-400">{todayDone}/{total} done</span>
          </div>
        </div>
      </div>

      {/* Habit checklist */}
      <div className="space-y-3">
        {habits.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">
            No habits yet — add some in the Habits tab.
          </p>
        )}
        {habits.map(habit => {
          const done = isTodayComplete(habit.id)
          return (
            <button
              key={habit.id}
              onClick={() => toggleToday(habit.id)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all active:scale-95 ${
                done
                  ? 'bg-green-50 border-green-200'
                  : 'bg-white border-gray-100 shadow-sm'
              }`}
            >
              <span className="text-2xl">{habit.emoji}</span>
              <span className={`flex-1 text-left text-sm font-medium ${done ? 'text-green-700 line-through' : 'text-gray-800'}`}>
                {habit.name}
              </span>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                done ? 'bg-green-500 border-green-500' : 'border-gray-300'
              }`}>
                {done && (
                  <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5">
                    <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}