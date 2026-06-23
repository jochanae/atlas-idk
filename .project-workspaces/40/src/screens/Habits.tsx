import { useState } from 'react'
import { HabitStore, Habit } from '../types'
import { COLORS } from '../utils'
import { Plus, Trash2, X, Check } from 'lucide-react'

type Props = Pick<HabitStore, 'habits' | 'addHabit' | 'deleteHabit'>

const EMOJIS = ['🚶', '📖', '💧', '🏋️', '🧘', '🍎', '😴', '✍️', '🎯', '🌿', '💊', '🎵']

export default function Habits({ habits, addHabit, deleteHabit }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🎯')
  const [color, setColor] = useState(COLORS[0])
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  function handleAdd() {
    if (!name.trim()) return
    addHabit({ name: name.trim(), emoji, frequency: 'daily', color })
    setName('')
    setEmoji('🎯')
    setColor(COLORS[0])
    setShowForm(false)
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="pt-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Habits</h1>
          <p className="text-slate-400 text-sm mt-0.5">{habits.length} active</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        >
          <Plus size={22} className="text-white" />
        </button>
      </div>

      {/* Add habit form */}
      {showForm && (
        <div className="bg-slate-800 rounded-2xl p-4 space-y-4 border border-slate-700">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">New Habit</h2>
            <button onClick={() => setShowForm(false)} className="text-slate-400">
              <X size={20} />
            </button>
          </div>

          <input
            autoFocus
            type="text"
            placeholder="Habit name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="w-full bg-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />

          {/* Emoji picker */}
          <div>
            <p className="text-slate-400 text-xs mb-2">Emoji</p>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all ${
                    emoji === e ? 'bg-slate-600 ring-2 ring-green-400' : 'bg-slate-700'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <p className="text-slate-400 text-xs mb-2">Color</p>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <button
            onClick={handleAdd}
            disabled={!name.trim()}
            className="w-full bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <Check size={18} />
            Add Habit
          </button>
        </div>
      )}

      {/* Habit list */}
      {habits.length === 0 && !showForm ? (
        <div className="bg-slate-800 rounded-2xl p-8 text-center">
          <p className="text-4xl mb-3">🌱</p>
          <p className="text-white font-medium">No habits yet</p>
          <p className="text-slate-400 text-sm mt-1">Tap + to add your first habit</p>
        </div>
      ) : (
        <div className="space-y-2">
          {habits.map((habit) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              onDelete={() => deleteHabit(habit.id)}
              confirmDelete={confirmDelete}
              setConfirmDelete={setConfirmDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function HabitRow({
  habit,
  onDelete,
  confirmDelete,
  setConfirmDelete,
}: {
  habit: Habit
  onDelete: () => void
  confirmDelete: string | null
  setConfirmDelete: (id: string | null) => void
}) {
  const isConfirming = confirmDelete === habit.id

  return (
    <div className="bg-slate-800 rounded-2xl p-3.5 flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
        style={{ backgroundColor: habit.color + '33' }}
      >
        {habit.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{habit.name}</p>
        <p className="text-slate-500 text-xs mt-0.5">{habit.frequency}</p>
      </div>
      {isConfirming ? (
        <div className="flex gap-2">
          <button
            onClick={() => {
              onDelete()
              setConfirmDelete(null)
            }}
            className="text-xs bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirmDelete(null)}
            className="text-xs bg-slate-700 text-slate-400 px-3 py-1.5 rounded-lg"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmDelete(habit.id)}
          className="text-slate-600 hover:text-red-400 transition-colors p-1"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  )
}