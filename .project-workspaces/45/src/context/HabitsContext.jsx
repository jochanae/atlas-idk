import React, { createContext, useContext, useState, useEffect } from 'react'

const HabitsContext = createContext(null)

const DEFAULT_HABITS = [
  { id: '1', name: 'Drink 8 glasses of water', emoji: '💧', color: '#3b82f6' },
  { id: '2', name: 'Morning walk', emoji: '🚶', color: '#22c55e' },
  { id: '3', name: 'Read for 20 minutes', emoji: '📚', color: '#f59e0b' },
]

function getTodayKey() {
  return new Date().toISOString().split('T')[0]
}

export function HabitsProvider({ children }) {
  const [habits, setHabits] = useState(() => {
    try {
      const stored = localStorage.getItem('habits')
      return stored ? JSON.parse(stored) : DEFAULT_HABITS
    } catch {
      return DEFAULT_HABITS
    }
  })

  const [completions, setCompletions] = useState(() => {
    try {
      const stored = localStorage.getItem('completions')
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    localStorage.setItem('habits', JSON.stringify(habits))
  }, [habits])

  useEffect(() => {
    localStorage.setItem('completions', JSON.stringify(completions))
  }, [completions])

  function toggleToday(habitId) {
    const today = getTodayKey()
    setCompletions(prev => {
      const dayCompletions = prev[today] || []
      const alreadyDone = dayCompletions.includes(habitId)
      return {
        ...prev,
        [today]: alreadyDone
          ? dayCompletions.filter(id => id !== habitId)
          : [...dayCompletions, habitId],
      }
    })
  }

  function addHabit(name, emoji, color) {
    const newHabit = {
      id: Date.now().toString(),
      name,
      emoji: emoji || '✅',
      color: color || '#22c55e',
    }
    setHabits(prev => [...prev, newHabit])
  }

  function deleteHabit(id) {
    setHabits(prev => prev.filter(h => h.id !== id))
  }

  function isTodayComplete(habitId) {
    const today = getTodayKey()
    return (completions[today] || []).includes(habitId)
  }

  function getTodayCompletions() {
    const today = getTodayKey()
    return completions[today] || []
  }

  function getStreak(habitId) {
    let streak = 0
    const today = new Date()
    for (let i = 0; i < 365; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      if ((completions[key] || []).includes(habitId)) {
        streak++
      } else {
        break
      }
    }
    return streak
  }

  function getLast7Days() {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      const label = d.toLocaleDateString('en-US', { weekday: 'short' })
      const count = (completions[key] || []).length
      days.push({ key, label, count, total: habits.length })
    }
    return days
  }

  return (
    <HabitsContext.Provider value={{
      habits,
      completions,
      toggleToday,
      addHabit,
      deleteHabit,
      isTodayComplete,
      getTodayCompletions,
      getStreak,
      getLast7Days,
    }}>
      {children}
    </HabitsContext.Provider>
  )
}

export function useHabits() {
  return useContext(HabitsContext)
}