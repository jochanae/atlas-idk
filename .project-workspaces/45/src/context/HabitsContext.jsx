import { createContext, useContext, useState, useEffect } from 'react';

const HabitsContext = createContext();

export function HabitsProvider({ children }) {
  const [habits, setHabits] = useState(() => {
    const saved = localStorage.getItem('habits');
    return saved ? JSON.parse(saved) : [];
  });

  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('habits', JSON.stringify(habits));
  }, [habits]);

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const addHabit = (name, frequency = 'daily') => {
    const newHabit = {
      id: Date.now(),
      name,
      frequency,
      completedDates: [],
      createdAt: new Date().toISOString(),
    };
    setHabits(prev => [...prev, newHabit]);
  };

  const deleteHabit = (id) => {
    setHabits(prev => prev.filter(h => h.id !== id));
  };

  const toggleCompletion = (id) => {
    const today = new Date().toISOString().split('T')[0];
    setHabits(prev =>
      prev.map(h => {
        if (h.id !== id) return h;
        const alreadyDone = h.completedDates.includes(today);
        return {
          ...h,
          completedDates: alreadyDone
            ? h.completedDates.filter(d => d !== today)
            : [...h.completedDates, today],
        };
      })
    );
  };

  const getStreak = (habit) => {
    if (!habit.completedDates.length) return 0;
    const sorted = [...habit.completedDates].sort((a, b) => new Date(b) - new Date(a));
    let streak = 0;
    let current = new Date();
    current.setHours(0, 0, 0, 0);

    for (let i = 0; i < sorted.length; i++) {
      const date = new Date(sorted[i]);
      date.setHours(0, 0, 0, 0);
      const diff = (current - date) / (1000 * 60 * 60 * 24);
      if (diff === streak) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  };

  return (
    <HabitsContext.Provider value={{ habits, darkMode, setDarkMode, addHabit, deleteHabit, toggleCompletion, getStreak }}>
      {children}
    </HabitsContext.Provider>
  );
}

export function useHabits() {
  return useContext(HabitsContext);
}