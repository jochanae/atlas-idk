import { useHabits } from '../store/useHabits'
import HabitCard from '../components/HabitCard'

interface Props {
  store: ReturnType<typeof useHabits>
}

export default function Dashboard({ store }: Props) {
  const { habits, toggleToday, isCompletedToday, getStreak, completedTodayCount } = store

  const today = new Date()
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' })
  const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

  const total = habits.length
  const pct = total > 0 ? Math.round((completedTodayCount / total) * 100) : 0

  return (
    <div className="px-5 pt-14 pb-6">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm text-gray-400 font-medium">{dayName}, {dateStr}</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Good morning 👋</h1>
      </div>

      {/* Progress ring summary */}
      <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl p-5 mb-6 text-white">
        <p className="text-sm font-medium opacity-80 mb-1">Today's Progress</p>
        <div className="flex items-end gap-2">
          <span className="text-4xl font-bold">{completedTodayCount}</span>
          <span className="text-lg opacity-70 mb-1">/ {total} habits</span>
        </div>

        {/* Progress bar */}
        <div className="mt-4 bg-white/20 rounded-full h-2">
          <div
            className="bg-white rounded-full h-2 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs mt-2 opacity-70">{pct}% complete</p>
      </div>

      {/* Habits list */}
      <h2 className="text-base font-semibold text-gray-700 mb-3">Today's Habits</h2>

      {habits.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🌱</p>
          <p className="font-medium">No habits yet</p>
          <p className="text-sm mt-1">Add some in the Habits tab</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {habits.map(habit => (
            <HabitCard
              key={habit.id}
              habit={habit}
              isCompleted={isCompletedToday(habit.id)}
              streak={getStreak(habit.id)}
              onToggle={() => toggleToday(habit.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}