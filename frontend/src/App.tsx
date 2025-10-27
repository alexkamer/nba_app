import { BrowserRouter as Router, Routes, Route, Link, Navigate, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import PlayerSearch from './pages/PlayerSearch';
import PlayerProfile from './pages/PlayerProfile';
import GamePage from './pages/GamePage';
import GamePreview from './pages/GamePreview';
import Schedule from './pages/Schedule';
import LiveGame from './pages/LiveGame';
import Teams from './pages/Teams';
import TeamPage from './pages/TeamPage';
import Predictions from './pages/Predictions';
import Correlations from './pages/Correlations';
import BetterTrends from './pages/BetterTrends';
import ChatBot from './pages/ChatBot';
import ErrorBoundary from './components/ErrorBoundary';

// Redirect component for old /players/:athleteId URLs
function PlayerRedirect() {
  const { athleteId } = useParams();
  return <Navigate to={`/player/${athleteId}`} replace />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Analytics Dropdown Component
function AnalyticsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-slate-300 hover:text-white transition-colors flex items-center"
      >
        Analytics
        <svg
          className={`ml-1 w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-lg py-2 z-50">
          <Link
            to="/predictions"
            className="block px-4 py-2 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            onClick={() => setIsOpen(false)}
          >
            Predictions
          </Link>
          <Link
            to="/correlations"
            className="block px-4 py-2 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            onClick={() => setIsOpen(false)}
          >
            Correlations
          </Link>
          <Link
            to="/better-trends"
            className="block px-4 py-2 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            onClick={() => setIsOpen(false)}
          >
            Better Trends
          </Link>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Router>
          <div className="min-h-screen bg-slate-900 text-white">
          {/* Navigation */}
          <nav className="bg-slate-800 border-b border-slate-700">
            <div className="container mx-auto px-4">
              <div className="flex items-center justify-between h-16">
                <Link to="/" className="text-2xl font-bold text-orange-500">
                  🏀 NBA Analytics
                </Link>
                <div className="flex space-x-6">
                  <Link
                    to="/"
                    className="text-slate-300 hover:text-white transition-colors"
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/players"
                    className="text-slate-300 hover:text-white transition-colors"
                  >
                    Players
                  </Link>
                  <Link
                    to="/teams"
                    className="text-slate-300 hover:text-white transition-colors"
                  >
                    Teams
                  </Link>
                  <Link
                    to="/schedule"
                    className="text-slate-300 hover:text-white transition-colors"
                  >
                    Schedule
                  </Link>
                  <AnalyticsDropdown />
                  <Link
                    to="/chat"
                    className="text-slate-300 hover:text-white transition-colors"
                  >
                    Chat Bot
                  </Link>
                </div>
              </div>
            </div>
          </nav>

          {/* Main Content */}
          <main className="container mx-auto px-4 py-8">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/players" element={<PlayerSearch />} />
              <Route path="/player/:athleteId" element={<PlayerProfile />} />
              <Route path="/players/:athleteId" element={<PlayerRedirect />} />
              <Route path="/teams" element={<Teams />} />
              <Route path="/team/:teamId" element={<TeamPage />} />
              <Route path="/game/:gameId" element={<GamePage />} />
              <Route path="/preview/:gameId" element={<GamePreview />} />
              <Route path="/live/:gameId" element={<LiveGame />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/predictions" element={<Predictions />} />
              <Route path="/correlations" element={<Correlations />} />
              <Route path="/better-trends" element={<BetterTrends />} />
              <Route path="/better-trends/:tab" element={<BetterTrends />} />
              <Route path="/better-trends/:tab/:date" element={<BetterTrends />} />
              <Route path="/chat" element={<ChatBot />} />
            </Routes>
          </main>
          </div>
        </Router>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
