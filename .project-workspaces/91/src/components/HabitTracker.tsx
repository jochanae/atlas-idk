import { useState, useEffect } from 'react'
import ProgressSummary from './ProgressSummary'
import HabitCard from './HabitCard'

export interface Habit {
  id: string
  name: string
  icon: string
  completedDates: string[]
  streak: number
}

const DEFAULT_HABITS: Habit[] = [
  { id: '1', name: 'Meals', icon: '🍽️', completedDates: [], streak: 0 },
  { id: '2', name: 'Drink Water', icon: '💧', completedDates: [], streak: 0 },
  { id: '3', name: 'Walk 30 Minutes', icon: '🚶', completedDates: [], streak: 0 },
  { id: '4', name: 'Read 20 Minutes', icon: '📖', completedDates: [], streak: 0 },
]

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0]
}

function calculateStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0

  const sorted = [...completedDates].sort((a, b) => b.localeCompare(a))
  const today = getTodayKey()

  // Streak counts if completed today or yesterday (to not break on time zones)
  let streak = 0
  let current = new Date(today)

  for (let i = 0; i < 365; i++) {
    const key = current.toISOString().split('T')[0]
    if (sorted.includes(key)) {
      streak++
      current.setDate(current.getDate() - 1)
    } else {
      break
    }
  }

  return streak
}

function loadHabits(): Habit[] {
  try {
    const raw = localStorage.getItem('habits')
    if (!raw) return DEFAULT_HABITS
    const parsed = JSON.parse(raw) as Habit[]
    return parsed.map(h => ({
      ...h,
      streak: calculateStreak(h.completedDates),
    }))
  } catch {
    return DEFAULT_HABITS
  }
}

export default function HabitTracker() {
  const [habits, setHabits] = useState<Habit[]>(loadHabits)

  useEffect(() => {
    localStorage.setItem('habits', JSON.stringify(habits))
  }, [habits])

  const today = getTodayKey()

  function toggleHabit(id: string) {
    setHabits(prev =>
      prev.map(h => {
        if (h.id !== id) return h
        const alreadyDone = h.completedDates.includes(today)
        const updated = alreadyDone
          ? h.completedDates.filter(d => d !== today)
          : [...h.completedDates, today]
        return {
          ...h,
          completedDates: updated,
          streak: calculateStreak(updated),
        }
      })
    )
  }

  const completedToday = habits.filter(h => h.completedDates.includes(today)).length
  const total = habits.length

  return (
    <div className="max-w-md mx-auto px-4 py-8 min-h-screen flex flex-col gap-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white">Daily Habits</h1>
        <p className="text-gray-400 mt-1 text-sm">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Progress Summary */}
      <ProgressSummary completed={completedToday} total={total} />

      {/* Habit Cards */}
      <div className="flex flex-col gap-3">
        {habits.map(habit => (
          <HabitCard
            key={habit.id}
            habit={habit}
            completedToday={habit.completedDates.includes(today)}
            onToggle={() => toggleHabit(habit.id)}
          />
        ))}
      </div>

      <p className="text-center text-gray-600 text-xs mt-auto pt-4">
        Keep going — consistency is the goal.
      </p>
    </div>
  )
}