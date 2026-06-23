import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { useHabits } from '../store/useHabits'

interface Props {
  store: ReturnType<typeof useHabits>
}

const EMOJI_OPTIONS = ['🏃', '📚', '💧', '🧘', '🥗', '🚶', '💪', '🎯', '✍️', '🛌', '🎵', '🌿']
const COLOR_OPTIONS = [
  '#22c55e', '#3b82f6', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
]

export default function Habits({ store }: Props) {
  const { habits, addHabit, deleteHabit, getStreak } = store
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🎯')
  const [color, setColor] = useState('#22c55e')

  function handleAdd() {
    if (!name.trim()) return
    addHabit(name.trim(), emoji, color)
    setName('')
    setEmoji('🎯')
    setColor('#22c55e')
    setShowForm(false)
  }

  return (
    <div className="px-5 pt-14 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Habits</h1>
        <button
          onClick={() => setShowForm(true)}
          className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white shadow-md active:scale-95 transition-transform"
        >
          <Plus size={20} strokeWidth={2.5} />
        </button>
      </div>

      {/* Habits list */}
      {habits.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-4">🌱</p>
          <p className="font-semibold text-gray-600">No habits yet</p>
          <p className="text-sm mt-1">Tap + to create your first habit</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {habits.map(habit => {
            const streak = getStreak(habit.id)
            return (
              <div
                key={habit.id}
                className="flex items-center gap-4 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                  style={{ backgroundColor: habit.color + '20' }}
                >
                  {habit.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{habit.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {streak > 0 ? `🔥 ${streak} day streak` : 'Daily'}
                  </p>
                </div>
                <button
                  onClick={() => deleteHabit(habit.id)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors active:scale-90"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add habit bottom sheet */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
          />

          {/* Sheet */}
          <div className="relative w-full max-w-md mx-auto bg-white rounded-t-3xl p-6 pb-safe shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">New Habit</h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
              >
                <X size={16} />
              </button>
            </div>

            {/* Name input */}
            <label className="block text-sm font-medium text-gray-600 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Meditate 10 minutes"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-green-400 mb-4"
              autoFocus
            />

            {/* Emoji picker */}
            <label className="block text-sm font-medium text-gray-600 mb-2">Icon</label>
            <div className="flex flex-wrap gap-2 mb-4">
              {EMOJI_OPTIONS.map(e => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${
                    emoji === e ? 'bg-green-100 ring-2 ring-green-400' : 'bg-gray-50'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>

            {/* Color picker */}
            <label className="block text-sm font-medium text-gray-600 mb-2">Color</label>
            <div className="flex gap-2 mb-6">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-all active:scale-90 ${
                    color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>

            {/* Submit */}
            <button
              onClick={handleAdd}
              disabled={!name.trim()}
              className="w-full bg-green-500 disabled:bg-gray-200 text-white disabled:text-gray-400 rounded-2xl py-4 font-semibold text-base transition-colors active:scale-95"
            >
              Add Habit
            </button>
          </div>
        </div>
      )}
    </div>
  )
}