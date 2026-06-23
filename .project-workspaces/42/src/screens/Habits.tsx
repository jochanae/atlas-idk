import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Habit } from '../types'

interface Props {
  habits: Habit[]
  addHabit: (h: Omit<Habit, 'id' | 'completedDates' | 'createdAt'>) => void
  deleteHabit: (id: string) => void
}

const ICONS = ['💪', '📚', '💧', '🧘', '🏃', '🥗', '😴', '✍️', '🎯', '🎸', '🌿', '☀️']
const COLORS = ['#f97316', '#8b5cf6', '#0ea5e9', '#ec4899', '#22c55e', '#f59e0b', '#ef4444', '#6366f1']

export default function Habits({ habits, addHabit, deleteHabit }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('💪')
  const [color, setColor] = useState('#f97316')

  const submit = () => {
    if (!name.trim()) return
    addHabit({ name: name.trim(), icon, color, frequency: 'daily', targetDays: [] })
    setName('')
    setIcon('💪')
    setColor('#f97316')
    setShowForm(false)
  }

  return (
    <div className="px-4 pt-12 pb-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Habits</h1>
        <button
          onClick={() => setShowForm(true)}
          className="w-9 h-9 rounded-full bg-brand-500 flex items-center justify-center text-white active:scale-95 transition-transform"
        >
          <Plus size={20} />
        </button>
      </div>

      {habits.length === 0 && !showForm && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🌱</p>
          <p className="text-gray-500 font-medium">No habits yet</p>
          <p className="text-gray-400 text-sm mt-1">Tap + to add your first one</p>
        </div>
      )}

      <div className="space-y-3">
        {habits.map(habit => (
          <div key={habit.id} className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: habit.color + '22' }}
            >
              {habit.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate">{habit.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{habit.completedDates.length} total check-ins</p>
            </div>
            <button
              onClick={() => deleteHabit(habit.id)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-300 active:text-red-400 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Add habit sheet */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-[430px] mx-auto bg-white rounded-t-3xl p-6 pb-10 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">New Habit</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400">
                <X size={20} />
              </button>
            </div>

            {/* Name */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Name
              </label>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="e.g. Meditate for 10 mins"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 placeholder-gray-300 focus:outline-none focus:border-brand-400 text-base"
              />
            </div>

            {/* Icon picker */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Icon
              </label>
              <div className="flex flex-wrap gap-2">
                {ICONS.map(i => (
                  <button
                    key={i}
                    onClick={() => setIcon(i)}
                    className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center border-2 transition-colors ${
                      icon === i ? 'border-brand-400 bg-brand-50' : 'border-transparent bg-gray-50'
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Color
              </label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full border-2 transition-transform active:scale-90 ${
                      color === c ? 'border-gray-700 scale-110' : 'border-transparent'
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={submit}
              disabled={!name.trim()}
              className="w-full bg-brand-500 text-white font-semibold py-3.5 rounded-2xl active:scale-[0.98] transition-all disabled:opacity-40"
            >
              Add Habit
            </button>
          </div>
        </div>
      )}
    </div>
  )
}