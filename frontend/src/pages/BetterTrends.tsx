import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Link, useParams, useNavigate } from 'react-router-dom';

interface KingData {
  athlete_id: string;
  player_name: string;
  player_headshot: string;
  team_id: string;
  team_name: string;
  team_logo: string;
  team_color: string;
  points: number;
  rebounds: number;
  assists: number;
  total_score: number;
  game_id: string;
  game_name: string;
  game_date: string;
}

interface TopPlayerData {
  athlete_id: string;
  player_name: string;
  player_headshot: string;
  team_id: string;
  team_name: string;
  team_logo: string;
  points: number;
  rebounds: number;
  assists: number;
  total_score: number;
  game_id: string;
}

interface KingOfTheCourtResponse {
  date: string;
  king: KingData;
  top_5: TopPlayerData[];
}

interface DailyKing {
  date: string;
  athlete_id: string;
  player_name: string;
  player_headshot: string;
  team_id: string;
  team_name: string;
  team_abbreviation: string;
  team_logo: string;
  team_color: string;
  points: number;
  rebounds: number;
  assists: number;
  total_score: number;
}

interface MonthlyKingsResponse {
  year: number;
  month: number;
  daily_kings: DailyKing[];
}

interface MonthlySummaryResponse {
  year: number;
  month: number;
  monthly_mvp: {
    athlete_id: string;
    player_name: string;
    player_headshot: string;
    win_count: number;
  } | null;
  highest_score: {
    athlete_id: string;
    player_name: string;
    player_headshot: string;
    game_date: string;
    points: number;
    rebounds: number;
    assists: number;
    total_score: number;
  } | null;
  top_team: {
    team_id: string;
    team_name: string;
    team_logo: string;
    team_color: string;
    win_count: number;
  } | null;
}

interface FirstBasketGame {
  game_id: string;
  event_name: string;
  game_date: string;
  away_team_id: string;
  away_team_name: string;
  home_team_id: string;
  home_team_name: string;
  away_team_logo: string;
  away_team_color: string;
  home_team_logo: string;
  home_team_color: string;
  first_basket_athlete_id: string;
  first_basket_player_name: string;
  first_basket_player_headshot: string;
  first_basket_team_id: string;
  first_basket_description: string;
  away_first_athlete_id: string;
  away_first_player_name: string;
  away_first_player_headshot: string;
  away_first_description: string;
  home_first_athlete_id: string;
  home_first_player_name: string;
  home_first_player_headshot: string;
  home_first_description: string;
}

interface FirstBasketResponse {
  date: string;
  games: FirstBasketGame[];
}

interface ScheduleGame {
  game_id: string;
  date: string;
  status: {
    state: string;
    completed: boolean;
    short_detail?: string;
    display_clock?: string;
  };
  home_team: {
    id: string;
    name: string;
    abbreviation: string;
    logo: string;
    score?: string;
    winner?: boolean;
  };
  away_team: {
    id: string;
    name: string;
    abbreviation: string;
    logo: string;
    score?: string;
    winner?: boolean;
  };
}

interface ScheduleResponse {
  date: string;
  games: ScheduleGame[];
}

interface RosterPlayer {
  id: string;
  displayName: string;
  fullName: string;
  position?: {
    abbreviation: string;
  };
  headshot?: {
    href: string;
  };
  jersey?: string;
}

