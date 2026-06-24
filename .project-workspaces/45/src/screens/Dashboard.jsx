import { useHabits } from '../context/HabitsContext';

export default function Dashboard() {
  const { habits, darkMode, setDarkMode, toggleCompletion, getStreak } = useHabits();
  const today = new Date().toISOString().split('T')[0];
  const completed = habits.filter(h => h.completedDates.includes(today));

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Today</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg transition-colors duration-200"
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Progress summary */}
      <div className="mx-5 mb-6 p-4 rounded-2xl bg-indigo-500 dark:bg-indigo-600">
        <p className="text-indigo-100 text-sm font-medium mb-1">Today's progress</p>
        <p className="text-white text-3xl font-bold">
          {completed.length} <span className="text-indigo-200 text-lg font-normal">/ {habits.length}</span>
        </p>
        <div className="mt-3 h-2 bg-indigo-400 dark:bg-indigo-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-500"
            style={{ width: habits.length ? `${(completed.length / habits.length) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* Habit list */}
      <div className="flex-1 px-5 space-y-3">
        {habits.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🌱</p>
            <p className="text-gray-500 dark:text-gray-400 font-medium">No habits yet</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Head to Habits to add your first one</p>
          </div>
        ) : (
          habits.map(habit => {
            const done = habit.completedDates.includes(today);
            const streak = getStreak(habit);
            return (
              <button
                key={habit.id}
                onClick={() => toggleCompletion(habit.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 text-left
                  ${done
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700'
                    : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800'
                  }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-200
                  ${done ? 'bg-indigo-500' : 'bg-gray-100 dark:bg-gray-800'}`}>
                  {done && <span className="text-white text-sm">✓</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate transition-colors duration-200
                    ${done ? 'text-indigo-700 dark:text-indigo-300 line-through' : 'text-gray-900 dark:text-white'}`}>
                    {habit.name}
                  </p>
                  {streak > 0 && (
                    <p className="text-xs text-orange-500 dark:text-orange-400 mt-0.5">🔥 {streak} day streak</p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}