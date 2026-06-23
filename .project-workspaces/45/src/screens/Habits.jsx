import React, { useState } from 'react'
import { useHabits } from '../context/HabitsContext'

const EMOJI_OPTIONS = ['💧', '🚶', '📚', '🏋️', '🧘', '🥗', '😴', '✍️', '🎯', '💊', '🧹', '☀️']
const COLOR_OPTIONS = [
  '#22c55e', '#3b82f6', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
]

export default function Habits() {
  const { habits, addHabit, deleteHabit, getStreak } = useHabits()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('✅')
  const [color, setColor] = useState('#22c55e')
  const [confirmDelete, setConfirmDelete] = useState(null)

  function handleAdd() {
    if (!name.trim()) return
    addHabit(name.trim(), emoji, color)
    setName('')
    setEmoji('✅')
    setColor('#22c55e')
    setShowForm(false)
  }

  return (
    <div className="px-5 pt-10 pb-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Habits</h1>
        <button
          onClick={() => setShowForm(v => !v)}
          className="w-9 h-9 bg-green-500 rounded-full flex items-center justify-center text-white shadow-sm active:scale-95 transition-transform"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
            <path strokeLinecap="round" d="M12 4v16m-8-8h16" />
          </svg>
        </button>
      </div>

      {/* Add habit form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">New Habit</p>
          <input
            type="text"
            placeholder="Habit name..."
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-green-400 mb-3"
          />
          <p className="text-xs text-gray-500 mb-2">Pick an emoji</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {EMOJI_OPTIONS.map(e => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`w-9 h-9 rounded-xl text-xl flex items-center justify-center transition-all ${
                  emoji === e ? 'bg-green-100 scale-110' : 'bg-gray-50'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mb-2">Pick a color</p>
          <div className="flex gap-2 mb-4">
            {COLOR_OPTIONS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-300' : ''}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 font-medium active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!name.trim()}
              className="flex-1 py-2.5 rounded-xl bg-green-500 text-white text-sm font-semibold active:scale-95 disabled:opacity-40"
            >
              Add Habit
            </button>
          </div>
        </div>
      )}

      {/* Habits list */}
      <div className="space-y-3">
        {habits.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-12">
            Tap + to add your first habit.
          </p>
        )}
        {habits.map(habit => {
          const streak = getStreak(habit.id)
          return (
            <div
              key={habit.id}
              className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                style={{ backgroundColor: habit.color + '20' }}
              >
                {habit.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{habit.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {streak > 0 ? `🔥 ${streak} day streak` : 'Start your streak today'}
                </p>
              </div>
              {confirmDelete === habit.id ? (
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-xs text-gray-400 px-2 py-1 rounded-lg border border-gray-200"
                  >
                    Keep
                  </button>
                  <button
                    onClick={() => { deleteHabit(habit.id); setConfirmDelete(null) }}
                    className="text-xs text-red-500 px-2 py-1 rounded-lg border border-red-200"
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(habit.id)}
                  className="text-gray-300 hover:text-red-400 transition-colors shrink-0 active:scale-95"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}