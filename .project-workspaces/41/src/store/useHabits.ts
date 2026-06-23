import { useState, useEffect } from 'react'
import { Habit } from '../types'

const STORAGE_KEY = 'habit-tracker-data'

const DEFAULT_HABITS: Habit[] = [
  {
    id: '1',
    name: 'Morning Walk',
    emoji: '🚶',
    frequency: 'daily',
    completedDates: [],
    createdAt: new Date().toISOString(),
    color: '#22c55e',
  },
  {
    id: '2',
    name: 'Read 20 Pages',
    emoji: '📚',
    frequency: 'daily',
    completedDates: [],
    createdAt: new Date().toISOString(),
    color: '#3b82f6',
  },
  {
    id: '3',
    name: 'Drink 8 Glasses of Water',
    emoji: '💧',
    frequency: 'daily',
    completedDates: [],
    createdAt: new Date().toISOString(),
    color: '#06b6d4',
  },
]

function loadHabits(): Habit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return DEFAULT_HABITS
}

function saveHabits(habits: Habit[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(habits))
}

export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>(loadHabits)

  useEffect(() => {
    saveHabits(habits)
  }, [habits])

  const todayStr = new Date().toISOString().split('T')[0]

  function toggleToday(id: string) {
    setHabits(prev =>
      prev.map(h => {
        if (h.id !== id) return h
        const already = h.completedDates.includes(todayStr)
        return {
          ...h,
          completedDates: already
            ? h.completedDates.filter(d => d !== todayStr)
            : [...h.completedDates, todayStr],
        }
      })
    )
  }

  function addHabit(name: string, emoji: string, color: string) {
    const newHabit: Habit = {
      id: Date.now().toString(),
      name,
      emoji,
      frequency: 'daily',
      completedDates: [],
      createdAt: new Date().toISOString(),
      color,
    }
    setHabits(prev => [...prev, newHabit])
  }

  function deleteHabit(id: string) {
    setHabits(prev => prev.filter(h => h.id !== id))
  }

  function isCompletedToday(id: string): boolean {
    const habit = habits.find(h => h.id === id)
    return habit ? habit.completedDates.includes(todayStr) : false
  }

  function getStreak(id: string): number {
    const habit = habits.find(h => h.id === id)
    if (!habit) return 0
    let streak = 0
    const today = new Date()
    for (let i = 0; i < 365; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      if (habit.completedDates.includes(dateStr)) {
        streak++
      } else {
        break
      }
    }
    return streak
  }

  const completedTodayCount = habits.filter(h =>
    h.completedDates.includes(todayStr)
  ).length

  return {
    habits,
    toggleToday,
    addHabit,
    deleteHabit,
    isCompletedToday,
    getStreak,
    completedTodayCount,
    todayStr,
  }
}