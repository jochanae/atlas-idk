import { useState, useEffect } from 'react'
import { Habit } from './types'

const STORAGE_KEY = 'habit-tracker-v1'

const SEED_HABITS: Habit[] = [
  {
    id: '1',
    name: 'Morning workout',
    icon: '💪',
    color: '#f97316',
    frequency: 'daily',
    targetDays: [],
    completedDates: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'Read 20 minutes',
    icon: '📚',
    color: '#8b5cf6',
    frequency: 'daily',
    targetDays: [],
    completedDates: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: '3',
    name: 'Drink 8 glasses of water',
    icon: '💧',
    color: '#0ea5e9',
    frequency: 'daily',
    targetDays: [],
    completedDates: [],
    createdAt: new Date().toISOString(),
  },
]

function load(): Habit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return SEED_HABITS
}

function save(habits: Habit[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(habits))
}

export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>(load)

  useEffect(() => {
    save(habits)
  }, [habits])

  const toggleToday = (id: string) => {
    const today = todayStr()
    setHabits(prev =>
      prev.map(h => {
        if (h.id !== id) return h
        const already = h.completedDates.includes(today)
        return {
          ...h,
          completedDates: already
            ? h.completedDates.filter(d => d !== today)
            : [...h.completedDates, today],
        }
      })
    )
  }

  const addHabit = (habit: Omit<Habit, 'id' | 'completedDates' | 'createdAt'>) => {
    const newHabit: Habit = {
      ...habit,
      id: Date.now().toString(),
      completedDates: [],
      createdAt: new Date().toISOString(),
    }
    setHabits(prev => [...prev, newHabit])
  }

  const deleteHabit = (id: string) => {
    setHabits(prev => prev.filter(h => h.id !== id))
  }

  return { habits, toggleToday, addHabit, deleteHabit }
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function getStreak(habit: Habit): number {
  let streak = 0
  const d = new Date()
  while (true) {
    const s = d.toISOString().slice(0, 10)
    if (habit.completedDates.includes(s)) {
      streak++
      d.setDate(d.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

export function getCompletionRate(habit: Habit, days = 7): number {
  const dates: string[] = []
  const d = new Date()
  for (let i = 0; i < days; i++) {
    dates.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() - 1)
  }
  const done = dates.filter(date => habit.completedDates.includes(date)).length
  return Math.round((done / days) * 100)
}