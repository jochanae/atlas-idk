export interface Habit {
  id: string
  name: string
  emoji: string
  frequency: 'daily' | 'weekly'
  completedDates: string[] // ISO date strings: "2024-01-15"
  createdAt: string
  color: string
}