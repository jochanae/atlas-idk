import { HashRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import FunnelsPage from './pages/FunnelsPage';
import MetricsPage from './pages/MetricsPage';
import LinksPage from './pages/LinksPage';
import InsightsPage from './pages/InsightsPage';
import MapPage from './pages/MapPage';

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto pb-24">
          <Routes>
            <Route path="/" element={<FunnelsPage />} />
            <Route path="/metrics" element={<MetricsPage />} />
            <Route path="/links" element={<LinksPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/map" element={<MapPage />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </HashRouter>
  );
}