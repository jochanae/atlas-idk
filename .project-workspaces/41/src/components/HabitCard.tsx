import { Check, Flame } from 'lucide-react'
import { Habit } from '../types'

interface Props {
  habit: Habit
  isCompleted: boolean
  streak: number
  onToggle: () => void
}

export default function HabitCard({ habit, isCompleted, streak, onToggle }: Props) {
  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
        isCompleted
          ? 'bg-green-50 border-green-200'
          : 'bg-white border-gray-100 shadow-sm'
      }`}
    >
      {/* Emoji */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
        style={{ backgroundColor: habit.color + '20' }}
      >
        {habit.emoji}
      </div>

      {/* Name + streak */}
      <div className="flex-1 min-w-0">
        <p
          className={`font-semibold truncate ${
            isCompleted ? 'text-green-700' : 'text-gray-800'
          }`}
        >
          {habit.name}
        </p>
        {streak > 0 && (
          <div className="flex items-center gap-1 mt-0.5">
            <Flame size={13} className="text-orange-400" />
            <span className="text-xs text-orange-400 font-medium">
              {streak} day streak
            </span>
          </div>
        )}
      </div>

      {/* Check button */}
      <button
        onClick={onToggle}
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 ${
          isCompleted
            ? 'bg-green-500 text-white'
            : 'border-2 border-gray-200 text-transparent hover:border-green-400'
        }`}
      >
        <Check size={18} strokeWidth={3} />
      </button>
    </div>
  )
}