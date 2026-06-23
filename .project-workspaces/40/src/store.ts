import { useState, useCallback } from 'react'
import { Habit } from './types'

const STORAGE_KEY = 'habit-tracker-habits'

function load(): Habit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : defaultHabits()
  } catch {
    return defaultHabits()
  }
}

function save(habits: Habit[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(habits))
}

function defaultHabits(): Habit[] {
  return [
    {
      id: '1',
      name: 'Morning walk',
      emoji: '🚶',
      frequency: 'daily',
      completedDates: [],
      createdAt: new Date().toISOString(),
      color: '#22c55e',
    },
    {
      id: '2',
      name: 'Read 20 minutes',
      emoji: '📖',
      frequency: 'daily',
      completedDates: [],
      createdAt: new Date().toISOString(),
      color: '#3b82f6',
    },
    {
      id: '3',
      name: 'Drink 8 glasses of water',
      emoji: '💧',
      frequency: 'daily',
      completedDates: [],
      createdAt: new Date().toISOString(),
      color: '#06b6d4',
    },
  ]
}

export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>(load)

  const addHabit = useCallback(
    (data: Omit<Habit, 'id' | 'createdAt' | 'completedDates'>) => {
      const newHabit: Habit = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        completedDates: [],
      }
      setHabits((prev) => {
        const next = [...prev, newHabit]
        save(next)
        return next
      })
    },
    []
  )

  const toggleHabit = useCallback((id: string, date: string) => {
    setHabits((prev) => {
      const next = prev.map((h) => {
        if (h.id !== id) return h
        const already = h.completedDates.includes(date)
        return {
          ...h,
          completedDates: already
            ? h.completedDates.filter((d) => d !== date)
            : [...h.completedDates, date],
        }
      })
      save(next)
      return next
    })
  }, [])

  const deleteHabit = useCallback((id: string) => {
    setHabits((prev) => {
      const next = prev.filter((h) => h.id !== id)
      save(next)
      return next
    })
  }, [])

  return { habits, addHabit, toggleHabit, deleteHabit }
}