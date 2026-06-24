import { useHabits } from '../context/HabitsContext';

export default function Progress() {
  const { habits, getStreak } = useHabits();

  const getLast7Days = () => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });
  };

  const last7 = getLast7Days();

  const getCompletionRate = (habit) => {
    if (!last7.length) return 0;
    const done = last7.filter(d => habit.completedDates.includes(d)).length;
    return Math.round((done / last7.length) * 100);
  };

  const totalCompletions = habits.reduce((sum, h) => sum + h.completedDates.length, 0);
  const bestStreak = habits.reduce((max, h) => Math.max(max, getStreak(h)), 0);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      {/* Header */}
      <div className="px-5 pt-12 pb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Progress</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Last 7 days</p>
      </div>

      {/* Summary cards */}
      <div className="px-5 mb-6 grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-400 dark:text-gray-500 font-medium mb-1">Total completions</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalCompletions}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-400 dark:text-gray-500 font-medium mb-1">Best streak</p>
          <p className="text-2xl font-bold text-orange-500">
            {bestStreak > 0 ? `🔥 ${bestStreak}` : '—'}
          </p>
        </div>
      </div>

      {/* Per-habit breakdown */}
      <div className="flex-1 px-5 space-y-4">
        {habits.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-gray-500 dark:text-gray-400 font-medium">No data yet</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Add habits and start tracking</p>
          </div>
        ) : (
          habits.map(habit => {
            const rate = getCompletionRate(habit);
            const streak = getStreak(habit);
            return (
              <div
                key={habit.id}
                className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="font-medium text-gray-900 dark:text-white truncate flex-1 mr-2">{habit.name}</p>
                  <span className="text-sm font-semibold text-indigo-500">{rate}%</span>
                </div>

                {/* 7-day dot grid */}
                <div className="flex gap-1.5 mb-3">
                  {last7.map(date => {
                    const done = habit.completedDates.includes(date);
                    const isToday = date === new Date().toISOString().split('T')[0];
                    return (
                      <div
                        key={date}
                        className={`flex-1 h-2 rounded-full transition-colors duration-200
                          ${done
                            ? 'bg-indigo-500'
                            : isToday
                              ? 'bg-gray-200 dark:bg-gray-700 ring-1 ring-indigo-400'
                              : 'bg-gray-200 dark:bg-gray-700'
                          }`}
                      />
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                  <span>{habit.completedDates.length} total completions</span>
                  {streak > 0 && <span className="text-orange-500 dark:text-orange-400">🔥 {streak} day streak</span>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}