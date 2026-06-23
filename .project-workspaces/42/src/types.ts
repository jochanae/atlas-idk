export interface Habit {
  id: string
  name: string
  icon: string
  color: string
  frequency: 'daily' | 'weekly'
  targetDays: number[] // 0=Sun … 6=Sat, empty = every day
  completedDates: string[] // ISO date strings "YYYY-MM-DD"
  createdAt: string
}

export type TabName = 'dashboard' | 'habits' | 'progress'