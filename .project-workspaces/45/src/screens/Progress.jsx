import React from 'react'
import { useHabits } from '../context/HabitsContext'

export default function Progress() {
  const { habits, getLast7Days, getStreak, completions } = useHabits()

  const last7 = getLast7Days()
  const maxCount = Math.max(...last7.map(d => d.count), 1)

  // Overall completion rate over last 7 days
  const totalPossible = habits.length * 7
  const totalDone = last7.reduce((sum, d) => sum + d.count, 0)
  const weekRate = totalPossible === 0 ? 0 : Math.round((totalDone / totalPossible) * 100)

  // Best streak across all habits
  const bestStreak = habits.length > 0
    ? Math.max(...habits.map(h => getStreak(h.id)))
    : 0

  return (
    <div className="px-5 pt-10 pb-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Progress</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-green-50 rounded-2xl p-4">
          <p className="text-xs text-green-600 font-medium mb-1">This week</p>
          <p className="text-3xl font-bold text-green-700">{weekRate}%</p>
          <p className="text-xs text-green-500 mt-0.5">completion rate</p>
        </div>
        <div className="bg-orange-50 rounded-2xl p-4">
          <p className="text-xs text-orange-600 font-medium mb-1">Best streak</p>
          <p className="text-3xl font-bold text-orange-600">{bestStreak}</p>
          <p className="text-xs text-orange-400 mt-0.5">days in a row 🔥</p>
        </div>
      </div>

      {/* 7-day bar chart */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
        <p className="text-sm font-semibold text-gray-700 mb-4">Last 7 days</p>
        {habits.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-4">Add habits to see progress.</p>
        ) : (
          <div className="flex items-end justify-between gap-1.5 h-28">
            {last7.map(day => {
              const heightPct = day.count === 0 ? 0 : Math.max(10, (day.count / maxCount) * 100)
              const isToday = day.key === new Date().toISOString().split('T')[0]
              return (
                <div key={day.key} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end justify-center" style={{ height: '80px' }}>
                    <div
                      className={`w-full rounded-t-lg transition-all ${isToday ? 'bg-green-500' : 'bg-green-200'}`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className={`text-xs ${isToday ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                    {day.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Per-habit breakdown */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">By habit</p>
        {habits.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-4">No habits yet.</p>
        ) : (
          <div className="space-y-3">
            {habits.map(habit => {
              const streak = getStreak(habit.id)
              // Count completions in last 7 days for this habit
              const last7Keys = getLast7Days().map(d => d.key)
              const doneThisWeek = last7Keys.filter(k =>
                (completions[k] || []).includes(habit.id)
              ).length
              const weekPct = Math.round((doneThisWeek / 7) * 100)

              return (
                <div key={habit.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{habit.emoji}</span>
                      <span className="text-sm text-gray-700 font-medium">{habit.name}</span>
                    </div>
                    <span className="text-xs text-gray-400">{doneThisWeek}/7 days</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${weekPct}%`,
                        backgroundColor: habit.color,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}