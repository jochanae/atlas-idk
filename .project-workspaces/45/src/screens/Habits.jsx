import { useState } from 'react';
import { useHabits } from '../context/HabitsContext';

export default function Habits() {
  const { habits, addHabit, deleteHabit } = useHabits();
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const handleAdd = () => {
    if (!name.trim()) return;
    addHabit(name.trim(), frequency);
    setName('');
    setFrequency('daily');
    setShowForm(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Habits</h1>
        <button
          onClick={() => setShowForm(true)}
          className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xl shadow-md active:scale-95 transition-transform"
        >
          +
        </button>
      </div>

      {/* Add habit form */}
      {showForm && (
        <div className="mx-5 mb-4 p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">New Habit</p>
          <input
            type="text"
            placeholder="e.g. Drink water"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            autoFocus
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-3"
          />
          <select
            value={frequency}
            onChange={e => setFrequency(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-3"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowForm(false); setName(''); }}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium active:scale-95 transition-transform"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="flex-1 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-medium active:scale-95 transition-transform"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Habit list */}
      <div className="flex-1 px-5 space-y-3">
        {habits.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-500 dark:text-gray-400 font-medium">No habits yet</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Tap + to create your first habit</p>
          </div>
        ) : (
          habits.map(habit => (
            <div
              key={habit.id}
              className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">{habit.name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 capitalize">{habit.frequency}</p>
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mr-1">
                {habit.completedDates.length} done
              </div>
              {confirmDelete === habit.id ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-xs px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                  >
                    Keep
                  </button>
                  <button
                    onClick={() => { deleteHabit(habit.id); setConfirmDelete(null); }}
                    className="text-xs px-2 py-1 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(habit.id)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-500 transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}