interface RosterResponse {
  athletes: RosterPlayer[];
}

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function BetterTrends() {
  const { tab: urlTab, date: urlDate } = useParams<{ tab?: string; date?: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'king' | 'firstBasket' | 'thisOrThat'>('king');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [selectedMonth, setSelectedMonth] = useState<number>(10); // October
  const [topN, setTopN] = useState<number>(5);
  const [firstBasketDate, setFirstBasketDate] = useState<string>('');
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [selectedPlayer1, setSelectedPlayer1] = useState<string>('');
  const [selectedPlayer2, setSelectedPlayer2] = useState<string>('');
  const [comparisonMode, setComparisonMode] = useState<'thisOrThat' | 'headToHead' | 'combinedStats'>('thisOrThat');
  const [selectedPropType, setSelectedPropType] = useState<string>('');
  const [propLine, setPropLine] = useState<string>('');

  // Sync state with URL params
  useEffect(() => {
    if (urlTab === 'king' || urlTab === 'first-basket' || urlTab === 'this-or-that') {
      setActiveTab(
        urlTab === 'king' ? 'king' :
        urlTab === 'first-basket' ? 'firstBasket' :
        'thisOrThat'
      );
    }
    if (urlTab === 'king' && urlDate) {
      setSelectedDate(urlDate);
    } else if (urlTab === 'first-basket' && urlDate) {
      setFirstBasketDate(urlDate);
    }
  }, [urlTab, urlDate]);

  // Fetch monthly kings data
  const { data: monthlyData, isLoading: monthlyLoading } = useQuery<MonthlyKingsResponse>({
    queryKey: ['king-of-the-court-month', selectedYear, selectedMonth],
    queryFn: async () => {
      const response = await axios.get(
        `${API_URL}/api/stats/king-of-the-court/month?year=${selectedYear}&month=${selectedMonth}`
      );
      return response.data;
    }
  });

  // Fetch monthly summary stats
  const { data: summaryData, isLoading: summaryLoading } = useQuery<MonthlySummaryResponse>({
    queryKey: ['king-of-the-court-summary', selectedYear, selectedMonth],
    queryFn: async () => {
      const response = await axios.get(
        `${API_URL}/api/stats/king-of-the-court/month/summary?year=${selectedYear}&month=${selectedMonth}`
      );
      return response.data;
    },
    enabled: activeTab === 'king'
  });

  // Fetch single day data when date is selected
  const { data: dayData, isLoading: dayLoading } = useQuery<KingOfTheCourtResponse>({
    queryKey: ['king-of-the-court', selectedDate, topN],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/api/stats/king-of-the-court?date=${selectedDate}&limit=${topN}`);
      return response.data;
    },
    enabled: !!selectedDate
  });

  // Fetch first basket data
  const { data: firstBasketData, isLoading: firstBasketLoading } = useQuery<FirstBasketResponse>({
    queryKey: ['first-basket', firstBasketDate],
    queryFn: async () => {
      const url = firstBasketDate
        ? `${API_URL}/api/stats/first-basket?date=${firstBasketDate}`
        : `${API_URL}/api/stats/first-basket`;
      const response = await axios.get(url);
      return response.data;
    },
    enabled: activeTab === 'firstBasket'
  });

  // Fetch today's schedule for This or That
  const { data: todaySchedule, isLoading: scheduleLoading } = useQuery<ScheduleResponse>({
    queryKey: ['today-schedule'],
    queryFn: async () => {
      const today = new Date();
      const dateStr = today.getFullYear() +
        String(today.getMonth() + 1).padStart(2, '0') +
        String(today.getDate()).padStart(2, '0');
      const response = await axios.get(`${API_URL}/api/schedule?date=${dateStr}`);
      return response.data;
    },
    enabled: activeTab === 'thisOrThat'
  });

  // Get selected game details
  const selectedGame = todaySchedule?.games.find(g => g.game_id === selectedGameId);

  // Fetch rosters for both teams
  const { data: awayTeamRoster, isLoading: awayRosterLoading } = useQuery<RosterResponse>({
    queryKey: ['roster', selectedGame?.away_team.id],
    queryFn: async () => {
      const response = await axios.get(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${selectedGame?.away_team.id}/roster`
      );
      return response.data;
    },
    enabled: !!selectedGame?.away_team.id
  });

  const { data: homeTeamRoster, isLoading: homeRosterLoading } = useQuery<RosterResponse>({
    queryKey: ['roster', selectedGame?.home_team.id],
    queryFn: async () => {
      const response = await axios.get(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${selectedGame?.home_team.id}/roster`
      );
      return response.data;
    },
    enabled: !!selectedGame?.home_team.id
  });

  // Combine both rosters for player selection
  const allPlayers = useMemo(() => {
    const players: (RosterPlayer & { teamName: string; teamLogo: string })[] = [];

    if (awayTeamRoster?.athletes && selectedGame) {
      awayTeamRoster.athletes.forEach(player => {
        players.push({
          ...player,
          teamName: selectedGame.away_team.abbreviation,
          teamLogo: selectedGame.away_team.logo
        });
      });
    }

    if (homeTeamRoster?.athletes && selectedGame) {
      homeTeamRoster.athletes.forEach(player => {
        players.push({
          ...player,
          teamName: selectedGame.home_team.abbreviation,
          teamLogo: selectedGame.home_team.logo
        });
      });
    }

    return players.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [awayTeamRoster, homeTeamRoster, selectedGame]);

  // Fetch gamelogs for both players when they are selected
  const { data: player1Games, isLoading: player1GamesLoading } = useQuery({
    queryKey: ['player-games', selectedPlayer1],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/api/players/${selectedPlayer1}/games`, {
        params: { season_type: 2, limit: 100 } // Regular season only, last 100 games
      });
      return response.data;
    },
    enabled: !!selectedPlayer1
  });

  const { data: player2Games, isLoading: player2GamesLoading } = useQuery({
    queryKey: ['player-games', selectedPlayer2],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/api/players/${selectedPlayer2}/games`, {
        params: { season_type: 2, limit: 100 } // Regular season only, last 100 games
      });
      return response.data;
    },
    enabled: !!selectedPlayer2
  });

  // Helper function to convert UTC date to CST date string
  const convertToCSTDate = (utcDateString: string): string => {
    // Parse the UTC date and subtract 6 hours for CST
    const date = new Date(utcDateString);
    date.setHours(date.getHours() - 6);
    // Return YYYY-MM-DD format
    return date.toISOString().split('T')[0];
  };

  // Filter games to only dates where both players played
  const commonDateGames = useMemo(() => {
    if (!player1Games?.games || !player2Games?.games) return null;

    // Create a map of CST dates for player 1
    const player1DateMap = new Map();
    player1Games.games.forEach((game: any) => {
      const cstDate = convertToCSTDate(game.game_date);
      player1DateMap.set(cstDate, game);
    });

    // Find games where player 2 also played on the same CST date
    const commonGames: { date: string; player1Game: any; player2Game: any }[] = [];
    player2Games.games.forEach((game: any) => {
      const cstDate = convertToCSTDate(game.game_date);
      if (player1DateMap.has(cstDate)) {
        commonGames.push({
          date: cstDate,
          player1Game: player1DateMap.get(cstDate),
          player2Game: game
        });
      }
    });

    // Sort by date descending (most recent first)
    return commonGames.sort((a, b) => b.date.localeCompare(a.date));
  }, [player1Games, player2Games]);

  // Filter games where at least one player hit the over (for This or That mode)
  const gamesWithOvers = useMemo(() => {
    if (!commonDateGames || !propLine || !selectedPropType) return commonDateGames;

    const lineValue = parseFloat(propLine);
    if (isNaN(lineValue)) return commonDateGames;

    return commonDateGames.filter(gameSet => {
      const player1Stat = parseFloat(gameSet.player1Game[selectedPropType]) || 0;
      const player2Stat = parseFloat(gameSet.player2Game[selectedPropType]) || 0;

      // Return true if at least one player went over the line
      return player1Stat > lineValue || player2Stat > lineValue;
    });
  }, [commonDateGames, propLine, selectedPropType]);

  // Calculate head-to-head stats
  const headToHeadStats = useMemo(() => {
    if (!commonDateGames || !selectedPropType || comparisonMode !== 'headToHead') return null;

    let player1Wins = 0;
    let player2Wins = 0;
    let ties = 0;

    commonDateGames.forEach(gameSet => {
      const stat1 = parseFloat(gameSet.player1Game[selectedPropType]) || 0;
      const stat2 = parseFloat(gameSet.player2Game[selectedPropType]) || 0;

      if (stat1 > stat2) {
        player1Wins++;
      } else if (stat2 > stat1) {
        player2Wins++;
      } else {
        ties++;
      }
    });

    return {
      player1Wins,
      player2Wins,
      ties,
      totalGames: commonDateGames.length
    };
  }, [commonDateGames, selectedPropType, comparisonMode]);

  // Filter games where combined stats hit the over
  const combinedStatsGames = useMemo(() => {
    if (!commonDateGames || !propLine || !selectedPropType || comparisonMode !== 'combinedStats') {
      return commonDateGames;
    }

    const lineValue = parseFloat(propLine);
    if (isNaN(lineValue)) return commonDateGames;

    return commonDateGames.filter(gameSet => {
      const player1Stat = parseFloat(gameSet.player1Game[selectedPropType]) || 0;
      const player2Stat = parseFloat(gameSet.player2Game[selectedPropType]) || 0;
      const combined = player1Stat + player2Stat;

      return combined > lineValue;
    });
  }, [commonDateGames, propLine, selectedPropType, comparisonMode]);

  // Create a map of dates to kings for quick lookup
  const kingsMap = useMemo(() => {
    const map = new Map<string, DailyKing>();
    if (monthlyData?.daily_kings) {
      monthlyData.daily_kings.forEach(king => {
        map.set(king.date, king);
      });
    }
    return map;
  }, [monthlyData]);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const lastDay = new Date(selectedYear, selectedMonth, 0);
    const startDay = firstDay.getDay(); // 0 = Sunday
    const daysInMonth = lastDay.getDate();

    const days = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }

    // Add actual days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({
        day,
        dateStr,
        king: kingsMap.get(dateStr)
      });
    }

    return days;
  }, [selectedYear, selectedMonth, kingsMap]);

  const handlePreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const handleDayClick = (dateStr: string) => {
    navigate(`/better-trends/king/${dateStr}`);
  };

  const handleBackToCalendar = () => {
    navigate('/better-trends/king');
  };

  // Reset state when switching tabs
  const handleTabChange = (tab: 'king' | 'firstBasket' | 'thisOrThat') => {
    const urlTab =
      tab === 'king' ? 'king' :
      tab === 'firstBasket' ? 'first-basket' :
      'this-or-that';
    navigate(`/better-trends/${urlTab}`);
  };

  const handleFirstBasketDateChange = (newDate: string) => {
    if (newDate) {
      navigate(`/better-trends/first-basket/${newDate}`);
    } else {
      navigate('/better-trends/first-basket');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h1 className="text-3xl font-bold text-white mb-4">Better Trends</h1>

        {/* Tabs */}
        <div className="border-b border-slate-700 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => handleTabChange('king')}
              className={`py-4 px-1 font-medium border-b-2 transition-colors ${
                activeTab === 'king'
                  ? 'border-orange-500 text-orange-500'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              King of the Court
            </button>
            <button
              onClick={() => handleTabChange('firstBasket')}
              className={`py-4 px-1 font-medium border-b-2 transition-colors ${
                activeTab === 'firstBasket'
                  ? 'border-orange-500 text-orange-500'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              First Basket
            </button>
            <button
              onClick={() => handleTabChange('thisOrThat')}
              className={`py-4 px-1 font-medium border-b-2 transition-colors ${
                activeTab === 'thisOrThat'
                  ? 'border-orange-500 text-orange-500'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              This or That
            </button>
          </nav>
        </div>

        {/* King of the Court Tab Content */}
        {activeTab === 'king' && !selectedDate ? (
          <>
            {/* Month/Year Selector */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={handlePreviousMonth}
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                ← Previous
              </button>

              <div className="flex items-center space-x-4">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className="bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx} value={idx + 1}>{name}</option>
                  ))}
                </select>

                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleNextMonth}
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Next →
              </button>
            </div>

            {/* Monthly Summary Stats */}
            {summaryData && !summaryLoading && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Monthly MVP */}
                {summaryData.monthly_mvp && (
                  <div className="bg-gradient-to-br from-yellow-600/20 to-orange-600/20 border-2 border-yellow-600 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-yellow-400 uppercase tracking-wide">Monthly MVP</h3>
                      <span className="text-2xl">👑</span>
                    </div>
                    <Link to={`/player/${summaryData.monthly_mvp.athlete_id}`} className="flex items-center space-x-3 group">
                      {summaryData.monthly_mvp.player_headshot && (
                        <img
                          src={summaryData.monthly_mvp.player_headshot}
                          alt={summaryData.monthly_mvp.player_name}
                          className="w-12 h-12 rounded-full border-2 border-yellow-500"
                        />
                      )}
                      <div>
                        <div className="font-bold text-white group-hover:text-orange-400 transition-colors">
                          {summaryData.monthly_mvp.player_name}
                        </div>
                        <div className="text-sm text-slate-300">
                          {summaryData.monthly_mvp.win_count} win{summaryData.monthly_mvp.win_count !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </Link>
                  </div>
                )}

                {/* Highest Score */}
                {summaryData.highest_score && (
                  <div className="bg-slate-900 border-2 border-orange-600 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-orange-400 uppercase tracking-wide">Highest Score</h3>
                      <span className="text-2xl">🔥</span>
                    </div>
                    <Link to={`/player/${summaryData.highest_score.athlete_id}`} className="flex items-center space-x-3 group">
                      {summaryData.highest_score.player_headshot && (
                        <img
                          src={summaryData.highest_score.player_headshot}
                          alt={summaryData.highest_score.player_name}
                          className="w-12 h-12 rounded-full border-2 border-orange-500"
                        />
                      )}
                      <div>
                        <div className="font-bold text-white group-hover:text-orange-400 transition-colors">
                          {summaryData.highest_score.player_name}
                        </div>
                        <div className="text-2xl font-bold text-orange-500">
                          {summaryData.highest_score.total_score}
                        </div>
                        <div className="text-xs text-slate-400">
                          {summaryData.highest_score.points}P / {summaryData.highest_score.rebounds}R / {summaryData.highest_score.assists}A
                        </div>
                      </div>
                    </Link>
                  </div>
                )}

                {/* Top Team */}
                {summaryData.top_team && (
                  <div
                    style={{
                      backgroundColor: `#${summaryData.top_team.team_color}20`,
                      borderColor: `#${summaryData.top_team.team_color}`
                    }}
                    className="border-2 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-white uppercase tracking-wide">Top Team</h3>
                      <span className="text-2xl">🏆</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      {summaryData.top_team.team_logo && (
                        <img
                          src={summaryData.top_team.team_logo}
                          alt={summaryData.top_team.team_name}
                          className="w-12 h-12"
                        />
                      )}
                      <div>
                        <div className="font-bold text-white">
                          {summaryData.top_team.team_name}
                        </div>
                        <div className="text-sm text-slate-300">
                          {summaryData.top_team.win_count} win{summaryData.top_team.win_count !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Calendar Grid */}
            {monthlyLoading ? (
              <div className="text-center py-8">
                <div className="text-slate-400">Loading calendar...</div>
              </div>
            ) : (
              <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-sm font-semibold text-slate-400 py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar days */}
                <div className="grid grid-cols-7 gap-2">
                  {calendarDays.map((dayData, idx) => {
                    if (!dayData) {
                      return <div key={`empty-${idx}`} className="aspect-square" />;
                    }

                    const { day, dateStr, king } = dayData;
                    const hasKing = !!king;

                    return (
                      <div key={dateStr} className="relative group">
                        <button
                          onClick={() => hasKing && handleDayClick(dateStr)}
                          disabled={!hasKing}
                          style={
                            hasKing && king?.team_color
                              ? {
                                  backgroundColor: `#${king.team_color}40`, // Add 40 for 25% opacity
                                  borderColor: `#${king.team_color}`,
                                }
                              : undefined
                          }
                          className={`aspect-square rounded-lg border-2 transition-all w-full ${
                            hasKing
                              ? 'cursor-pointer hover:scale-105'
                              : 'border-slate-700 bg-slate-800 cursor-not-allowed opacity-50'
                          } ${!hasKing ? '' : ''}`}
                        >
                          <div className="h-full flex flex-col items-center justify-center p-2">
                            <div className={`text-sm font-bold ${hasKing ? 'text-white' : 'text-slate-600'}`}>
                              {day}
                            </div>
                            {king && (
                              <>
                                {king.player_headshot && (
                                  <img
                                    src={king.player_headshot}
                                    alt={king.player_name}
                                    className="w-10 h-10 rounded-full my-1 border-2 border-yellow-500"
                                  />
                                )}
                                <div className="text-xs text-yellow-400 font-semibold text-center leading-tight">
                                  {king.player_name}
                                </div>
                                <div className="text-xs text-slate-400">{king.total_score}</div>
                              </>
                            )}
                          </div>
                        </button>

                        {/* Hover Tooltip */}
                        {hasKing && king && (
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            <div className="bg-slate-900 border-2 border-yellow-500 rounded-lg shadow-xl p-3 min-w-[200px]">
                              {/* Arrow */}
                              <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                                <div className="border-8 border-transparent border-t-yellow-500"></div>
                              </div>

                              {/* Content */}
                              <div className="text-center mb-2">
                                <div className="text-xs text-yellow-400 font-bold uppercase">King of the Court</div>
                                <div className="text-xs text-slate-400">
                                  {new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric'
                                  })}
                                </div>
                              </div>

                              <div className="flex items-center space-x-3 mb-3">
                                {king.player_headshot && (
                                  <img
                                    src={king.player_headshot}
                                    alt={king.player_name}
                                    className="w-12 h-12 rounded-full border-2 border-yellow-500"
                                  />
                                )}
                                <div className="text-left">
                                  <div className="font-bold text-white text-sm">{king.player_name}</div>
                                  {king.team_abbreviation && (
                                    <div className="text-xs text-slate-400">{king.team_abbreviation}</div>
                                  )}
                                </div>
                              </div>

                              {/* Stats Grid */}
                              <div className="grid grid-cols-3 gap-2 mb-2">
                                <div className="text-center">
                                  <div className="text-lg font-bold text-white">{king.points}</div>
                                  <div className="text-xs text-slate-400">PTS</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-lg font-bold text-white">{king.rebounds}</div>
                                  <div className="text-xs text-slate-400">REB</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-lg font-bold text-white">{king.assists}</div>
                                  <div className="text-xs text-slate-400">AST</div>
                                </div>
                              </div>

                              {/* Total */}
                              <div className="text-center pt-2 border-t border-slate-700">
                                <div className="text-2xl font-bold text-yellow-400">{king.total_score}</div>
                                <div className="text-xs text-slate-400">Total</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Back button */}
            <button
              onClick={handleBackToCalendar}
              className="mb-4 flex items-center space-x-2 text-slate-300 hover:text-white transition-colors"
            >
              <span>←</span>
              <span>Back to Calendar</span>
            </button>

            {/* Single Day View */}
            {dayLoading ? (
              <div className="text-center py-8">
                <div className="text-slate-400">Loading...</div>
              </div>
            ) : dayData ? (
              <div className="space-y-6">
                {/* Date Header */}
                <div className="text-center">
                  <h2 className="text-xl font-semibold text-slate-300">
                    {new Date(dayData.date + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </h2>
                </div>

                {/* King Display - Featured */}
                <div className="bg-gradient-to-br from-yellow-600/20 to-orange-600/20 border-2 border-yellow-500 rounded-lg p-8">
                  <div className="text-center mb-4">
                    <h3 className="text-2xl font-bold text-yellow-400 mb-2">
                      👑 KING OF THE COURT 👑
                    </h3>
                  </div>

                  <div className="flex items-center justify-center space-x-6">
                    {/* Player Image */}
                    {dayData.king.player_headshot && (
                      <img
                        src={dayData.king.player_headshot}
                        alt={dayData.king.player_name}
                        className="w-32 h-32 rounded-full border-4 border-yellow-500"
                      />
                    )}

                    {/* Player Info */}
                    <div className="text-left">
                      <h4 className="text-3xl font-bold text-white mb-2">
                        {dayData.king.player_name}
                      </h4>
                      <div className="flex items-center space-x-3 mb-4">
                        {dayData.king.team_logo && (
                          <img
                            src={dayData.king.team_logo}
                            alt={dayData.king.team_name}
                            className="w-8 h-8"
                          />
                        )}
                        <span className="text-lg text-slate-300">{dayData.king.team_name}</span>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-4 mb-2">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-white">{dayData.king.points}</div>
                          <div className="text-sm text-slate-400">PTS</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-white">{dayData.king.rebounds}</div>
                          <div className="text-sm text-slate-400">REB</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-white">{dayData.king.assists}</div>
                          <div className="text-sm text-slate-400">AST</div>
                        </div>
                      </div>

                      {/* Total Score */}
                      <div className="text-center mt-4 pt-4 border-t border-yellow-600">
                        <div className="text-4xl font-bold text-yellow-400">{dayData.king.total_score}</div>
                        <div className="text-sm text-slate-300">Total Score</div>
                      </div>
                    </div>
                  </div>

                  {/* Game Info */}
                  <div className="text-center mt-6 text-sm text-slate-400">
                    {dayData.king.game_name}
                  </div>
                </div>

                {/* Top N Leaderboard */}
                <div className="bg-slate-900 rounded-lg p-6 border border-slate-700">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-white">Top Performances</h3>
                    <div className="flex items-center space-x-2">
                      <label className="text-sm text-slate-400">Show Top:</label>
                      <select
                        value={topN}
                        onChange={(e) => setTopN(parseInt(e.target.value))}
                        className="bg-slate-800 border border-slate-600 text-white rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={15}>15</option>
                        <option value={20}>20</option>
                        <option value={25}>25</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {dayData.top_5.map((player, index) => (
                      <div
                        key={player.athlete_id}
                        className={`flex items-center justify-between p-4 rounded-lg ${
                          index === 0
                            ? 'bg-yellow-600/10 border border-yellow-600'
                            : 'bg-slate-800 border border-slate-700'
                        }`}
                      >
                        <div className="flex items-center space-x-4">
                          {/* Rank */}
                          <div className={`text-2xl font-bold ${
                            index === 0 ? 'text-yellow-400' :
                            index === 1 ? 'text-slate-400' :
                            index === 2 ? 'text-orange-600' :
                            'text-slate-500'
                          }`}>
                            #{index + 1}
                          </div>

                          {/* Player Image */}
                          {player.player_headshot && (
                            <img
                              src={player.player_headshot}
                              alt={player.player_name}
                              className="w-12 h-12 rounded-full"
                            />
                          )}

                          {/* Player Name & Team */}
                          <div>
                            <div className="font-semibold text-white">{player.player_name}</div>
                            <div className="flex items-center space-x-2 text-sm text-slate-400">
                              {player.team_logo && (
                                <img src={player.team_logo} alt={player.team_name} className="w-4 h-4" />
                              )}
                              <span>{player.team_name}</span>
                            </div>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center space-x-6">
                          <div className="text-center">
                            <div className="font-bold text-white">{player.points}</div>
                            <div className="text-xs text-slate-400">PTS</div>
                          </div>
                          <div className="text-center">
                            <div className="font-bold text-white">{player.rebounds}</div>
                            <div className="text-xs text-slate-400">REB</div>
                          </div>
                          <div className="text-center">
                            <div className="font-bold text-white">{player.assists}</div>
                            <div className="text-xs text-slate-400">AST</div>
                          </div>
                          <div className="text-center border-l border-slate-700 pl-6">
                            <div className={`text-xl font-bold ${
                              index === 0 ? 'text-yellow-400' : 'text-orange-500'
                            }`}>
                              {player.total_score}
                            </div>
                            <div className="text-xs text-slate-400">TOTAL</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* This or That Tab Content */}
        {activeTab === 'thisOrThat' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white mb-4">This or That</h2>

            {/* Game Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Select a game from today:
              </label>
              {scheduleLoading ? (
                <div className="text-slate-400">Loading today's games...</div>
              ) : todaySchedule && todaySchedule.games.length > 0 ? (
                <select
                  value={selectedGameId}
                  onChange={(e) => setSelectedGameId(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">-- Select a game --</option>
                  {todaySchedule.games.map((game) => (
                    <option key={game.game_id} value={game.game_id}>
                      {game.away_team.name} @ {game.home_team.name}
                      {game.status.state === 'in' ? ' (LIVE)' : ''}
                      {game.status.completed ? ' (Final)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-slate-400">No games scheduled for today.</div>
              )}
            </div>

            {/* Selected Game Display */}
            {selectedGameId && selectedGame && (
              <>
                <div className="bg-slate-900 rounded-lg p-6 border border-slate-700">
                  <div className="space-y-4">
                    <h3 className="text-xl font-bold text-white text-center mb-6">
                      {selectedGame.away_team.name} @ {selectedGame.home_team.name}
                    </h3>

                    {/* Teams Display */}
                    <div className="grid grid-cols-3 gap-4 items-center">
                      {/* Away Team */}
                      <div className="text-center">
                        {selectedGame.away_team.logo && (
                          <img
                            src={selectedGame.away_team.logo}
                            alt={selectedGame.away_team.name}
                            className="w-24 h-24 mx-auto mb-2"
                          />
                        )}
                        <div className="font-bold text-white text-lg">
                          {selectedGame.away_team.name}
                        </div>
                        {selectedGame.away_team.score && (
                          <div className="text-2xl font-bold text-orange-500 mt-2">
                            {selectedGame.away_team.score}
                          </div>
                        )}
                      </div>

                      {/* VS */}
                      <div className="text-center">
                        <div className="text-slate-400 text-xl font-semibold">@</div>
                      </div>

                      {/* Home Team */}
                      <div className="text-center">
                        {selectedGame.home_team.logo && (
                          <img
                            src={selectedGame.home_team.logo}
                            alt={selectedGame.home_team.name}
                            className="w-24 h-24 mx-auto mb-2"
                          />
                        )}
                        <div className="font-bold text-white text-lg">
                          {selectedGame.home_team.name}
                        </div>
                        {selectedGame.home_team.score && (
                          <div className="text-2xl font-bold text-orange-500 mt-2">
                            {selectedGame.home_team.score}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Game Status */}
                    <div className="text-center mt-4">
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                        selectedGame.status.state === 'in'
                          ? 'bg-green-600 text-white'
                          : selectedGame.status.completed
                            ? 'bg-slate-600 text-white'
                            : 'bg-orange-600 text-white'
                      }`}>
                        {selectedGame.status.short_detail || (selectedGame.status.state === 'in' ? 'LIVE' : selectedGame.status.completed ? 'Final' : 'Scheduled')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Player Selection */}
                <div className="grid grid-cols-2 gap-6 mt-6">
                  {/* Player 1 Selection */}
                  <div className="bg-slate-900 rounded-lg p-6 border border-slate-700">
                    <h4 className="text-lg font-bold text-white text-center mb-4">
                      Player 1
                    </h4>

                    {awayRosterLoading || homeRosterLoading ? (
                      <div className="text-center py-8 text-slate-400">Loading rosters...</div>
                    ) : allPlayers.length > 0 ? (
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Select Player:
                        </label>
                        <select
                          value={selectedPlayer1}
                          onChange={(e) => setSelectedPlayer1(e.target.value)}
                          className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          <option value="">-- Select a player --</option>
                          {allPlayers.map((player) => (
                            <option key={player.id} value={player.id}>
                              [{player.teamName}] {player.jersey ? `#${player.jersey} ` : ''}{player.displayName}
                              {player.position?.abbreviation ? ` - ${player.position.abbreviation}` : ''}
                            </option>
                          ))}
                        </select>

                        {/* Selected Player Display */}
                        {selectedPlayer1 && (() => {
                          const player = allPlayers.find(p => p.id === selectedPlayer1);
                          if (!player) return null;

                          return (
                            <div className="mt-4 p-4 bg-slate-800 rounded-lg border border-orange-500">
                              <div className="flex items-center gap-4">
                                {player.headshot?.href && (
                                  <img
                                    src={player.headshot.href}
                                    alt={player.displayName}
                                    className="w-16 h-16 rounded-full border-2 border-orange-500"
                                  />
                                )}
                                <div className="flex-1">
                                  <div className="font-bold text-white text-lg">
                                    {player.displayName}
                                  </div>
                                  <div className="text-sm text-slate-400">
                                    {player.position?.abbreviation && `${player.position.abbreviation} `}
                                    {player.jersey && `• #${player.jersey}`}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <img
                                      src={player.teamLogo}
                                      alt={player.teamName}
                                      className="w-4 h-4"
                                    />
                                    <span className="text-xs text-slate-500">{player.teamName}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-400">No roster available</div>
                    )}
                  </div>

                  {/* Player 2 Selection */}
                  <div className="bg-slate-900 rounded-lg p-6 border border-slate-700">
                    <h4 className="text-lg font-bold text-white text-center mb-4">
                      Player 2
                    </h4>

                    {awayRosterLoading || homeRosterLoading ? (
                      <div className="text-center py-8 text-slate-400">Loading rosters...</div>
                    ) : allPlayers.length > 0 ? (
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Select Player:
                        </label>
                        <select
                          value={selectedPlayer2}
                          onChange={(e) => setSelectedPlayer2(e.target.value)}
                          className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          <option value="">-- Select a player --</option>
                          {allPlayers.map((player) => (
                            <option key={player.id} value={player.id}>
                              [{player.teamName}] {player.jersey ? `#${player.jersey} ` : ''}{player.displayName}
                              {player.position?.abbreviation ? ` - ${player.position.abbreviation}` : ''}
                            </option>
                          ))}
                        </select>

                        {/* Selected Player Display */}
                        {selectedPlayer2 && (() => {
                          const player = allPlayers.find(p => p.id === selectedPlayer2);
                          if (!player) return null;

                          return (
                            <div className="mt-4 p-4 bg-slate-800 rounded-lg border border-orange-500">
                              <div className="flex items-center gap-4">
                                {player.headshot?.href && (
                                  <img
                                    src={player.headshot.href}
                                    alt={player.displayName}
                                    className="w-16 h-16 rounded-full border-2 border-orange-500"
                                  />
                                )}
                                <div className="flex-1">
                                  <div className="font-bold text-white text-lg">
                                    {player.displayName}
                                  </div>
                                  <div className="text-sm text-slate-400">
                                    {player.position?.abbreviation && `${player.position.abbreviation} `}
                                    {player.jersey && `• #${player.jersey}`}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <img
                                      src={player.teamLogo}
                                      alt={player.teamName}
                                      className="w-4 h-4"
                                    />
                                    <span className="text-xs text-slate-500">{player.teamName}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-400">No roster available</div>
                    )}
                  </div>
                </div>

                {/* Comparison Mode Selection - Shows when both players are selected */}
                {selectedPlayer1 && selectedPlayer2 && (
                  <div className="mt-6 bg-slate-900 rounded-lg p-6 border border-slate-700">
                    <h4 className="text-lg font-bold text-white text-center mb-4">
                      Select Comparison Mode
                    </h4>
                    <div className="max-w-md mx-auto">
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        How would you like to compare these players?
                      </label>
                      <select
                        value={comparisonMode}
                        onChange={(e) => {
                          setComparisonMode(e.target.value as 'thisOrThat' | 'headToHead' | 'combinedStats');
                          // Reset selections when changing mode
                          setSelectedPropType('');
                          setPropLine('');
                        }}
                        className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500 text-lg"
                      >
                        <option value="thisOrThat">This or That - Compare individual overs</option>
                        <option value="headToHead">Head to Head - Direct stat comparison</option>
                        <option value="combinedStats">Combined Stats - Add stats together</option>
                      </select>

                      {/* Mode Descriptions */}
                      <div className="mt-3 text-sm text-slate-400">
                        {comparisonMode === 'thisOrThat' && (
                          <p>See games where at least one player hit over a prop line on the same day</p>
                        )}
                        {comparisonMode === 'headToHead' && (
                          <p>Compare which player records more of a stat in games on the same day</p>
                        )}
                        {comparisonMode === 'combinedStats' && (
                          <p>Add both players' stats together and see if combined they go over a line</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Prop Type Selection - Shows when both players are selected */}
                {selectedPlayer1 && selectedPlayer2 && comparisonMode && (
                  <div className="mt-6 bg-slate-900 rounded-lg p-6 border border-slate-700">
                    <h4 className="text-lg font-bold text-white text-center mb-4">
                      {comparisonMode === 'thisOrThat' && 'Select Stat and Line to Compare'}
                      {comparisonMode === 'headToHead' && 'Select Stat to Compare'}
                      {comparisonMode === 'combinedStats' && 'Select Stat and Combined Line'}
                    </h4>
                    <div className="max-w-2xl mx-auto">
                      <div className={`grid grid-cols-1 ${comparisonMode === 'headToHead' ? '' : 'md:grid-cols-2'} gap-4`}>
                        {/* Stat Selection */}
                        <div className={comparisonMode === 'headToHead' ? 'max-w-md mx-auto w-full' : ''}>
                          <label className="block text-sm font-medium text-slate-300 mb-2">
                            Which stat?
                          </label>
                          <select
                            value={selectedPropType}
                            onChange={(e) => setSelectedPropType(e.target.value)}
                            className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500 text-lg"
                          >
                            <option value="">-- Select a stat --</option>
                            <option value="points">Points</option>
                            <option value="assists">Assists</option>
                            <option value="rebounds">Rebounds</option>
                            <option value="blocks">Blocks</option>
                            <option value="steals">Steals</option>
                          </select>
                        </div>

                        {/* Line Input - Show for This or That and Combined Stats */}
                        {(comparisonMode === 'thisOrThat' || comparisonMode === 'combinedStats') && (
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                              {comparisonMode === 'combinedStats' ? 'Combined Prop Line (O/U)' : 'Prop Line (O/U)'}
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              value={propLine}
                              onChange={(e) => setPropLine(e.target.value)}
                              placeholder="e.g., 25.5"
                              className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500 text-lg"
                            />
                          </div>
                        )}
                      </div>

                      {selectedPropType && (
                        <div className="mt-3 text-center text-sm text-slate-400">
                          {comparisonMode === 'thisOrThat' && propLine && (
                            <span>Showing games where at least one player went <span className="text-green-400 font-semibold">OVER {propLine}</span> {selectedPropType}</span>
                          )}
                          {comparisonMode === 'headToHead' && (
                            <span>Comparing <span className="text-orange-500 font-semibold">{selectedPropType}</span> head-to-head</span>
                          )}
                          {comparisonMode === 'combinedStats' && propLine && (
                            <span>Combined {selectedPropType} must be <span className="text-green-400 font-semibold">OVER {propLine}</span></span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Common Games Display - Shows when prop type is selected */}
                {selectedPlayer1 && selectedPlayer2 && selectedPropType && comparisonMode === 'thisOrThat' && (
                  <div className="mt-6 bg-slate-900 rounded-lg p-6 border border-slate-700">
                    <h4 className="text-lg font-bold text-white mb-4">
                      This or That: Games Where Both Players Played (Same Day)
                    </h4>

                    {player1GamesLoading || player2GamesLoading ? (
                      <div className="text-center py-8 text-slate-400">Loading game history...</div>
                    ) : commonDateGames && commonDateGames.length > 0 ? (
                      <>
                        <div className="mb-4 text-center space-y-2">
                          <div>
                            <span className="text-slate-400">
                              Found <span className="text-orange-500 font-bold">{gamesWithOvers.length}</span>
                              {propLine && commonDateGames && (
                                <span> out of <span className="text-orange-500 font-bold">{commonDateGames.length}</span></span>
                              )} games
                              {propLine && (
                                <span> where at least one player went over <span className="text-green-400 font-bold">{propLine}</span></span>
                              )}
                            </span>
                          </div>

                          {propLine && commonDateGames && commonDateGames.length > 0 && (() => {
                            const hitRate = gamesWithOvers.length / commonDateGames.length;
                            const percentage = (hitRate * 100).toFixed(1);

                            // Convert probability to American odds
                            let americanOdds: string;
                            if (hitRate > 0.5) {
                              // Favorite: negative odds
                              const odds = -(hitRate / (1 - hitRate)) * 100;
                              americanOdds = odds.toFixed(0);
                            } else if (hitRate < 0.5) {
                              // Underdog: positive odds
                              const odds = ((1 - hitRate) / hitRate) * 100;
                              americanOdds = '+' + odds.toFixed(0);
                            } else {
                              // Even odds
                              americanOdds = '+100';
                            }

                            return (
                              <div className="mt-2">
                                <div className="inline-block bg-slate-800 rounded-lg px-4 py-2 border border-slate-600">
                                  <span className="text-slate-400 text-sm">Hit Rate: </span>
                                  <span className="text-orange-500 font-bold text-lg">{percentage}%</span>
                                  <span className="text-slate-600 mx-2">|</span>
                                  <span className="text-slate-400 text-sm">Expected Odds: </span>
                                  <span className="text-green-400 font-bold text-lg">{americanOdds}</span>
                                </div>
                              </div>
                            );
                          })()}

                          {propLine && gamesWithOvers && (
                            <div className="mt-2 text-center text-xs text-slate-500">
                              Games with green border had at least one player hit the over
                            </div>
                          )}
                        </div>

                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {commonDateGames.map((gameSet, idx) => {
                            const player1 = allPlayers.find(p => p.id === selectedPlayer1);
                            const player2 = allPlayers.find(p => p.id === selectedPlayer2);
                            const statKey = selectedPropType;
                            const stat1 = parseFloat(gameSet.player1Game[statKey]) || 0;
                            const stat2 = parseFloat(gameSet.player2Game[statKey]) || 0;
                            const lineValue = propLine ? parseFloat(propLine) : 0;

                            const player1HitOver = lineValue > 0 && stat1 > lineValue;
                            const player2HitOver = lineValue > 0 && stat2 > lineValue;
                            const anyHitOver = player1HitOver || player2HitOver;

                            return (
                              <div
                                key={idx}
                                className={`bg-slate-800 rounded-lg p-4 border ${
                                  anyHitOver ? 'border-green-500' : 'border-slate-700'
                                }`}
                              >
                                {/* Date Header */}
                                <div className="text-center mb-3">
                                  <div className="text-sm font-bold text-orange-500">
                                    {new Date(gameSet.date + 'T00:00:00').toLocaleDateString('en-US', {
                                      weekday: 'short',
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </div>
                                </div>

                                {/* Player Stats Comparison */}
                                <div className="grid grid-cols-3 gap-4 items-center">
                                  {/* Player 1 */}
                                  <div className="text-center">
                                    <div className="flex items-center justify-center gap-2 mb-2">
                                      {player1?.headshot?.href && (
                                        <img
                                          src={player1.headshot.href}
                                          alt={player1.displayName}
                                          className="w-8 h-8 rounded-full"
                                        />
                                      )}
                                      <div className="text-sm font-semibold text-white truncate">
                                        {player1?.displayName.split(' ').pop()}
                                      </div>
                                    </div>
                                    <div className="text-xs text-slate-400 mb-1">
                                      vs {gameSet.player1Game.opponent_name}
                                    </div>
                                    <div className={`text-2xl font-bold ${player1HitOver ? 'text-green-400' : 'text-white'}`}>
                                      {stat1}
                                      {player1HitOver && <span className="ml-1 text-sm">✓</span>}
                                    </div>
                                    <div className="text-xs text-slate-500 uppercase mt-1">
                                      {selectedPropType}
                                    </div>
                                  </div>

                                  {/* VS */}
                                  <div className="text-center text-slate-600 font-bold">VS</div>

                                  {/* Player 2 */}
                                  <div className="text-center">
                                    <div className="flex items-center justify-center gap-2 mb-2">
                                      {player2?.headshot?.href && (
                                        <img
                                          src={player2.headshot.href}
                                          alt={player2.displayName}
                                          className="w-8 h-8 rounded-full"
                                        />
                                      )}
                                      <div className="text-sm font-semibold text-white truncate">
                                        {player2?.displayName.split(' ').pop()}
                                      </div>
                                    </div>
                                    <div className="text-xs text-slate-400 mb-1">
                                      vs {gameSet.player2Game.opponent_name}
                                    </div>
                                    <div className={`text-2xl font-bold ${player2HitOver ? 'text-green-400' : 'text-white'}`}>
                                      {stat2}
                                      {player2HitOver && <span className="ml-1 text-sm">✓</span>}
                                    </div>
                                    <div className="text-xs text-slate-500 uppercase mt-1">
                                      {selectedPropType}
                                    </div>
                                  </div>
                                </div>

                                {/* Winner and Over Indicator */}
                                <div className="mt-3 text-center space-y-1">
                                  {/* Line Reference */}
                                  {propLine && (
                                    <div className="text-xs text-slate-500">
                                      Line: {propLine}
                                    </div>
                                  )}

                                  {/* Who Won */}
                                  {(() => {
                                    if (stat1 > stat2) {
                                      return (
                                        <div className="text-sm text-orange-400 font-semibold">
                                          {player1?.displayName.split(' ').pop()} wins by {stat1 - stat2}
                                        </div>
                                      );
                                    } else if (stat2 > stat1) {
                                      return (
                                        <div className="text-sm text-orange-400 font-semibold">
                                          {player2?.displayName.split(' ').pop()} wins by {stat2 - stat1}
                                        </div>
                                      );
                                    } else {
                                      return (
                                        <div className="text-sm text-slate-500 font-semibold">
                                          Tie
                                        </div>
                                      );
                                    }
                                  })()}

                                  {/* Over Status */}
                                  {propLine && (
                                    <div className="text-xs">
                                      {player1HitOver && player2HitOver ? (
                                        <span className="text-green-400 font-semibold">Both hit OVER ✓✓</span>
                                      ) : player1HitOver ? (
                                        <span className="text-green-400 font-semibold">{player1?.displayName.split(' ').pop()} hit OVER ✓</span>
                                      ) : player2HitOver ? (
                                        <span className="text-green-400 font-semibold">{player2?.displayName.split(' ').pop()} hit OVER ✓</span>
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        No games found where both players played on the same day
                      </div>
                    )}
                  </div>
                )}

                {/* Head to Head Display */}
                {selectedPlayer1 && selectedPlayer2 && selectedPropType && comparisonMode === 'headToHead' && (
                  <div className="mt-6 bg-slate-900 rounded-lg p-6 border border-slate-700">
                    <h4 className="text-lg font-bold text-white mb-4">
                      Head to Head: {selectedPropType.charAt(0).toUpperCase() + selectedPropType.slice(1)} Comparison
                    </h4>

                    {player1GamesLoading || player2GamesLoading ? (
                      <div className="text-center py-8 text-slate-400">Loading game history...</div>
                    ) : commonDateGames && commonDateGames.length > 0 && headToHeadStats ? (
                      <>
                        {/* Head to Head Summary */}
                        <div className="mb-6 bg-slate-800 rounded-lg p-6 border border-slate-600">
                          <div className="grid grid-cols-3 gap-4 items-center">
                            {/* Player 1 Record */}
                            <div className="text-center">
                              {(() => {
                                const player1 = allPlayers.find(p => p.id === selectedPlayer1);
                                return (
                                  <>
                                    {player1?.headshot?.href && (
                                      <img
                                        src={player1.headshot.href}
                                        alt={player1.displayName}
                                        className="w-20 h-20 rounded-full mx-auto mb-3 border-2 border-orange-500"
                                      />
                                    )}
                                    <div className="font-bold text-white text-lg mb-1">
                                      {player1?.displayName}
                                    </div>
                                    <div className="text-3xl font-bold text-orange-500">
                                      {headToHeadStats.player1Wins}
                                    </div>
                                    <div className="text-sm text-slate-400">Wins</div>
                                    <div className="text-xs text-slate-500 mt-2">
                                      {((headToHeadStats.player1Wins / headToHeadStats.totalGames) * 100).toFixed(1)}% Win Rate
                                    </div>
                                  </>
                                );
                              })()}
                            </div>

                            {/* VS & Ties */}
                            <div className="text-center">
                              <div className="text-slate-600 text-2xl font-bold mb-2">VS</div>
                              {headToHeadStats.ties > 0 && (
                                <div className="text-slate-400 text-sm">
                                  {headToHeadStats.ties} {headToHeadStats.ties === 1 ? 'Tie' : 'Ties'}
                                </div>
                              )}
                              <div className="text-xs text-slate-500 mt-2">
                                {headToHeadStats.totalGames} Total Games
                              </div>
                            </div>

                            {/* Player 2 Record */}
                            <div className="text-center">
                              {(() => {
                                const player2 = allPlayers.find(p => p.id === selectedPlayer2);
                                return (
                                  <>
                                    {player2?.headshot?.href && (
                                      <img
                                        src={player2.headshot.href}
                                        alt={player2.displayName}
                                        className="w-20 h-20 rounded-full mx-auto mb-3 border-2 border-orange-500"
                                      />
                                    )}
                                    <div className="font-bold text-white text-lg mb-1">
                                      {player2?.displayName}
                                    </div>
                                    <div className="text-3xl font-bold text-orange-500">
                                      {headToHeadStats.player2Wins}
                                    </div>
                                    <div className="text-sm text-slate-400">Wins</div>
                                    <div className="text-xs text-slate-500 mt-2">
                                      {((headToHeadStats.player2Wins / headToHeadStats.totalGames) * 100).toFixed(1)}% Win Rate
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* Game by Game Breakdown */}
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {commonDateGames.map((gameSet, idx) => {
                            const player1 = allPlayers.find(p => p.id === selectedPlayer1);
                            const player2 = allPlayers.find(p => p.id === selectedPlayer2);
                            const statKey = selectedPropType;
                            const stat1 = parseFloat(gameSet.player1Game[statKey]) || 0;
                            const stat2 = parseFloat(gameSet.player2Game[statKey]) || 0;

                            const player1Won = stat1 > stat2;
                            const player2Won = stat2 > stat1;
                            const isTie = stat1 === stat2;

                            return (
                              <div
                                key={idx}
                                className={`bg-slate-800 rounded-lg p-4 border-2 ${
                                  player1Won ? 'border-green-500' : player2Won ? 'border-blue-500' : 'border-slate-600'
                                }`}
                              >
                                {/* Date Header */}
                                <div className="text-center mb-3">
                                  <div className="text-sm font-bold text-orange-500">
                                    {new Date(gameSet.date + 'T00:00:00').toLocaleDateString('en-US', {
                                      weekday: 'short',
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </div>
                                </div>

                                {/* Player Stats Comparison */}
                                <div className="grid grid-cols-3 gap-4 items-center">
                                  {/* Player 1 */}
                                  <div className="text-center">
                                    <div className="flex items-center justify-center gap-2 mb-2">
                                      {player1?.headshot?.href && (
                                        <img
                                          src={player1.headshot.href}
                                          alt={player1.displayName}
                                          className="w-8 h-8 rounded-full"
                                        />
                                      )}
                                      <div className="text-sm font-semibold text-white truncate">
                                        {player1?.displayName.split(' ').pop()}
                                      </div>
                                    </div>
                                    <div className="text-xs text-slate-400 mb-1">
                                      vs {gameSet.player1Game.opponent_name}
                                    </div>
                                    <div className={`text-2xl font-bold ${player1Won ? 'text-green-400' : 'text-white'}`}>
                                      {stat1}
                                      {player1Won && <span className="ml-1 text-sm">👑</span>}
                                    </div>
                                    <div className="text-xs text-slate-500 uppercase mt-1">
                                      {selectedPropType}
                                    </div>
                                  </div>

                                  {/* VS */}
                                  <div className="text-center text-slate-600 font-bold">VS</div>

                                  {/* Player 2 */}
                                  <div className="text-center">
                                    <div className="flex items-center justify-center gap-2 mb-2">
                                      {player2?.headshot?.href && (
                                        <img
                                          src={player2.headshot.href}
                                          alt={player2.displayName}
                                          className="w-8 h-8 rounded-full"
                                        />
                                      )}
                                      <div className="text-sm font-semibold text-white truncate">
                                        {player2?.displayName.split(' ').pop()}
                                      </div>
                                    </div>
                                    <div className="text-xs text-slate-400 mb-1">
                                      vs {gameSet.player2Game.opponent_name}
                                    </div>
                                    <div className={`text-2xl font-bold ${player2Won ? 'text-blue-400' : 'text-white'}`}>
                                      {stat2}
                                      {player2Won && <span className="ml-1 text-sm">👑</span>}
                                    </div>
                                    <div className="text-xs text-slate-500 uppercase mt-1">
                                      {selectedPropType}
                                    </div>
                                  </div>
                                </div>

                                {/* Winner Indicator */}
                                <div className="mt-3 text-center">
                                  {isTie ? (
                                    <div className="text-sm text-slate-500 font-semibold">Tie</div>
                                  ) : (
                                    <div className={`text-sm font-semibold ${player1Won ? 'text-green-400' : 'text-blue-400'}`}>
                                      {player1Won
                                        ? `${player1?.displayName.split(' ').pop()} wins by ${stat1 - stat2}`
                                        : `${player2?.displayName.split(' ').pop()} wins by ${stat2 - stat1}`
                                      }
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        No games found where both players played on the same day
                      </div>
                    )}
                  </div>
                )}

                {/* Combined Stats Display */}
                {selectedPlayer1 && selectedPlayer2 && selectedPropType && comparisonMode === 'combinedStats' && (
                  <div className="mt-6 bg-slate-900 rounded-lg p-6 border border-slate-700">
                    <h4 className="text-lg font-bold text-white mb-4">
                      Combined {selectedPropType.charAt(0).toUpperCase() + selectedPropType.slice(1)}
                    </h4>

                    {player1GamesLoading || player2GamesLoading ? (
                      <div className="text-center py-8 text-slate-400">Loading game history...</div>
                    ) : commonDateGames && commonDateGames.length > 0 ? (
                      <>
                        <div className="mb-4 text-center space-y-2">
                          <div>
                            <span className="text-slate-400">
                              Found <span className="text-orange-500 font-bold">{combinedStatsGames?.length || 0}</span>
                              {propLine && (
                                <span> out of <span className="text-orange-500 font-bold">{commonDateGames.length}</span></span>
                              )} games
                              {propLine && (
                                <span> where combined {selectedPropType} went <span className="text-green-400 font-semibold">OVER {propLine}</span></span>
                              )}
                            </span>
                          </div>

                          {propLine && combinedStatsGames && commonDateGames.length > 0 && (() => {
                            const hitRate = combinedStatsGames.length / commonDateGames.length;
                            const percentage = (hitRate * 100).toFixed(1);

                            // Convert probability to American odds
                            let americanOdds: string;
                            if (hitRate > 0.5) {
                              const odds = -(hitRate / (1 - hitRate)) * 100;
                              americanOdds = odds.toFixed(0);
                            } else if (hitRate < 0.5) {
                              const odds = ((1 - hitRate) / hitRate) * 100;
                              americanOdds = '+' + odds.toFixed(0);
                            } else {
                              americanOdds = '+100';
                            }

                            return (
                              <div className="mt-2">
                                <div className="inline-block bg-slate-800 rounded-lg px-4 py-2 border border-slate-600">
                                  <span className="text-slate-400 text-sm">Hit Rate: </span>
                                  <span className="text-orange-500 font-bold text-lg">{percentage}%</span>
                                  <span className="text-slate-600 mx-2">|</span>
                                  <span className="text-slate-400 text-sm">Expected Odds: </span>
                                  <span className="text-green-400 font-bold text-lg">{americanOdds}</span>
                                </div>
                              </div>
                            );
                          })()}

                          {propLine && (
                            <div className="mt-2 text-center text-xs text-slate-500">
                              Games with green border had combined stats over the line
                            </div>
                          )}
                        </div>

                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {commonDateGames.map((gameSet, idx) => {
                            const player1 = allPlayers.find(p => p.id === selectedPlayer1);
                            const player2 = allPlayers.find(p => p.id === selectedPlayer2);
                            const statKey = selectedPropType;
                            const stat1 = parseFloat(gameSet.player1Game[statKey]) || 0;
                            const stat2 = parseFloat(gameSet.player2Game[statKey]) || 0;
                            const combined = stat1 + stat2;
                            const lineValue = propLine ? parseFloat(propLine) : 0;
                            const hitOver = lineValue > 0 && combined > lineValue;

                            return (
                              <div
                                key={idx}
                                className={`bg-slate-800 rounded-lg p-4 border ${
                                  hitOver ? 'border-green-500' : 'border-slate-700'
                                }`}
                              >
                                {/* Date Header */}
                                <div className="text-center mb-3">
                                  <div className="text-sm font-bold text-orange-500">
                                    {new Date(gameSet.date + 'T00:00:00').toLocaleDateString('en-US', {
                                      weekday: 'short',
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </div>
                                </div>

                                {/* Player Stats */}
                                <div className="grid grid-cols-3 gap-4 items-center mb-4">
                                  {/* Player 1 */}
                                  <div className="text-center">
                                    <div className="flex items-center justify-center gap-2 mb-2">
                                      {player1?.headshot?.href && (
                                        <img
                                          src={player1.headshot.href}
                                          alt={player1.displayName}
                                          className="w-8 h-8 rounded-full"
                                        />
                                      )}
                                      <div className="text-sm font-semibold text-white truncate">
                                        {player1?.displayName.split(' ').pop()}
                                      </div>
                                    </div>
                                    <div className="text-xs text-slate-400 mb-1">
                                      vs {gameSet.player1Game.opponent_name}
                                    </div>
                                    <div className="text-xl font-bold text-white">
                                      {stat1}
                                    </div>
                                    <div className="text-xs text-slate-500 uppercase mt-1">
                                      {selectedPropType}
                                    </div>
                                  </div>

                                  {/* Plus Sign */}
                                  <div className="text-center text-slate-600 text-2xl font-bold">+</div>

                                  {/* Player 2 */}
                                  <div className="text-center">
                                    <div className="flex items-center justify-center gap-2 mb-2">
                                      {player2?.headshot?.href && (
                                        <img
                                          src={player2.headshot.href}
                                          alt={player2.displayName}
                                          className="w-8 h-8 rounded-full"
                                        />
                                      )}
                                      <div className="text-sm font-semibold text-white truncate">
                                        {player2?.displayName.split(' ').pop()}
                                      </div>
                                    </div>
                                    <div className="text-xs text-slate-400 mb-1">
                                      vs {gameSet.player2Game.opponent_name}
                                    </div>
                                    <div className="text-xl font-bold text-white">
                                      {stat2}
                                    </div>
                                    <div className="text-xs text-slate-500 uppercase mt-1">
                                      {selectedPropType}
                                    </div>
                                  </div>
                                </div>

                                {/* Combined Total */}
                                <div className="pt-3 border-t border-slate-700">
                                  <div className="text-center">
                                    <div className="text-sm text-slate-400 mb-1">Combined Total</div>
                                    <div className={`text-3xl font-bold ${hitOver ? 'text-green-400' : 'text-white'}`}>
                                      {combined}
                                      {hitOver && <span className="ml-2 text-lg">✓</span>}
                                    </div>
                                    {propLine && (
                                      <div className="text-xs text-slate-500 mt-2">
                                        Line: {propLine} | {hitOver ? (
                                          <span className="text-green-400 font-semibold">OVER by {(combined - lineValue).toFixed(1)}</span>
                                        ) : (
                                          <span className="text-red-400">UNDER by {(lineValue - combined).toFixed(1)}</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        No games found where both players played on the same day
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* First Basket Tab Content */}
        {activeTab === 'firstBasket' && (
          <>
            {/* Date Navigation */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => {
                  const currentDate = firstBasketDate || new Date().toISOString().split('T')[0];
                  const date = new Date(currentDate);
                  date.setDate(date.getDate() - 1);
                  handleFirstBasketDateChange(date.toISOString().split('T')[0]);
                }}
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <span>←</span>
                <span>Previous Day</span>
              </button>

              <div className="flex items-center space-x-4">
                <input
                  type="date"
                  value={firstBasketDate}
                  onChange={(e) => handleFirstBasketDateChange(e.target.value)}
                  className="bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button
                  onClick={() => handleFirstBasketDateChange('')}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                >
                  Today
                </button>
              </div>

              <button
                onClick={() => {
                  const currentDate = firstBasketDate || new Date().toISOString().split('T')[0];
                  const date = new Date(currentDate);
                  date.setDate(date.getDate() + 1);
                  handleFirstBasketDateChange(date.toISOString().split('T')[0]);
                }}
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <span>Next Day</span>
                <span>→</span>
              </button>
            </div>

            {/* Loading State */}
            {firstBasketLoading && (
              <div className="text-center py-8">
                <div className="text-slate-400">Loading...</div>
              </div>
            )}

            {/* First Basket Games Display */}
            {firstBasketData && !firstBasketLoading && (
              <div className="space-y-6">
                {/* Date Header */}
                <div className="text-center mb-6">
                  <h2 className="text-xl font-semibold text-slate-300">
                    {new Date(firstBasketData.date + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">
                    {firstBasketData.games.length} game{firstBasketData.games.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Games Grid */}
                <div className="grid gap-6">
                  {firstBasketData.games.map((game) => (
                    <div
                      key={game.game_id}
                      className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden hover:border-orange-500 transition-colors"
                    >
                      {/* Game Header */}
                      <Link
                        to={`/game/${game.game_id}`}
                        className="bg-slate-800 p-4 border-b border-slate-700 block hover:bg-slate-750 transition-colors"
                      >
                        <h3 className="text-lg font-semibold text-white text-center hover:text-orange-400 transition-colors">
                          {game.event_name}
                        </h3>
                      </Link>

                      <div className="p-6">
                        {/* First Basket of the Game */}
                        <div
                          onClick={() => navigate(`/game/${game.game_id}?tab=playbyplay`)}
                          className="block bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border-2 border-yellow-600 rounded-lg p-6 mb-6 hover:from-yellow-600/30 hover:to-orange-600/30 hover:border-yellow-500 transition-all cursor-pointer group"
                        >
                          <div className="text-center mb-3">
                            <h4 className="text-sm font-bold text-yellow-400 uppercase tracking-wide group-hover:text-yellow-300 transition-colors">
                              First Basket of the Game - Click to view play-by-play
                            </h4>
                          </div>
                          <div className="flex items-center justify-center space-x-4">
                            <div onClick={(e) => e.stopPropagation()}>
                              <Link to={`/player/${game.first_basket_athlete_id}`}>
                                {game.first_basket_player_headshot && (
                                  <img
                                    src={game.first_basket_player_headshot}
                                    alt={game.first_basket_player_name}
                                    className="w-20 h-20 rounded-full border-3 border-yellow-500 hover:border-orange-500 transition-colors"
                                  />
                                )}
                              </Link>
                            </div>
                            <div className="text-left">
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="inline-block"
                              >
                                <Link
                                  to={`/player/${game.first_basket_athlete_id}`}
                                  className="text-2xl font-bold text-white hover:text-orange-400 transition-colors"
                                >
                                  {game.first_basket_player_name}
                                </Link>
                              </div>
                              <div className="text-sm text-slate-300 mt-1">
                                {game.first_basket_description}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Team First Baskets */}
                        <div className="grid md:grid-cols-2 gap-4">
                          {/* Away Team */}
                          <div
                            onClick={() => navigate(`/game/${game.game_id}?tab=playbyplay`)}
                            style={{
                              backgroundColor: `#${game.away_team_color}20`,
                              borderColor: `#${game.away_team_color}`
                            }}
                            className="rounded-lg border-2 p-4 hover:opacity-80 transition-opacity cursor-pointer"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center space-x-2">
                                {game.away_team_logo && (
                                  <img src={game.away_team_logo} alt={game.away_team_name} className="w-8 h-8" />
                                )}
                                <h5 className="font-bold text-white">{game.away_team_name}</h5>
                              </div>
                              <span className="text-xs text-slate-400 uppercase tracking-wide">Away</span>
                            </div>
                            {game.away_first_player_name ? (
                              <div className="flex items-center space-x-3">
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Link to={`/player/${game.away_first_athlete_id}`}>
                                    {game.away_first_player_headshot && (
                                      <img
                                        src={game.away_first_player_headshot}
                                        alt={game.away_first_player_name}
                                        className="w-12 h-12 rounded-full hover:ring-2 hover:ring-orange-500 transition-all"
                                      />
                                    )}
                                  </Link>
                                </div>
                                <div>
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <Link
                                      to={`/player/${game.away_first_athlete_id}`}
                                      className="font-semibold text-white hover:text-orange-400 transition-colors"
                                    >
                                      {game.away_first_player_name}
                                    </Link>
                                  </div>
                                  <div className="text-xs text-slate-400">{game.away_first_description}</div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-slate-400">No data</p>
                            )}
                          </div>

                          {/* Home Team */}
                          <div
                            onClick={() => navigate(`/game/${game.game_id}?tab=playbyplay`)}
                            style={{
                              backgroundColor: `#${game.home_team_color}20`,
                              borderColor: `#${game.home_team_color}`
                            }}
                            className="rounded-lg border-2 p-4 hover:opacity-80 transition-opacity cursor-pointer"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center space-x-2">
                                {game.home_team_logo && (
                                  <img src={game.home_team_logo} alt={game.home_team_name} className="w-8 h-8" />
                                )}
                                <h5 className="font-bold text-white">{game.home_team_name}</h5>
                              </div>
                              <span className="text-xs text-slate-400 uppercase tracking-wide">Home</span>
                            </div>
                            {game.home_first_player_name ? (
                              <div className="flex items-center space-x-3">
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Link to={`/player/${game.home_first_athlete_id}`}>
                                    {game.home_first_player_headshot && (
                                      <img
                                        src={game.home_first_player_headshot}
                                        alt={game.home_first_player_name}
                                        className="w-12 h-12 rounded-full hover:ring-2 hover:ring-orange-500 transition-all"
                                      />
                                    )}
                                  </Link>
                                </div>
                                <div>
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <Link
                                      to={`/player/${game.home_first_athlete_id}`}
                                      className="font-semibold text-white hover:text-orange-400 transition-colors"
                                    >
                                      {game.home_first_player_name}
                                    </Link>
                                  </div>
                                  <div className="text-xs text-slate-400">{game.home_first_description}</div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-slate-400">No data</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default BetterTrends;
