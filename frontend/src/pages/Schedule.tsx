import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

// Eastern Conference teams
const EASTERN_CONFERENCE = ['ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DET', 'IND', 'MIA', 'MIL', 'NYK', 'ORL', 'PHI', 'TOR', 'WAS'];
// Western Conference teams
const WESTERN_CONFERENCE = ['DAL', 'DEN', 'GSW', 'HOU', 'LAC', 'LAL', 'MEM', 'MIN', 'NOP', 'OKC', 'PHX', 'POR', 'SAC', 'SAS', 'UTA'];

export default function Schedule() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get today's date in local timezone
  const today = (() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })();

  // Initialize state from URL params or defaults
  const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || today);
  const [teamFilter, setTeamFilter] = useState<string>(searchParams.get('team') || '');
  const [sortBy, setSortBy] = useState<'status' | 'time'>((searchParams.get('sort') as 'status' | 'time') || 'status');
  const [showOnlyLive, setShowOnlyLive] = useState(searchParams.get('live') === 'true');
  const [conferenceFilter, setConferenceFilter] = useState<'all' | 'east' | 'west'>((searchParams.get('conference') as 'all' | 'east' | 'west') || 'all');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const hasScrolledToLive = useRef(false);

  // Convert YYYY-MM-DD to YYYYMMDD for API
  const apiDate = selectedDate.replace(/-/g, '');

  // Sync state to URL params
  useEffect(() => {
    const params = new URLSearchParams();

    // Only add non-default values to keep URL clean
    if (selectedDate !== today) {
      params.set('date', selectedDate);
    }
    if (teamFilter) {
      params.set('team', teamFilter);
    }
    if (sortBy !== 'status') {
      params.set('sort', sortBy);
    }
    if (showOnlyLive) {
      params.set('live', 'true');
    }
    if (conferenceFilter !== 'all') {
      params.set('conference', conferenceFilter);
    }

    // Update URL without causing navigation
    setSearchParams(params, { replace: true });
  }, [selectedDate, teamFilter, sortBy, showOnlyLive, conferenceFilter, today, setSearchParams]);

  const { data: schedule, isLoading, error } = useQuery({
    queryKey: ['schedule', apiDate],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/schedule?date=${apiDate}`);
      return data;
    },
    refetchInterval: (data) => {
      // Auto-refresh every 30 seconds if there are live games
      const hasLiveGames = data?.games?.some((game: any) => game.status.state === 'in');
      return hasLiveGames ? 30000 : false;
    },
  });

  const formatDate = (dateString: string) => {
    // Parse as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const getCountdown = (dateString: string) => {
    const gameTime = new Date(dateString).getTime();
    const now = Date.now();
    const diff = gameTime - now;

    if (diff <= 0) return null;

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `Starts in ${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `Starts in ${hours}h ${minutes}m`;
    } else {
      return `Starts in ${minutes}m`;
    }
  };

  // Auto-scroll to first live game on page load
  useEffect(() => {
    if (!isLoading && schedule?.games && !hasScrolledToLive.current) {
      const hasLiveGames = schedule.games.some((game: any) => game.status.state === 'in');
      if (hasLiveGames && selectedDate === today) {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
          const firstLiveGame = document.querySelector('.live-game-glow');
          if (firstLiveGame) {
            firstLiveGame.scrollIntoView({ behavior: 'smooth', block: 'center' });
            hasScrolledToLive.current = true;
          }
        }, 500);
      }
    }
  }, [isLoading, schedule, selectedDate, today]);

  // Reset scroll flag when date changes and trigger transition
  useEffect(() => {
    hasScrolledToLive.current = false;
    setIsTransitioning(true);
    const timer = setTimeout(() => setIsTransitioning(false), 300);
    return () => clearTimeout(timer);
  }, [selectedDate]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle keyboard if no input is focused
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = new Date(selectedDate);
        prev.setDate(prev.getDate() - 1);
        const year = prev.getFullYear();
        const month = String(prev.getMonth() + 1).padStart(2, '0');
        const day = String(prev.getDate()).padStart(2, '0');
        setSelectedDate(`${year}-${month}-${day}`);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = new Date(selectedDate);
        next.setDate(next.getDate() + 1);
        const year = next.getFullYear();
        const month = String(next.getMonth() + 1).padStart(2, '0');
        const day = String(next.getDate()).padStart(2, '0');
        setSelectedDate(`${year}-${month}-${day}`);
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setSelectedDate(today);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setTeamFilter('');
        setShowOnlyLive(false);
      } else if (e.key === 'l' || e.key === 'L') {
        if (schedule?.games?.some((game: any) => game.status.state === 'in')) {
          e.preventDefault();
          setShowOnlyLive(!showOnlyLive);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedDate, today, showOnlyLive, schedule]);

  const getStatusBadge = (status: any) => {
    if (status.state === 'pre') {
      return (
        <span className="px-3 py-1 bg-blue-500/20 border border-blue-500/50 rounded-full text-blue-400 text-xs font-bold tracking-wider">
          {status.short_detail}
        </span>
      );
    } else if (status.state === 'in') {
      return (
        <span className="px-3 py-1 bg-green-500/20 border border-green-500/50 rounded-full text-green-400 text-xs font-bold tracking-wider animate-pulse">
          LIVE - {status.display_clock}
        </span>
      );
    } else {
      return (
        <span className="px-3 py-1 bg-orange-500/20 border border-orange-500/50 rounded-full text-orange-400 text-xs font-bold tracking-wider">
          FINAL
        </span>
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold mb-2">NBA Schedule</h1>
        <p className="text-slate-400">
          View games for any date
        </p>
      </div>

      {/* LIVE NOW Floating Badge */}
      {schedule?.games?.some((game: any) => game.status.state === 'in') && (
        <div className="fixed top-16 sm:top-20 right-4 sm:right-6 z-50">
          <button
            onClick={() => {
              setShowOnlyLive(!showOnlyLive);
              // Scroll to first live game if enabling filter
              if (!showOnlyLive) {
                setTimeout(() => {
                  const firstLiveGame = document.querySelector('.live-game-glow');
                  if (firstLiveGame) {
                    firstLiveGame.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }, 100);
              }
            }}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-3 rounded-full font-bold text-xs sm:text-sm shadow-2xl transition-all duration-200 hover:scale-110 active:scale-95 touch-manipulation ${
              showOnlyLive
                ? 'bg-green-500 text-white border-2 border-green-400'
                : 'bg-red-500 text-white border-2 border-red-400 animate-pulse'
            }`}
          >
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
            </span>
            <span className="hidden xs:inline">{showOnlyLive ? 'SHOW ALL' : 'LIVE NOW'}</span>
            <span className="xs:hidden">{showOnlyLive ? 'ALL' : 'LIVE'}</span>
          </button>
        </div>
      )}

      {/* Date Navigation & Filters - Sticky */}
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm rounded-xl p-6 border border-slate-700 shadow-xl space-y-4">
        {/* Week-at-a-Glance Date Picker */}
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-3">
            Select Date
          </label>
          <div className="flex items-center gap-2">
            {/* Previous Week Button */}
            <button
              onClick={() => {
                const prev = new Date(selectedDate);
                prev.setDate(prev.getDate() - 7);
                const year = prev.getFullYear();
                const month = String(prev.getMonth() + 1).padStart(2, '0');
                const day = String(prev.getDate()).padStart(2, '0');
                setSelectedDate(`${year}-${month}-${day}`);
              }}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-white transition-colors font-bold"
              title="Previous Week"
            >
              ←
            </button>

            {/* Week Days */}
            <div className="flex-1 grid grid-cols-7 gap-1 sm:gap-2">
              {(() => {
                const selected = new Date(selectedDate);
                const days = [];

                // Generate 7 days: yesterday, today, and next 5 days
                for (let i = -1; i < 6; i++) {
                  const date = new Date(selected);
                  date.setDate(date.getDate() - (selected.getDate() - new Date().getDate()) + i);
                  const year = date.getFullYear();
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  const dateStr = `${year}-${month}-${day}`;

                  const isToday = dateStr === today;
                  const isSelected = dateStr === selectedDate;

                  days.push(
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDate(dateStr)}
                      className={`flex flex-col items-center py-2 sm:py-3 px-1 rounded-lg transition-all duration-200 touch-manipulation ${
                        isSelected
                          ? 'bg-orange-500 border-2 border-orange-400 text-white shadow-lg scale-105'
                          : isToday
                          ? 'bg-slate-700 border-2 border-orange-500/50 text-white hover:bg-slate-600 active:bg-slate-600'
                          : 'bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 hover:border-slate-500 active:bg-slate-600'
                      }`}
                      title={date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    >
                      <span className="text-[10px] sm:text-xs font-semibold opacity-75">
                        {date.toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                      <span className="text-base sm:text-lg font-bold">
                        {date.getDate()}
                      </span>
                      {isToday && !isSelected && (
                        <span className="text-[8px] sm:text-[10px] text-orange-400 font-bold">TODAY</span>
                      )}
                    </button>
                  );
                }

                return days;
              })()}
            </div>

            {/* Next Week Button */}
            <button
              onClick={() => {
                const next = new Date(selectedDate);
                next.setDate(next.getDate() + 7);
                const year = next.getFullYear();
                const month = String(next.getMonth() + 1).padStart(2, '0');
                const day = String(next.getDate()).padStart(2, '0');
                setSelectedDate(`${year}-${month}-${day}`);
              }}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-white transition-colors font-bold"
              title="Next Week"
            >
              →
            </button>
          </div>
        </div>

        {/* Conference Filter */}
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-3">
            Conference
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setConferenceFilter('all')}
              className={`flex-1 px-3 sm:px-4 py-3 rounded-lg font-semibold transition-colors text-sm sm:text-base touch-manipulation ${
                conferenceFilter === 'all'
                  ? 'bg-orange-500 text-white border border-orange-600'
                  : 'bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600 active:bg-slate-600'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setConferenceFilter('east')}
              className={`flex-1 px-3 sm:px-4 py-3 rounded-lg font-semibold transition-colors text-sm sm:text-base touch-manipulation ${
                conferenceFilter === 'east'
                  ? 'bg-blue-500 text-white border border-blue-600'
                  : 'bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600 active:bg-slate-600'
              }`}
            >
              <span className="hidden sm:inline">🔵 </span>East
            </button>
            <button
              onClick={() => setConferenceFilter('west')}
              className={`flex-1 px-3 sm:px-4 py-3 rounded-lg font-semibold transition-colors text-sm sm:text-base touch-manipulation ${
                conferenceFilter === 'west'
                  ? 'bg-red-500 text-white border border-red-600'
                  : 'bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600 active:bg-slate-600'
              }`}
            >
              <span className="hidden sm:inline">🔴 </span>West
            </button>
          </div>
        </div>

        {/* Team Filter & Sort Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Team Filter */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-3">
              Filter by Team
            </label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                placeholder="Search team name or abbreviation..."
                className="flex-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
              />
              {teamFilter && (
                <button
                  onClick={() => setTeamFilter('')}
                  className="px-4 py-3 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-slate-400 hover:text-white transition-colors font-bold"
                  title="Clear filter"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Sort Options */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-3">
              Sort By
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setSortBy('status')}
                className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-colors ${
                  sortBy === 'status'
                    ? 'bg-orange-500 text-white border border-orange-600'
                    : 'bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600'
                }`}
              >
                Status
              </button>
              <button
                onClick={() => setSortBy('time')}
                className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-colors ${
                  sortBy === 'time'
                    ? 'bg-orange-500 text-white border border-orange-600'
                    : 'bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600'
                }`}
              >
                Time
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Loading State - Skeleton Cards */}
      {isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl animate-pulse"
            >
              {/* Status Badge Skeleton */}
              <div className="flex justify-center mb-4">
                <div className="h-7 w-32 bg-slate-700 rounded-full"></div>
              </div>

              {/* Teams Skeleton */}
              <div className="flex items-center justify-between gap-6">
                {/* Away Team */}
                <div className="flex-1 flex flex-col items-center">
                  <div className="w-20 h-20 bg-slate-700 rounded-full mb-3"></div>
                  <div className="h-5 w-16 bg-slate-700 rounded mb-1"></div>
                  <div className="h-3 w-12 bg-slate-700 rounded"></div>
                </div>

                {/* VS */}
                <div className="text-slate-700 text-xl font-bold">@</div>

                {/* Home Team */}
                <div className="flex-1 flex flex-col items-center">
                  <div className="w-20 h-20 bg-slate-700 rounded-full mb-3"></div>
                  <div className="h-5 w-16 bg-slate-700 rounded mb-1"></div>
                  <div className="h-3 w-12 bg-slate-700 rounded"></div>
                </div>
              </div>

              {/* Game Info Skeleton */}
              <div className="mt-4 space-y-2">
                <div className="h-4 w-24 bg-slate-700 rounded mx-auto"></div>
                <div className="h-3 w-48 bg-slate-700 rounded mx-auto"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-6 text-center">
          <p className="text-red-400">Error loading schedule. Please try again.</p>
        </div>
      )}

      {/* Games List */}
      {schedule && !isLoading && (
        <div className={`space-y-4 ${isTransitioning ? 'fade-out' : 'fade-in'}`}>
          {/* Date Header */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-orange-500">
              {formatDate(selectedDate)}
            </h2>
            <p className="text-slate-400 mt-1">
              {(() => {
                const filteredGames = schedule.games.filter((game: any) => {
                  if (!teamFilter) return true;
                  const filter = teamFilter.toLowerCase();
                  return (
                    game.home_team?.name?.toLowerCase().includes(filter) ||
                    game.home_team?.abbreviation?.toLowerCase().includes(filter) ||
                    game.away_team?.name?.toLowerCase().includes(filter) ||
                    game.away_team?.abbreviation?.toLowerCase().includes(filter)
                  );
                });
                const count = filteredGames.length;
                return `${count} ${count === 1 ? 'game' : 'games'}${teamFilter ? ' (filtered)' : ''}`;
              })()}
            </p>
            {schedule.games?.some((game: any) => game.status.state === 'in') && (
              <p className="text-green-400 text-sm mt-2 flex items-center justify-center gap-2">
                <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                Live games - Auto-updating every 30s
              </p>
            )}
          </div>

          {/* Games Grid */}
          {(() => {
            // Filter games by team, live status, and conference
            let filteredGames = schedule.games.filter((game: any) => {
              // Filter by live status if enabled
              if (showOnlyLive && game.status.state !== 'in') return false;

              // Filter by conference
              if (conferenceFilter !== 'all') {
                const homeTeam = game.home_team?.abbreviation;
                const awayTeam = game.away_team?.abbreviation;
                const isEastGame = EASTERN_CONFERENCE.includes(homeTeam) || EASTERN_CONFERENCE.includes(awayTeam);
                const isWestGame = WESTERN_CONFERENCE.includes(homeTeam) || WESTERN_CONFERENCE.includes(awayTeam);

                if (conferenceFilter === 'east' && !isEastGame) return false;
                if (conferenceFilter === 'west' && !isWestGame) return false;
              }

              // Filter by team
              if (!teamFilter) return true;
              const filter = teamFilter.toLowerCase();
              return (
                game.home_team?.name?.toLowerCase().includes(filter) ||
                game.home_team?.abbreviation?.toLowerCase().includes(filter) ||
                game.away_team?.name?.toLowerCase().includes(filter) ||
                game.away_team?.abbreviation?.toLowerCase().includes(filter)
              );
            });

            // Sort games
            if (sortBy === 'status') {
              // Sort by: Live (in) -> Upcoming (pre) -> Completed (post)
              const statusOrder = { 'in': 0, 'pre': 1, 'post': 2 };
              filteredGames = filteredGames.sort((a: any, b: any) => {
                const statusA = statusOrder[a.status.state as keyof typeof statusOrder] ?? 3;
                const statusB = statusOrder[b.status.state as keyof typeof statusOrder] ?? 3;
                if (statusA !== statusB) {
                  return statusA - statusB;
                }
                // Within same status, sort by time
                return new Date(a.date).getTime() - new Date(b.date).getTime();
              });
            } else {
              // Sort by time (chronological)
              filteredGames = filteredGames.sort((a: any, b: any) =>
                new Date(a.date).getTime() - new Date(b.date).getTime()
              );
            }

            if (filteredGames.length > 0) {
              return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredGames.map((game: any) => (
                <div
                  key={game.game_id}
                  onClick={() => {
                    if (game.status.state === 'in') {
                      navigate(`/live/${game.game_id}`);
                    } else if (game.status.completed) {
                      navigate(`/game/${game.game_id}`);
                    }
                  }}
                  className={`rounded-xl p-6 shadow-xl transition-all duration-200 relative ${
                    game.status.state === 'in'
                      ? 'bg-slate-800 border-2 border-green-500/50 cursor-pointer hover:scale-105 hover:shadow-2xl live-game-glow'
                      : game.status.completed
                      ? 'bg-slate-800 border border-slate-700 cursor-pointer hover:scale-105 hover:shadow-2xl hover:border-orange-500'
                      : 'bg-slate-800 border border-slate-700'
                  }`}
                >
                  {/* Status Badge */}
                  <div className="text-center mb-4">
                    {getStatusBadge(game.status)}
                  </div>

                  {/* Teams */}
                  <div className="flex items-center justify-between gap-6">
                    {/* Away Team */}
                    <div className="flex-1 flex flex-col items-center">
                      {game.away_team?.logo && (
                        <img
                          src={game.away_team.logo}
                          alt={game.away_team.name}
                          className="w-20 h-20 object-contain mb-3"
                        />
                      )}
                      <div className="text-center">
                        <div className="font-bold text-lg">{game.away_team?.abbreviation}</div>
                        <div className="text-xs text-slate-500">{game.away_team?.record}</div>
                      </div>
                      {game.status.state !== 'pre' && (
                        <div
                          className={`text-4xl font-black mt-3 ${
                            game.away_team?.winner
                              ? 'text-green-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {game.away_team?.score}
                        </div>
                      )}
                    </div>

                    {/* VS / @ */}
                    <div className="text-slate-600 text-xl font-bold">@</div>

                    {/* Home Team */}
                    <div className="flex-1 flex flex-col items-center">
                      {game.home_team?.logo && (
                        <img
                          src={game.home_team.logo}
                          alt={game.home_team.name}
                          className="w-20 h-20 object-contain mb-3"
                        />
                      )}
                      <div className="text-center">
                        <div className="font-bold text-lg">{game.home_team?.abbreviation}</div>
                        <div className="text-xs text-slate-500">{game.home_team?.record}</div>
                      </div>
                      {game.status.state !== 'pre' && (
                        <div
                          className={`text-4xl font-black mt-3 ${
                            game.home_team?.winner
                              ? 'text-green-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {game.home_team?.score}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Linescores - Quarter by Quarter */}
                  {game.status.state !== 'pre' && game.home_team?.linescores && game.away_team?.linescores && (
                    <div className="mt-4 pt-4 border-t border-slate-700">
                      <div className="grid grid-cols-5 gap-2 text-xs">
                        <div className="text-slate-500 font-bold"></div>
                        {game.home_team.linescores.map((score: any, idx: number) => (
                          <div key={idx} className="text-center text-slate-500 font-bold">
                            Q{score.period}
                          </div>
                        ))}
                        {/* Away Team Linescores */}
                        <div className="flex items-center gap-1">
                          {game.away_team?.logo && (
                            <img src={game.away_team.logo} alt={game.away_team.abbreviation} className="w-4 h-4 object-contain" />
                          )}
                          <span className="text-slate-400 font-semibold">{game.away_team?.abbreviation}</span>
                        </div>
                        {game.away_team.linescores.map((score: any, idx: number) => (
                          <div key={idx} className="text-center font-semibold">
                            {score.displayValue}
                          </div>
                        ))}
                        {/* Home Team Linescores */}
                        <div className="flex items-center gap-1">
                          {game.home_team?.logo && (
                            <img src={game.home_team.logo} alt={game.home_team.abbreviation} className="w-4 h-4 object-contain" />
                          )}
                          <span className="text-slate-400 font-semibold">{game.home_team?.abbreviation}</span>
                        </div>
                        {game.home_team.linescores.map((score: any, idx: number) => (
                          <div key={idx} className="text-center font-semibold">
                            {score.displayValue}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Game Leaders - Completed games only */}
                  {game.status.completed && (game.away_team?.leaders || game.home_team?.leaders) && (
                    <div className="mt-4 pt-4 border-t border-slate-700">
                      <div className="text-xs text-slate-500 mb-3 font-bold uppercase tracking-wider text-center">
                        Game Leaders
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {/* Away Team Leader */}
                        {game.away_team?.leaders?.points && (
                          <div className="flex items-center gap-2 bg-slate-700/30 rounded-lg p-2">
                            {game.away_team.leaders.points.headshot && (
                              <img
                                src={game.away_team.leaders.points.headshot}
                                alt={game.away_team.leaders.points.athlete_name}
                                className="w-10 h-10 rounded-full bg-slate-700 object-cover ring-2 ring-orange-500/50"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold truncate">
                                {game.away_team.leaders.points.athlete_name}
                              </div>
                              <div className="text-xs text-slate-500">
                                {game.away_team.leaders.points.position}
                              </div>
                            </div>
                            <div className="text-orange-400 font-black text-lg">
                              {game.away_team.leaders.points.value}
                            </div>
                          </div>
                        )}
                        {/* Home Team Leader */}
                        {game.home_team?.leaders?.points && (
                          <div className="flex items-center gap-2 bg-slate-700/30 rounded-lg p-2">
                            {game.home_team.leaders.points.headshot && (
                              <img
                                src={game.home_team.leaders.points.headshot}
                                alt={game.home_team.leaders.points.athlete_name}
                                className="w-10 h-10 rounded-full bg-slate-700 object-cover ring-2 ring-orange-500/50"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold truncate">
                                {game.home_team.leaders.points.athlete_name}
                              </div>
                              <div className="text-xs text-slate-500">
                                {game.home_team.leaders.points.position}
                              </div>
                            </div>
                            <div className="text-orange-400 font-black text-lg">
                              {game.home_team.leaders.points.value}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Attendance & Headline - Completed games */}
                  {game.status.completed && (game.attendance || game.headline) && (
                    <div className="mt-4 pt-4 border-t border-slate-700 space-y-2">
                      {game.attendance && (
                        <div className="text-xs text-slate-500 text-center">
                          👥 {game.attendance.toLocaleString()} fans
                        </div>
                      )}
                      {game.headline && (
                        <div className="text-xs text-slate-400 text-center italic line-clamp-2">
                          {game.headline.shortLinkText || game.headline.description}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Odds - Upcoming games */}
                  {game.status.state === 'pre' && game.odds && (
                    <div className="mt-4 pt-4 border-t border-slate-700">
                      <div className="text-xs text-slate-500 mb-3 font-bold uppercase tracking-wider text-center">
                        {game.odds.provider || 'Betting Odds'}
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        {/* Spread */}
                        <div className="bg-slate-700/30 rounded-lg p-2">
                          <div className="text-xs text-slate-500 mb-1">Spread</div>
                          <div className="text-sm font-bold text-orange-400">{game.odds.details}</div>
                        </div>
                        {/* Over/Under */}
                        <div className="bg-slate-700/30 rounded-lg p-2">
                          <div className="text-xs text-slate-500 mb-1">O/U</div>
                          <div className="text-sm font-bold text-orange-400">{game.odds.over_under}</div>
                        </div>
                        {/* Moneyline */}
                        <div className="bg-slate-700/30 rounded-lg p-2">
                          <div className="text-xs text-slate-500 mb-1">ML</div>
                          <div className="flex flex-col text-xs font-semibold gap-1">
                            <div className={`flex items-center gap-1 ${game.odds.favorite === 'away' ? 'text-green-400' : 'text-slate-400'}`}>
                              {game.away_team?.logo && (
                                <img src={game.away_team.logo} alt={game.away_team.abbreviation} className="w-3 h-3 object-contain" />
                              )}
                              <span>{game.away_team?.abbreviation}: {game.odds.away_moneyline > 0 ? '+' : ''}{game.odds.away_moneyline}</span>
                            </div>
                            <div className={`flex items-center gap-1 ${game.odds.favorite === 'home' ? 'text-green-400' : 'text-slate-400'}`}>
                              {game.home_team?.logo && (
                                <img src={game.home_team.logo} alt={game.home_team.abbreviation} className="w-3 h-3 object-contain" />
                              )}
                              <span>{game.home_team?.abbreviation}: {game.odds.home_moneyline > 0 ? '+' : ''}{game.odds.home_moneyline}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Game Preview Button - Upcoming games */}
                  {game.status.state === 'pre' && (
                    <div className="mt-4 pt-4 border-t border-slate-700">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/preview/${game.game_id}`);
                        }}
                        className="w-full text-center bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 rounded-lg px-3 py-2 text-xs font-bold text-orange-400 transition-all duration-200 hover:scale-105"
                      >
                        🎯 View Game Preview
                      </button>
                    </div>
                  )}


                  {/* Ticket Info - Upcoming games */}
                  {game.status.state === 'pre' && game.tickets && (
                    <div className="mt-4 pt-4 border-t border-slate-700">
                      <a
                        href={game.tickets.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-center bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 rounded-lg px-3 py-2 text-xs font-bold text-orange-400 transition-all duration-200 hover:scale-105"
                      >
                        🎟️ {game.tickets.summary}
                        {game.tickets.available && ` • ${game.tickets.available} available`}
                      </a>
                    </div>
                  )}

                  {/* Game Info */}
                  <div className="mt-4 text-center space-y-1">
                    {game.status.state === 'pre' && (
                      <>
                        <div className="text-sm font-semibold text-orange-500">
                          {formatTime(game.date)}
                        </div>
                        {getCountdown(game.date) && (
                          <div className="text-xs font-bold text-green-400 bg-green-500/10 border border-green-500/30 rounded-full px-3 py-1 inline-block">
                            ⏱️ {getCountdown(game.date)}
                          </div>
                        )}
                      </>
                    )}
                    {game.venue?.name && (
                      <div className="text-xs text-slate-500">
                        {game.venue.name}
                        {game.venue.city && ` • ${game.venue.city}, ${game.venue.state}`}
                      </div>
                    )}
                    {game.broadcast && game.broadcast.length > 0 && (
                      <div className="text-xs text-slate-500">
                        {game.broadcast.flat().join(', ')}
                      </div>
                    )}
                    {game.status.state === 'in' && (
                      <div className="text-xs text-green-400 mt-2 cursor-pointer">
                        Click to view live stats
                      </div>
                    )}
                    {game.status.completed && (
                      <div className="text-xs text-orange-400 mt-2">
                        Click to view box score
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            );
            } else {
              // Empty state with smart suggestions
              return (
                <div className="bg-slate-800 rounded-xl p-12 border border-slate-700 text-center space-y-4">
                  <div className="text-slate-400 text-lg mb-4">
                    {showOnlyLive
                      ? 'No live games right now'
                      : teamFilter
                      ? `No games found matching "${teamFilter}"`
                      : 'No games scheduled for this date'}
                  </div>
                  {!teamFilter && !showOnlyLive && (
                    <div className="flex flex-col items-center gap-3">
                      <div className="text-slate-500 text-sm">Try checking nearby dates:</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const prev = new Date(selectedDate);
                            prev.setDate(prev.getDate() - 1);
                            const year = prev.getFullYear();
                            const month = String(prev.getMonth() + 1).padStart(2, '0');
                            const day = String(prev.getDate()).padStart(2, '0');
                            setSelectedDate(`${year}-${month}-${day}`);
                          }}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-white transition-colors text-sm font-semibold"
                        >
                          ← Yesterday
                        </button>
                        <button
                          onClick={() => setSelectedDate(today)}
                          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 border border-orange-600 rounded-lg text-white transition-colors text-sm font-semibold"
                        >
                          Today
                        </button>
                        <button
                          onClick={() => {
                            const next = new Date(selectedDate);
                            next.setDate(next.getDate() + 1);
                            const year = next.getFullYear();
                            const month = String(next.getMonth() + 1).padStart(2, '0');
                            const day = String(next.getDate()).padStart(2, '0');
                            setSelectedDate(`${year}-${month}-${day}`);
                          }}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-white transition-colors text-sm font-semibold"
                        >
                          Tomorrow →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            }
          })()}
        </div>
      )}

      {/* Keyboard Shortcuts Info */}
      <div className="mt-8 p-4 bg-slate-800/50 border border-slate-700/50 rounded-lg">
        <div className="text-center text-slate-500 text-xs space-y-2">
          <div className="font-semibold text-slate-400">⌨️ Keyboard Shortcuts</div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            <span><kbd className="px-2 py-1 bg-slate-700 rounded text-slate-300">←</kbd> Previous Day</span>
            <span><kbd className="px-2 py-1 bg-slate-700 rounded text-slate-300">→</kbd> Next Day</span>
            <span><kbd className="px-2 py-1 bg-slate-700 rounded text-slate-300">T</kbd> Today</span>
            <span><kbd className="px-2 py-1 bg-slate-700 rounded text-slate-300">L</kbd> Toggle Live</span>
            <span><kbd className="px-2 py-1 bg-slate-700 rounded text-slate-300">Esc</kbd> Clear Filters</span>
          </div>
        </div>
      </div>
    </div>
  );
}
