export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function getLast7Days(): string[] {
  const days: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

export function getLast30Days(): string[] {
  const days: string[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

export function getStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0
  const sorted = [...completedDates].sort().reverse()
  const today = todayISO()
  let streak = 0
  let check = today

  for (let i = 0; i < 365; i++) {
    if (sorted.includes(check)) {
      streak++
      const d = new Date(check + 'T12:00:00')
      d.setDate(d.getDate() - 1)
      check = d.toISOString().split('T')[0]
    } else {
      break
    }
  }
  return streak
}

export function getCompletionRate(completedDates: string[], days: string[]): number {
  if (days.length === 0) return 0
  const completed = days.filter((d) => completedDates.includes(d)).length
  return Math.round((completed / days.length) * 100)
}

export const COLORS = [
  '#22c55e',
  '#3b82f6',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#ef4444',
]