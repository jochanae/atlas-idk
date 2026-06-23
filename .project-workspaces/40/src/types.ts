export interface Habit {
  id: string
  name: string
  emoji: string
  frequency: 'daily' | 'weekly'
  completedDates: string[] // ISO date strings: "2024-03-15"
  createdAt: string
  color: string
}

export type HabitStore = {
  habits: Habit[]
  addHabit: (habit: Omit<Habit, 'id' | 'createdAt' | 'completedDates'>) => void
  toggleHabit: (id: string, date: string) => void
  deleteHabit: (id: string) => void
}