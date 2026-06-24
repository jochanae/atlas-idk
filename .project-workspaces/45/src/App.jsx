import { HashRouter, Routes, Route } from 'react-router-dom';
import { HabitsProvider } from './context/HabitsContext';
import BottomNav from './components/BottomNav';
import Dashboard from './screens/Dashboard';
import Habits from './screens/Habits';
import Progress from './screens/Progress';

export default function App() {
  return (
    <HabitsProvider>
      <HashRouter>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
          <div className="max-w-md mx-auto min-h-screen flex flex-col pb-20">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/habits" element={<Habits />} />
              <Route path="/progress" element={<Progress />} />
            </Routes>
          </div>
          <BottomNav />
        </div>
      </HashRouter>
    </HabitsProvider>
  );
}