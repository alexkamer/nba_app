import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import axios from 'axios';
import ShotChart from '../components/ShotChart';
import PlayerImage from '../components/PlayerImage';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

type SortKey = 'points' | 'rebounds' | 'assists' | 'minutes';
type SortDirection = 'asc' | 'desc';
type GameTab = 'overview' | 'boxscore' | 'teamstats' | 'playbyplay' | 'props' | 'shotchart';

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<GameTab>('overview');
  const [sortKey, setSortKey] = useState<SortKey>('points');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedQuarter, setSelectedQuarter] = useState<string>('all');
  const [scoringOnly, setScoringOnly] = useState(false);
  const [expandedStats, setExpandedStats] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [selectedPlayer, setSelectedPlayer] = useState<string>('all');
  const [isSticky, setIsSticky] = useState(false);

  const { data: game, isLoading } = useQuery({
    queryKey: ['game', gameId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/games/${gameId}`);
      return data;
    },
    enabled: !!gameId,
  });

  const { data: playByPlay, isLoading: isLoadingPlays } = useQuery({
    queryKey: ['game-plays', gameId, selectedQuarter, scoringOnly],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedQuarter !== 'all') {
        params.append('quarter', selectedQuarter);
      }
      if (scoringOnly) {
        params.append('scoring_only', 'true');
      }
      // Try live-plays endpoint first (fetches from ESPN API)
      const { data } = await axios.get(`${API_BASE_URL}/games/${gameId}/live-plays?${params.toString()}`);
      return data;
    },
    enabled: !!gameId,
  });

  // Fetch game odds
  const { data: odds } = useQuery({
    queryKey: ['game-odds', gameId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/games/${gameId}/odds`);
      return data;
    },
    enabled: !!gameId,
  });

  // Fetch player props
  const { data: playerProps } = useQuery({
    queryKey: ['player-props', gameId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/games/${gameId}/props`);
      return data;
    },
    enabled: !!gameId,
  });

  // Fetch shot chart data
  const { data: shotData, isLoading: isLoadingShots } = useQuery({
    queryKey: ['game-shots', gameId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/games/${gameId}/shots`);
      return data;
    },
    enabled: !!gameId,
  });

  // Read tab from URL parameters
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['overview', 'boxscore', 'teamstats', 'playbyplay', 'props', 'shotchart'].includes(tabParam)) {
      setActiveTab(tabParam as GameTab);
    }
  }, [searchParams]);

  // Scroll detection for sticky header
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setIsSticky(scrollPosition > 400);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-12 w-12 border-4 border-orange-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="text-center text-slate-400 py-12">
        Game not found
      </div>
    );
  }

  const isHomeWinner = game.home_team.score > game.away_team.score;

  // Get game leaders
  const getTeamLeaders = (players: any[]) => {
    const allPlayers = [...players];
    if (allPlayers.length === 0) {
      return {
        points: { points: '0', player_name: 'N/A', athlete_id: null, athlete_headshot: null },
        rebounds: { rebounds: '0', player_name: 'N/A', athlete_id: null, athlete_headshot: null },
        assists: { assists: '0', player_name: 'N/A', athlete_id: null, athlete_headshot: null },
      };
    }
    return {
      points: allPlayers.reduce((max, p) => (parseInt(p.points) || 0) > (parseInt(max.points) || 0) ? p : max, allPlayers[0]),
      rebounds: allPlayers.reduce((max, p) => (parseInt(p.rebounds) || 0) > (parseInt(max.rebounds) || 0) ? p : max, allPlayers[0]),
      assists: allPlayers.reduce((max, p) => (parseInt(p.assists) || 0) > (parseInt(max.assists) || 0) ? p : max, allPlayers[0]),
    };
  };

  const awayPlayers = [...game.away_team.players.starters, ...game.away_team.players.bench];
  const homePlayers = [...game.home_team.players.starters, ...game.home_team.players.bench];
  const awayLeaders = getTeamLeaders(awayPlayers);
  const homeLeaders = getTeamLeaders(homePlayers);

  // Sorting function
  const sortPlayers = (players: any[]) => {
    return [...players].sort((a, b) => {
      let aVal = 0;
      let bVal = 0;

      switch(sortKey) {
        case 'points':
          aVal = parseInt(a.points) || 0;
          bVal = parseInt(b.points) || 0;
          break;
        case 'rebounds':
          aVal = parseInt(a.rebounds) || 0;
          bVal = parseInt(b.rebounds) || 0;
          break;
        case 'assists':
          aVal = parseInt(a.assists) || 0;
          bVal = parseInt(b.assists) || 0;
          break;
        case 'minutes':
          aVal = parseInt(a.minutes) || 0;
          bVal = parseInt(b.minutes) || 0;
          break;
      }

      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const sortedAwayStarters = sortPlayers(game.away_team.players.starters);
  const sortedAwayBench = sortPlayers(game.away_team.players.bench);
  const sortedHomeStarters = sortPlayers(game.home_team.players.starters);
  const sortedHomeBench = sortPlayers(game.home_team.players.bench);

  // Get top scorer from each team for highlighting
  const awayTopScorer = awayPlayers.length > 0 ? awayPlayers.reduce((max, p) => (parseInt(p.points) || 0) > (parseInt(max.points) || 0) ? p : max, awayPlayers[0]) : null;
  const homeTopScorer = homePlayers.length > 0 ? homePlayers.reduce((max, p) => (parseInt(p.points) || 0) > (parseInt(max.points) || 0) ? p : max, homePlayers[0]) : null;

  // Helper to match player props with actual performance
  const getPlayerPropsResults = () => {
    if (!playerProps || !playerProps.available || !game) return [];

    const results: any[] = [];
    const allPlayers = [...game.away_team.players.starters, ...game.away_team.players.bench,
                        ...game.home_team.players.starters, ...game.home_team.players.bench];

    Object.values(playerProps.props_by_player).forEach((playerData: any) => {
      const actualPlayer = allPlayers.find((p: any) => p.athlete_id === playerData.athlete_id);

      if (!actualPlayer) return; // Player didn't play

      const propResults: any[] = [];

      playerData.props.forEach((prop: any) => {
        // Skip props without both over and under odds
        if (!prop.over_odds || !prop.under_odds) return;

        let actualValue = 0;
        const propType = prop.type;

        // Handle different prop types
        if (propType === 'Total Points' || propType === 'Points') {
          actualValue = parseFloat(actualPlayer.points) || 0;
        } else if (propType === 'Total Rebounds' || propType === 'Rebounds') {
          actualValue = parseFloat(actualPlayer.rebounds) || 0;
        } else if (propType === 'Total Assists' || propType === 'Assists') {
          actualValue = parseFloat(actualPlayer.assists) || 0;
        } else if (propType === 'Total Steals' || propType === 'Steals') {
          actualValue = parseFloat(actualPlayer.steals) || 0;
        } else if (propType === 'Total Blocks' || propType === 'Blocks') {
          actualValue = parseFloat(actualPlayer.blocks) || 0;
        } else if (propType === 'Total Turnovers' || propType === 'Turnovers') {
          actualValue = parseFloat(actualPlayer.turnovers) || 0;
        } else if (propType === 'Total 3-Point Field Goals' || propType === '3-Pointers Made') {
          // Handle 3-pointers which are stored as "made-attempted" string
          const playerStat = actualPlayer.threePointFieldGoalsMade_threePointFieldGoalsAttempted;
          if (typeof playerStat === 'string') {
            const made = playerStat.split('-')[0];
            actualValue = parseFloat(made) || 0;
          } else {
            actualValue = parseFloat(playerStat) || 0;
          }
        } else if (propType === 'Total Field Goals Made (incl. overtime)') {
          // Handle field goals which are stored as "made-attempted" string
          const playerStat = actualPlayer.fieldGoalsMade_fieldGoalsAttempted;
          if (typeof playerStat === 'string') {
            const made = playerStat.split('-')[0];
            actualValue = parseFloat(made) || 0;
          } else {
            actualValue = parseFloat(playerStat) || 0;
          }
        } else if (propType === 'Total Points and Assists') {
          actualValue = (parseFloat(actualPlayer.points) || 0) + (parseFloat(actualPlayer.assists) || 0);
        } else if (propType === 'Total Points and Rebounds') {
          actualValue = (parseFloat(actualPlayer.points) || 0) + (parseFloat(actualPlayer.rebounds) || 0);
        } else if (propType === 'Total Assists and Rebounds') {
          actualValue = (parseFloat(actualPlayer.assists) || 0) + (parseFloat(actualPlayer.rebounds) || 0);
        } else if (propType === 'Total Points, Rebounds, and Assists') {
          actualValue = (parseFloat(actualPlayer.points) || 0) + (parseFloat(actualPlayer.rebounds) || 0) + (parseFloat(actualPlayer.assists) || 0);
        } else {
          // Skip unknown prop types
          return;
        }

        const line = parseFloat(prop.line);
        const difference = actualValue - line;
        const hitOver = difference > 0;

        propResults.push({
          type: prop.type,
          line: prop.line,
          actualValue: actualValue,
          difference: difference,
          hitOver: hitOver,
          overOdds: prop.over_odds,
          underOdds: prop.under_odds
        });
      });

      if (propResults.length > 0) {
        results.push({
          athlete_id: playerData.athlete_id,
          athlete_name: playerData.athlete_name,
          athlete_headshot: playerData.athlete_headshot,
          team_name: actualPlayer.team_id === game.home_team.team_id ? game.home_team.team_name : game.away_team.team_name,
          props: propResults
        });
      }
    });

    return results;
  };

  // Helper to create stat comparison bars
  const StatComparisonBar = ({ label, awayValue, homeValue, isPercentage = false }: any) => {
    const away = parseFloat(awayValue) || 0;
    const home = parseFloat(homeValue) || 0;
    const total = away + home;
    const awayPercent = total > 0 ? (away / total) * 100 : 50;
    const homePercent = total > 0 ? (home / total) * 100 : 50;
    const isAwayWinning = away > home;
    const isHomeWinning = home > away;

    // Get team colors (default to orange if not available)
    const awayColor = game?.away_team?.team_color || 'f97316';
    const homeColor = game?.home_team?.team_color || 'f97316';

    return (
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className={isAwayWinning ? 'text-white font-bold' : 'text-slate-400'}>{awayValue}{isPercentage ? '%' : ''}</span>
          <span className="text-slate-400 font-semibold uppercase text-xs">{label}</span>
          <span className={isHomeWinning ? 'text-white font-bold' : 'text-slate-400'}>{homeValue}{isPercentage ? '%' : ''}</span>
        </div>
        <div className="flex h-3 bg-slate-700 rounded-full overflow-hidden shadow-inner">
          <div
            className="transition-all duration-500"
            style={{
              width: `${awayPercent}%`,
              background: `linear-gradient(to right, #${awayColor}, #${awayColor}dd)`,
              boxShadow: isAwayWinning ? `0 0 10px rgba(${parseInt(awayColor.slice(0,2), 16)}, ${parseInt(awayColor.slice(2,4), 16)}, ${parseInt(awayColor.slice(4,6), 16)}, 0.5)` : 'none'
            }}
          />
          <div
            className="transition-all duration-500"
            style={{
              width: `${homePercent}%`,
              background: `linear-gradient(to left, #${homeColor}, #${homeColor}dd)`,
              boxShadow: isHomeWinning ? `0 0 10px rgba(${parseInt(homeColor.slice(0,2), 16)}, ${parseInt(homeColor.slice(2,4), 16)}, ${parseInt(homeColor.slice(4,6), 16)}, 0.5)` : 'none'
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Sticky Mini Header */}
      <div
        className={`fixed top-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 shadow-2xl transition-all duration-300 ${
          isSticky ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Teams & Score */}
            <div className="flex items-center gap-6">
              {/* Away Team */}
              <div className="flex items-center gap-3">
                {game?.away_team.team_logo && (
                  <img src={game.away_team.team_logo} alt="" className="w-10 h-10 object-contain" />
                )}
                <div>
                  <div className="text-sm font-bold text-white truncate max-w-[120px]">
                    {game?.away_team.team_name.split(' ').pop()}
                  </div>
                  <div className={`text-2xl font-black ${!isHomeWinner ? 'text-green-400' : 'text-slate-500'}`}>
                    {game?.away_team.score}
                  </div>
                </div>
              </div>

              {/* VS */}
              <div className="text-slate-600 text-sm font-bold">@</div>

              {/* Home Team */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-sm font-bold text-white truncate max-w-[120px]">
                    {game?.home_team.team_name.split(' ').pop()}
                  </div>
                  <div className={`text-2xl font-black ${isHomeWinner ? 'text-green-400' : 'text-slate-500'}`}>
                    {game?.home_team.score}
                  </div>
                </div>
                {game?.home_team.team_logo && (
                  <img src={game.home_team.team_logo} alt="" className="w-10 h-10 object-contain" />
                )}
              </div>

              {/* Final Badge */}
              <span className="px-3 py-1 bg-orange-500/20 border border-orange-500/50 rounded-full text-orange-400 text-xs font-bold">
                FINAL
              </span>
            </div>

            {/* Quick Nav */}
            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'overview' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('boxscore')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'boxscore' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                Box Score
              </button>
              <button
                onClick={() => setActiveTab('teamstats')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'teamstats' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                Stats
              </button>
              <button
                onClick={() => setActiveTab('playbyplay')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'playbyplay' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                Play-by-Play
              </button>
              <button
                onClick={() => setActiveTab('props')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'props' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                Props
              </button>
              <button
                onClick={() => setActiveTab('shotchart')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'shotchart' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                Shot Chart
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Game Header with gradient background */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl p-8 border border-slate-700 shadow-2xl">
        {/* FINAL badge */}
        <div className="text-center mb-4">
          <span className="inline-block px-4 py-1 bg-orange-500/20 border border-orange-500/50 rounded-full text-orange-400 text-xs font-bold tracking-wider">
            FINAL
          </span>
        </div>

        <div className="flex items-center justify-center gap-12">
          {/* Away Team */}
          <div className={`flex flex-col items-center flex-1 transition-all duration-300 ${!isHomeWinner ? 'scale-105' : 'opacity-70'}`}>
            {game.away_team.team_logo && (
              <div className={`relative ${!isHomeWinner ? 'filter drop-shadow-[0_0_20px_rgba(234,179,8,0.4)]' : ''}`}>
                <img
                  src={game.away_team.team_logo}
                  alt={game.away_team.team_name}
                  className="w-32 h-32 object-contain mb-4"
                />
              </div>
            )}
            <h2 className="text-2xl font-bold text-center mb-2">{game.away_team.team_name}</h2>
            <div className={`text-7xl font-black tracking-tight ${!isHomeWinner ? 'text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]' : 'text-slate-500'}`}>
              {game.away_team.score}
            </div>
            {!isHomeWinner && (
              <div className="mt-3 text-yellow-400 text-2xl">🏆</div>
            )}
          </div>

          {/* VS / @ */}
          <div className="text-slate-600 text-xl font-bold">@</div>

          {/* Home Team */}
          <div className={`flex flex-col items-center flex-1 transition-all duration-300 ${isHomeWinner ? 'scale-105' : 'opacity-70'}`}>
            {game.home_team.team_logo && (
              <div className={`relative ${isHomeWinner ? 'filter drop-shadow-[0_0_20px_rgba(234,179,8,0.4)]' : ''}`}>
                <img
                  src={game.home_team.team_logo}
                  alt={game.home_team.team_name}
                  className="w-32 h-32 object-contain mb-4"
                />
              </div>
            )}
            <h2 className="text-2xl font-bold text-center mb-2">{game.home_team.team_name}</h2>
            <div className={`text-7xl font-black tracking-tight ${isHomeWinner ? 'text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]' : 'text-slate-500'}`}>
              {game.home_team.score}
            </div>
            {isHomeWinner && (
              <div className="mt-3 text-yellow-400 text-2xl">🏆</div>
            )}
          </div>
        </div>

        {/* Game Info */}
        <div className="text-center mt-6 text-slate-400 text-sm font-medium">
          {game.game_date}{game.season_type ? ` | ${game.season_type.replace('-', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}` : ''}
        </div>
      </div>

      {/* Game Context Section */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-700">
          {/* Date & Time */}
          <div className="p-6 flex items-center gap-4 hover:bg-slate-700/30 transition-all">
            <div className="flex-shrink-0 w-12 h-12 bg-orange-500/10 rounded-lg flex items-center justify-center border border-orange-500/30">
              <span className="text-2xl">📅</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Date & Time</div>
              <div className="text-base font-bold text-white truncate">
                {(() => {
                  if (game.game_date_time) {
                    const date = new Date(game.game_date_time);
                    return date.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric'
                    });
                  } else if (game.game_date) {
                    const date = new Date(game.game_date);
                    return date.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric'
                    });
                  }
                  return 'N/A';
                })()}
              </div>
              {game.game_date_time && (
                <div className="text-xs text-slate-400 mt-0.5">
                  {new Date(game.game_date_time).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZoneName: 'short'
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Venue */}
          {game.venue && (
            <div className="p-6 flex items-center gap-4 hover:bg-slate-700/30 transition-all">
              <div className="flex-shrink-0 w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center border border-green-500/30">
                <span className="text-2xl">🏟️</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Venue</div>
                <div className="text-base font-bold text-white truncate">
                  {game.venue.name || 'N/A'}
                </div>
                {game.venue.city && game.venue.state && (
                  <div className="text-xs text-slate-400 mt-0.5">
                    {game.venue.city}, {game.venue.state}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Attendance */}
          {game.attendance && (
            <div className="p-6 flex items-center gap-4 hover:bg-slate-700/30 transition-all">
              <div className="flex-shrink-0 w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center border border-purple-500/30">
                <span className="text-2xl">👥</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Attendance</div>
                <div className="text-base font-bold text-white">
                  {game.attendance.toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Season Type */}
          <div className="p-6 flex items-center gap-4 hover:bg-slate-700/30 transition-all">
            <div className="flex-shrink-0 w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center border border-blue-500/30">
              <span className="text-2xl">🏆</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Season</div>
              <div className="text-base font-bold text-white truncate">
                {game.season}{game.season_type ? ` ${game.season_type.replace('-', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}` : ''}
              </div>
            </div>
          </div>

          {/* Betting Odds - Spread */}
          {odds && odds.available && odds.odds.spread !== null && (
            <div className="p-6 flex items-center gap-4 hover:bg-slate-700/30 transition-all">
              <div className="flex-shrink-0 w-12 h-12 bg-yellow-500/10 rounded-lg flex items-center justify-center border border-yellow-500/30">
                <span className="text-2xl">📊</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Spread</div>
                <div className="text-base font-bold text-white">
                  {game.home_team.team_name.split(' ').pop()} {odds.odds.spread > 0 ? '+' : ''}{odds.odds.spread}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {odds.odds.provider}
                </div>
              </div>
            </div>
          )}

          {/* Betting Odds - Over/Under */}
          {odds && odds.available && odds.odds.over_under !== null && (
            <div className="p-6 flex items-center gap-4 hover:bg-slate-700/30 transition-all">
              <div className="flex-shrink-0 w-12 h-12 bg-red-500/10 rounded-lg flex items-center justify-center border border-red-500/30">
                <span className="text-2xl">🎯</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Over/Under</div>
                <div className="text-base font-bold text-white">
                  {odds.odds.over_under}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Total Points
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quarter-by-Quarter Scoring */}
      {game.away_team.linescores && game.away_team.linescores.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-bold text-slate-400">Team</th>
                  {game.away_team.linescores.map((_, idx) => (
                    <th key={idx} className="px-4 py-3 text-center text-sm font-bold text-slate-400">
                      Q{idx + 1}
                    </th>
                  ))}
                  <th className="px-6 py-3 text-center text-sm font-bold text-orange-400">FINAL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {/* Away Team */}
                <tr className={!isHomeWinner ? 'bg-green-500/5' : ''}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {game.away_team.team_logo && (
                        <img src={game.away_team.team_logo} alt="" className="w-8 h-8" />
                      )}
                      <span className={`font-bold ${!isHomeWinner ? 'text-white' : 'text-slate-400'}`}>
                        {game.away_team.team_name}
                      </span>
                    </div>
                  </td>
                  {game.away_team.linescores.map((score, idx) => (
                    <td key={idx} className="px-4 py-4 text-center font-semibold text-slate-300">
                      {score}
                    </td>
                  ))}
                  <td className="px-6 py-4 text-center">
                    <span className={`text-2xl font-black ${!isHomeWinner ? 'text-green-400' : 'text-slate-500'}`}>
                      {game.away_team.score}
                    </span>
                  </td>
                </tr>
                {/* Home Team */}
                <tr className={isHomeWinner ? 'bg-green-500/5' : ''}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {game.home_team.team_logo && (
                        <img src={game.home_team.team_logo} alt="" className="w-8 h-8" />
                      )}
                      <span className={`font-bold ${isHomeWinner ? 'text-white' : 'text-slate-400'}`}>
                        {game.home_team.team_name}
                      </span>
                    </div>
                  </td>
                  {game.home_team.linescores.map((score, idx) => (
                    <td key={idx} className="px-4 py-4 text-center font-semibold text-slate-300">
                      {score}
                    </td>
                  ))}
                  <td className="px-6 py-4 text-center">
                    <span className={`text-2xl font-black ${isHomeWinner ? 'text-green-400' : 'text-slate-500'}`}>
                      {game.home_team.score}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 px-6 py-4 font-bold transition-all ${
              activeTab === 'overview'
                ? 'bg-orange-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <span className="text-xl mr-2">📊</span>
            Overview
          </button>
          <button
            onClick={() => setActiveTab('boxscore')}
            className={`flex-1 px-6 py-4 font-bold transition-all ${
              activeTab === 'boxscore'
                ? 'bg-orange-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <span className="text-xl mr-2">📋</span>
            Box Score
          </button>
          <button
            onClick={() => setActiveTab('teamstats')}
            className={`flex-1 px-6 py-4 font-bold transition-all ${
              activeTab === 'teamstats'
                ? 'bg-orange-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <span className="text-xl mr-2">📈</span>
            Team Stats
          </button>
          <button
            onClick={() => setActiveTab('playbyplay')}
            className={`flex-1 px-6 py-4 font-bold transition-all ${
              activeTab === 'playbyplay'
                ? 'bg-orange-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <span className="text-xl mr-2">⏱️</span>
            Play-by-Play
          </button>
          <button
            onClick={() => setActiveTab('props')}
            className={`flex-1 px-6 py-4 font-bold transition-all ${
              activeTab === 'props'
                ? 'bg-orange-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <span className="text-xl mr-2">🎯</span>
            Props
          </button>
          <button
            onClick={() => setActiveTab('shotchart')}
            className={`flex-1 px-6 py-4 font-bold transition-all ${
              activeTab === 'shotchart'
                ? 'bg-orange-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <span className="text-xl mr-2">🏀</span>
            Shot Chart
          </button>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Betting Results Card */}
      {odds && odds.available && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
          <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <span className="text-orange-500">🎲</span>
            Betting Results
            <span className="text-xs text-slate-500 font-normal ml-2">({odds.odds.provider})</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Spread Result */}
            {odds.odds.spread !== null && (
              <div className="bg-slate-700/30 rounded-lg p-5">
                <div className="text-xs text-slate-500 uppercase font-bold mb-3">Spread</div>
                {(() => {
                  const spread = odds.odds.spread;
                  const actualMargin = game.home_team.score - game.away_team.score;
                  const spreadResult = actualMargin - spread;
                  const homeCovered = spreadResult > 0;
                  const isPush = spreadResult === 0;

                  return (
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`text-3xl ${isPush ? '⚪' : homeCovered ? '✅' : '❌'}`}>
                          {isPush ? '⚪' : homeCovered ? '✅' : '❌'}
                        </div>
                        <div>
                          <div className="text-2xl font-black text-white">
                            {game.home_team.team_name.split(' ').pop()} {spread > 0 ? '+' : ''}{spread}
                          </div>
                          <div className={`text-sm font-semibold ${isPush ? 'text-slate-400' : homeCovered ? 'text-green-400' : 'text-red-400'}`}>
                            {isPush ? 'Push' : homeCovered ? `Covered by ${Math.abs(spreadResult)}` : `Missed by ${Math.abs(spreadResult)}`}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">
                        Final margin: {game.home_team.team_name.split(' ').pop()} {actualMargin > 0 ? `+${actualMargin}` : actualMargin}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Over/Under Result */}
            {odds.odds.over_under !== null && (
              <div className="bg-slate-700/30 rounded-lg p-5">
                <div className="text-xs text-slate-500 uppercase font-bold mb-3">Over/Under</div>
                {(() => {
                  const overUnder = odds.odds.over_under;
                  const totalPoints = game.away_team.score + game.home_team.score;
                  const ouDiff = totalPoints - overUnder;
                  const wentOver = ouDiff > 0;
                  const isPush = ouDiff === 0;

                  return (
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`text-3xl ${isPush ? '⚪' : '✅'}`}>
                          {isPush ? '⚪' : '✅'}
                        </div>
                        <div>
                          <div className="text-2xl font-black text-white">
                            {wentOver ? 'Over' : 'Under'} {overUnder}
                          </div>
                          <div className={`text-sm font-semibold ${isPush ? 'text-slate-400' : wentOver ? 'text-green-400' : 'text-blue-400'}`}>
                            {isPush ? 'Push' : `By ${Math.abs(ouDiff)} points`}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">
                        Total points: {totalPoints}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Key Game Stats */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
        <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <span className="text-orange-500">📊</span>
          Key Stats
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {game.away_team.stats.largest_lead && game.home_team.stats.largest_lead && (
            <div className="bg-slate-700/30 rounded-lg p-4">
              <div className="text-xs text-slate-500 uppercase font-bold mb-2">Largest Lead</div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{game.away_team.team_name.split(' ').pop()}</span>
                  <span className="text-lg font-black text-orange-400">{game.away_team.stats.largest_lead}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{game.home_team.team_name.split(' ').pop()}</span>
                  <span className="text-lg font-black text-orange-400">{game.home_team.stats.largest_lead}</span>
                </div>
              </div>
            </div>
          )}
          {game.away_team.stats.fast_break_points && game.home_team.stats.fast_break_points && (
            <div className="bg-slate-700/30 rounded-lg p-4">
              <div className="text-xs text-slate-500 uppercase font-bold mb-2">Fast Break Pts</div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{game.away_team.team_name.split(' ').pop()}</span>
                  <span className="text-lg font-black text-green-400">{game.away_team.stats.fast_break_points}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{game.home_team.team_name.split(' ').pop()}</span>
                  <span className="text-lg font-black text-green-400">{game.home_team.stats.fast_break_points}</span>
                </div>
              </div>
            </div>
          )}
          {game.away_team.stats.points_in_paint && game.home_team.stats.points_in_paint && (
            <div className="bg-slate-700/30 rounded-lg p-4">
              <div className="text-xs text-slate-500 uppercase font-bold mb-2">Points in Paint</div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{game.away_team.team_name.split(' ').pop()}</span>
                  <span className="text-lg font-black text-blue-400">{game.away_team.stats.points_in_paint}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{game.home_team.team_name.split(' ').pop()}</span>
                  <span className="text-lg font-black text-blue-400">{game.home_team.stats.points_in_paint}</span>
                </div>
              </div>
            </div>
          )}
          {game.away_team.stats.bench_points && game.home_team.stats.bench_points && (
            <div className="bg-slate-700/30 rounded-lg p-4">
              <div className="text-xs text-slate-500 uppercase font-bold mb-2">Bench Points</div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{game.away_team.team_name.split(' ').pop()}</span>
                  <span className="text-lg font-black text-purple-400">{game.away_team.stats.bench_points}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{game.home_team.team_name.split(' ').pop()}</span>
                  <span className="text-lg font-black text-purple-400">{game.home_team.stats.bench_points}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Game Leaders with player photos */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
        <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <span className="text-orange-500">⭐</span>
          Game Leaders
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Points Leaders */}
          <div>
            <div className="text-xs text-slate-500 mb-4 font-bold uppercase tracking-wider">Points</div>
            <div className="space-y-4">
              <div
                className="relative flex items-center gap-4 p-4 bg-gradient-to-br from-orange-900/20 to-orange-800/10 border border-orange-500/30 rounded-xl cursor-pointer hover:scale-105 hover:shadow-xl hover:shadow-orange-500/20 transition-all duration-200"
                onClick={() => navigate(`/player/${awayLeaders.points.athlete_id}`)}
              >
                <PlayerImage
                  src={awayLeaders.points.athlete_headshot}
                  alt={awayLeaders.points.player_name}
                  className="w-16 h-16 rounded-full bg-slate-700 object-cover ring-2 ring-orange-500/50"
                  fallbackInitial={awayLeaders.points.player_name.charAt(0)}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-lg truncate">{awayLeaders.points.player_name}</div>
                  <div className="text-xs text-slate-400">{game.away_team.team_name}</div>
                </div>
                <div className="text-5xl font-black text-orange-400 tracking-tight">{awayLeaders.points.points}</div>
              </div>
              <div
                className="relative flex items-center gap-4 p-4 bg-gradient-to-br from-orange-900/20 to-orange-800/10 border border-orange-500/30 rounded-xl cursor-pointer hover:scale-105 hover:shadow-xl hover:shadow-orange-500/20 transition-all duration-200"
                onClick={() => navigate(`/player/${homeLeaders.points.athlete_id}`)}
              >
                <PlayerImage
                  src={homeLeaders.points.athlete_headshot}
                  alt={homeLeaders.points.player_name}
                  className="w-16 h-16 rounded-full bg-slate-700 object-cover ring-2 ring-orange-500/50"
                  fallbackInitial={homeLeaders.points.player_name.charAt(0)}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-lg truncate">{homeLeaders.points.player_name}</div>
                  <div className="text-xs text-slate-400">{game.home_team.team_name}</div>
                </div>
                <div className="text-5xl font-black text-orange-400 tracking-tight">{homeLeaders.points.points}</div>
              </div>
            </div>
          </div>

          {/* Rebounds Leaders */}
          <div>
            <div className="text-xs text-slate-500 mb-4 font-bold uppercase tracking-wider">Rebounds</div>
            <div className="space-y-4">
              <div
                className="relative flex items-center gap-4 p-4 bg-gradient-to-br from-green-900/20 to-green-800/10 border border-green-500/30 rounded-xl cursor-pointer hover:scale-105 hover:shadow-xl hover:shadow-green-500/20 transition-all duration-200"
                onClick={() => navigate(`/player/${awayLeaders.rebounds.athlete_id}`)}
              >
                <PlayerImage
                  src={awayLeaders.rebounds.athlete_headshot}
                  alt={awayLeaders.rebounds.player_name}
                  className="w-16 h-16 rounded-full bg-slate-700 object-cover ring-2 ring-green-500/50"
                  fallbackInitial={awayLeaders.rebounds.player_name.charAt(0)}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-lg truncate">{awayLeaders.rebounds.player_name}</div>
                  <div className="text-xs text-slate-400">{game.away_team.team_name}</div>
                </div>
                <div className="text-5xl font-black text-green-400 tracking-tight">{awayLeaders.rebounds.rebounds}</div>
              </div>
              <div
                className="relative flex items-center gap-4 p-4 bg-gradient-to-br from-green-900/20 to-green-800/10 border border-green-500/30 rounded-xl cursor-pointer hover:scale-105 hover:shadow-xl hover:shadow-green-500/20 transition-all duration-200"
                onClick={() => navigate(`/player/${homeLeaders.rebounds.athlete_id}`)}
              >
                <PlayerImage
                  src={homeLeaders.rebounds.athlete_headshot}
                  alt={homeLeaders.rebounds.player_name}
                  className="w-16 h-16 rounded-full bg-slate-700 object-cover ring-2 ring-green-500/50"
                  fallbackInitial={homeLeaders.rebounds.player_name.charAt(0)}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-lg truncate">{homeLeaders.rebounds.player_name}</div>
                  <div className="text-xs text-slate-400">{game.home_team.team_name}</div>
                </div>
                <div className="text-5xl font-black text-green-400 tracking-tight">{homeLeaders.rebounds.rebounds}</div>
              </div>
            </div>
          </div>

          {/* Assists Leaders */}
          <div>
            <div className="text-xs text-slate-500 mb-4 font-bold uppercase tracking-wider">Assists</div>
            <div className="space-y-4">
              <div
                className="relative flex items-center gap-4 p-4 bg-gradient-to-br from-blue-900/20 to-blue-800/10 border border-blue-500/30 rounded-xl cursor-pointer hover:scale-105 hover:shadow-xl hover:shadow-blue-500/20 transition-all duration-200"
                onClick={() => navigate(`/player/${awayLeaders.assists.athlete_id}`)}
              >
                <PlayerImage
                  src={awayLeaders.assists.athlete_headshot}
                  alt={awayLeaders.assists.player_name}
                  className="w-16 h-16 rounded-full bg-slate-700 object-cover ring-2 ring-blue-500/50"
                  fallbackInitial={awayLeaders.assists.player_name.charAt(0)}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-lg truncate">{awayLeaders.assists.player_name}</div>
                  <div className="text-xs text-slate-400">{game.away_team.team_name}</div>
                </div>
                <div className="text-5xl font-black text-blue-400 tracking-tight">{awayLeaders.assists.assists}</div>
              </div>
              <div
                className="relative flex items-center gap-4 p-4 bg-gradient-to-br from-blue-900/20 to-blue-800/10 border border-blue-500/30 rounded-xl cursor-pointer hover:scale-105 hover:shadow-xl hover:shadow-blue-500/20 transition-all duration-200"
                onClick={() => navigate(`/player/${homeLeaders.assists.athlete_id}`)}
              >
                <PlayerImage
                  src={homeLeaders.assists.athlete_headshot}
                  alt={homeLeaders.assists.player_name}
                  className="w-16 h-16 rounded-full bg-slate-700 object-cover ring-2 ring-blue-500/50"
                  fallbackInitial={homeLeaders.assists.player_name.charAt(0)}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-lg truncate">{homeLeaders.assists.player_name}</div>
                  <div className="text-xs text-slate-400">{game.home_team.team_name}</div>
                </div>
                <div className="text-5xl font-black text-blue-400 tracking-tight">{homeLeaders.assists.assists}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
        </div>
      )}

      {/* Team Stats Tab */}
      {activeTab === 'teamstats' && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
          <h3 className="text-2xl font-bold mb-6">Team Stats</h3>

        {/* Shooting Stats with detailed breakdown */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <div className="flex items-center gap-2">
              <span className={parseFloat(game.away_team.stats.field_goal_pct) > parseFloat(game.home_team.stats.field_goal_pct) ? 'text-white font-bold' : 'text-slate-400'}>
                {game.away_team.stats.field_goals} ({game.away_team.stats.field_goal_pct}%)
              </span>
            </div>
            <span className="text-slate-400 font-semibold uppercase text-xs">Field Goals</span>
            <div className="flex items-center gap-2">
              <span className={parseFloat(game.home_team.stats.field_goal_pct) > parseFloat(game.away_team.stats.field_goal_pct) ? 'text-white font-bold' : 'text-slate-400'}>
                {game.home_team.stats.field_goals} ({game.home_team.stats.field_goal_pct}%)
              </span>
            </div>
          </div>
          <StatComparisonBar label="" awayValue={game.away_team.stats.field_goal_pct} homeValue={game.home_team.stats.field_goal_pct} isPercentage />
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <div className="flex items-center gap-2">
              <span className={parseFloat(game.away_team.stats.three_point_pct) > parseFloat(game.home_team.stats.three_point_pct) ? 'text-white font-bold' : 'text-slate-400'}>
                {game.away_team.stats.three_pointers} ({game.away_team.stats.three_point_pct}%)
              </span>
            </div>
            <span className="text-slate-400 font-semibold uppercase text-xs">3-Pointers</span>
            <div className="flex items-center gap-2">
              <span className={parseFloat(game.home_team.stats.three_point_pct) > parseFloat(game.away_team.stats.three_point_pct) ? 'text-white font-bold' : 'text-slate-400'}>
                {game.home_team.stats.three_pointers} ({game.home_team.stats.three_point_pct}%)
              </span>
            </div>
          </div>
          <StatComparisonBar label="" awayValue={game.away_team.stats.three_point_pct} homeValue={game.home_team.stats.three_point_pct} isPercentage />
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <div className="flex items-center gap-2">
              <span className={parseFloat(game.away_team.stats.free_throw_pct) > parseFloat(game.home_team.stats.free_throw_pct) ? 'text-white font-bold' : 'text-slate-400'}>
                {game.away_team.stats.free_throws} ({game.away_team.stats.free_throw_pct}%)
              </span>
            </div>
            <span className="text-slate-400 font-semibold uppercase text-xs">Free Throws</span>
            <div className="flex items-center gap-2">
              <span className={parseFloat(game.home_team.stats.free_throw_pct) > parseFloat(game.away_team.stats.free_throw_pct) ? 'text-white font-bold' : 'text-slate-400'}>
                {game.home_team.stats.free_throws} ({game.home_team.stats.free_throw_pct}%)
              </span>
            </div>
          </div>
          <StatComparisonBar label="" awayValue={game.away_team.stats.free_throw_pct} homeValue={game.home_team.stats.free_throw_pct} isPercentage />
        </div>

        {/* Other stats without detailed breakdown */}
        <StatComparisonBar label="Rebounds" awayValue={game.away_team.stats.rebounds} homeValue={game.home_team.stats.rebounds} />
        <StatComparisonBar label="Assists" awayValue={game.away_team.stats.assists} homeValue={game.home_team.stats.assists} />
        <StatComparisonBar label="Steals" awayValue={game.away_team.stats.steals} homeValue={game.home_team.stats.steals} />
        <StatComparisonBar label="Blocks" awayValue={game.away_team.stats.blocks} homeValue={game.home_team.stats.blocks} />
        <StatComparisonBar label="Turnovers" awayValue={game.away_team.stats.turnovers} homeValue={game.home_team.stats.turnovers} />
        </div>
      )}

      {/* Box Score Tab */}
      {activeTab === 'boxscore' && (
        <div className="space-y-6">
      {/* Box Scores - Side by Side */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold">Box Score</h3>
          <button
            onClick={() => setExpandedStats(!expandedStats)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-sm font-semibold transition-all"
          >
            {expandedStats ? '📊 Basic Stats' : '📈 Expanded Stats'}
          </button>
        </div>

        {/* Sort Controls */}
        <div className="flex gap-2 mb-6 text-sm flex-wrap">
          <span className="text-slate-400 font-semibold">Sort by:</span>
          <button
            onClick={() => handleSort('points')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${sortKey === 'points' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            PTS {sortKey === 'points' && (sortDirection === 'desc' ? '↓' : '↑')}
          </button>
          <button
            onClick={() => handleSort('rebounds')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${sortKey === 'rebounds' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            REB {sortKey === 'rebounds' && (sortDirection === 'desc' ? '↓' : '↑')}
          </button>
          <button
            onClick={() => handleSort('assists')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${sortKey === 'assists' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            AST {sortKey === 'assists' && (sortDirection === 'desc' ? '↓' : '↑')}
          </button>
          <button
            onClick={() => handleSort('minutes')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${sortKey === 'minutes' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            MIN {sortKey === 'minutes' && (sortDirection === 'desc' ? '↓' : '↑')}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Away Team Box Score */}
          <div>
            <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
              {game.away_team.team_logo && (
                <img src={game.away_team.team_logo} alt="" className="w-7 h-7" />
              )}
              {game.away_team.team_name}
            </h4>

            {/* Starters */}
            <div className="text-xs text-slate-500 mb-2 font-bold uppercase tracking-wider">Starters</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b-2 border-slate-700">
                  <tr className="text-left">
                    <th className="pb-2 font-bold text-slate-400 uppercase">Player</th>
                    <th className="pb-2 font-bold text-center text-slate-400 uppercase">Min</th>
                    {!expandedStats && (
                      <>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">FGM-A</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">3PM-A</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Pts</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Ast</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Reb</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Blk</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Stl</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Fls</th>
                      </>
                    )}
                    {expandedStats && (
                      <>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Pts</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">FGM-A</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">3PM-A</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">FTM-A</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">OR</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">DR</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Reb</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Ast</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Stl</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Blk</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">TO</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Fls</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">+/-</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {sortedAwayStarters.map((player: any) => {
                    const isTopScorer = awayTopScorer && player.athlete_id === awayTopScorer.athlete_id;
                    return (
                      <tr
                        key={player.athlete_id}
                        className={`cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${isTopScorer ? 'bg-orange-500/5' : 'hover:bg-slate-700/50'}`}
                        onClick={() => navigate(`/player/${player.athlete_id}`)}
                      >
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <PlayerImage
                              src={player.athlete_headshot}
                              alt={player.player_name}
                              className="w-8 h-8 rounded-full bg-slate-700 object-cover text-xs"
                              fallbackInitial={player.player_name.charAt(0)}
                            />
                            <div>
                              <div className="font-semibold text-sm">{player.player_name}</div>
                              <div className="text-xs text-slate-500">{player.position}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-center font-medium">{player.minutes}</td>
                        {!expandedStats && (
                          <>
                            <td className="py-3 text-center font-medium text-xs">{player.fieldGoalsMade_fieldGoalsAttempted}</td>
                            <td className="py-3 text-center font-medium text-xs">{player.threePointFieldGoalsMade_threePointFieldGoalsAttempted}</td>
                            <td className={`py-3 text-center font-black ${isTopScorer ? 'text-orange-400 text-base' : 'text-orange-500'}`}>{player.points}</td>
                            <td className="py-3 text-center font-medium">{player.assists}</td>
                            <td className="py-3 text-center font-medium">{player.rebounds}</td>
                            <td className="py-3 text-center font-medium">{player.blocks}</td>
                            <td className="py-3 text-center font-medium">{player.steals}</td>
                            <td className="py-3 text-center font-medium">{player.fouls || '0'}</td>
                          </>
                        )}
                        {expandedStats && (
                          <>
                            <td className={`py-3 text-center font-black ${isTopScorer ? 'text-orange-400 text-base' : 'text-orange-500'}`}>{player.points}</td>
                            <td className="py-3 text-center font-medium text-xs">{player.fieldGoalsMade_fieldGoalsAttempted}</td>
                            <td className="py-3 text-center font-medium text-xs">{player.threePointFieldGoalsMade_threePointFieldGoalsAttempted}</td>
                            <td className="py-3 text-center font-medium text-xs">{player.freeThrowsMade_freeThrowsAttempted}</td>
                            <td className="py-3 text-center font-medium">{player.offensiveRebounds || '0'}</td>
                            <td className="py-3 text-center font-medium">{player.defensiveRebounds || '0'}</td>
                            <td className="py-3 text-center font-medium">{player.rebounds}</td>
                            <td className="py-3 text-center font-medium">{player.assists}</td>
                            <td className="py-3 text-center font-medium">{player.steals}</td>
                            <td className="py-3 text-center font-medium">{player.blocks}</td>
                            <td className="py-3 text-center font-medium">{player.turnovers}</td>
                            <td className="py-3 text-center font-medium">{player.fouls || '0'}</td>
                            <td className={`py-3 text-center font-bold ${
                              player.plusMinus && parseInt(player.plusMinus) > 0
                                ? 'text-green-400'
                                : player.plusMinus && parseInt(player.plusMinus) < 0
                                ? 'text-red-400'
                                : 'text-slate-500'
                            }`}>
                              {player.plusMinus || '0'}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bench */}
            {sortedAwayBench.length > 0 && (
              <>
                <div className="text-xs text-slate-500 mb-2 mt-6 font-bold uppercase tracking-wider">Bench</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b-2 border-slate-700">
                      <tr className="text-left">
                        <th className="pb-2 font-bold text-slate-400 uppercase">Player</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Min</th>
                        {!expandedStats && (
                          <>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">FGM-A</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">3PM-A</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Pts</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Ast</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Reb</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Blk</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Stl</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Fls</th>
                          </>
                        )}
                        {expandedStats && (
                          <>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Pts</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">FGM-A</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">3PM-A</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">FTM-A</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">OR</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">DR</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Reb</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Ast</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Stl</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Blk</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">TO</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Fls</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">+/-</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {sortedAwayBench.map((player: any) => (
                        <tr
                          key={player.athlete_id}
                          className="cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:bg-slate-700/50"
                          onClick={() => navigate(`/player/${player.athlete_id}`)}
                        >
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              {player.athlete_headshot && (
                                <img
                                  src={player.athlete_headshot}
                                  alt={player.player_name}
                                  className="w-8 h-8 rounded-full bg-slate-700 object-cover"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              )}
                              <div>
                                <div className="font-semibold text-sm">{player.player_name}</div>
                                <div className="text-xs text-slate-500">{player.position}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 text-center font-medium">{player.minutes}</td>
                          {!expandedStats && (
                            <>
                              <td className="py-3 text-center font-medium text-xs">{player.fieldGoalsMade_fieldGoalsAttempted}</td>
                              <td className="py-3 text-center font-medium text-xs">{player.threePointFieldGoalsMade_threePointFieldGoalsAttempted}</td>
                              <td className="py-3 text-center font-black text-orange-500">{player.points}</td>
                              <td className="py-3 text-center font-medium">{player.assists}</td>
                              <td className="py-3 text-center font-medium">{player.rebounds}</td>
                              <td className="py-3 text-center font-medium">{player.blocks}</td>
                              <td className="py-3 text-center font-medium">{player.steals}</td>
                              <td className="py-3 text-center font-medium">{player.fouls || '0'}</td>
                            </>
                          )}
                          {expandedStats && (
                            <>
                              <td className="py-3 text-center font-black text-orange-500">{player.points}</td>
                              <td className="py-3 text-center font-medium text-xs">{player.fieldGoalsMade_fieldGoalsAttempted}</td>
                              <td className="py-3 text-center font-medium text-xs">{player.threePointFieldGoalsMade_threePointFieldGoalsAttempted}</td>
                              <td className="py-3 text-center font-medium text-xs">{player.freeThrowsMade_freeThrowsAttempted}</td>
                              <td className="py-3 text-center font-medium">{player.offensiveRebounds || '0'}</td>
                              <td className="py-3 text-center font-medium">{player.defensiveRebounds || '0'}</td>
                              <td className="py-3 text-center font-medium">{player.rebounds}</td>
                              <td className="py-3 text-center font-medium">{player.assists}</td>
                              <td className="py-3 text-center font-medium">{player.steals}</td>
                              <td className="py-3 text-center font-medium">{player.blocks}</td>
                              <td className="py-3 text-center font-medium">{player.turnovers}</td>
                              <td className="py-3 text-center font-medium">{player.fouls || '0'}</td>
                              <td className={`py-3 text-center font-bold ${
                                player.plusMinus && parseInt(player.plusMinus) > 0
                                  ? 'text-green-400'
                                  : player.plusMinus && parseInt(player.plusMinus) < 0
                                  ? 'text-red-400'
                                  : 'text-slate-500'
                              }`}>
                                {player.plusMinus || '0'}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Home Team Box Score */}
          <div>
            <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
              {game.home_team.team_logo && (
                <img src={game.home_team.team_logo} alt="" className="w-7 h-7" />
              )}
              {game.home_team.team_name}
            </h4>

            {/* Starters */}
            <div className="text-xs text-slate-500 mb-2 font-bold uppercase tracking-wider">Starters</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b-2 border-slate-700">
                  <tr className="text-left">
                    <th className="pb-2 font-bold text-slate-400 uppercase">Player</th>
                    <th className="pb-2 font-bold text-center text-slate-400 uppercase">Min</th>
                    {!expandedStats && (
                      <>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">FGM-A</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">3PM-A</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Pts</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Ast</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Reb</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Blk</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Stl</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Fls</th>
                      </>
                    )}
                    {expandedStats && (
                      <>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Pts</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">FGM-A</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">3PM-A</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">FTM-A</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">OR</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">DR</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Reb</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Ast</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Stl</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Blk</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">TO</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Fls</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">+/-</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {sortedHomeStarters.map((player: any) => {
                    const isTopScorer = homeTopScorer && player.athlete_id === homeTopScorer.athlete_id;
                    return (
                      <tr
                        key={player.athlete_id}
                        className={`cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${isTopScorer ? 'bg-orange-500/5' : 'hover:bg-slate-700/50'}`}
                        onClick={() => navigate(`/player/${player.athlete_id}`)}
                      >
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <PlayerImage
                              src={player.athlete_headshot}
                              alt={player.player_name}
                              className="w-8 h-8 rounded-full bg-slate-700 object-cover text-xs"
                              fallbackInitial={player.player_name.charAt(0)}
                            />
                            <div>
                              <div className="font-semibold text-sm">{player.player_name}</div>
                              <div className="text-xs text-slate-500">{player.position}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-center font-medium">{player.minutes}</td>
                        {!expandedStats && (
                          <>
                            <td className="py-3 text-center font-medium text-xs">{player.fieldGoalsMade_fieldGoalsAttempted}</td>
                            <td className="py-3 text-center font-medium text-xs">{player.threePointFieldGoalsMade_threePointFieldGoalsAttempted}</td>
                            <td className={`py-3 text-center font-black ${isTopScorer ? 'text-orange-400 text-base' : 'text-orange-500'}`}>{player.points}</td>
                            <td className="py-3 text-center font-medium">{player.assists}</td>
                            <td className="py-3 text-center font-medium">{player.rebounds}</td>
                            <td className="py-3 text-center font-medium">{player.blocks}</td>
                            <td className="py-3 text-center font-medium">{player.steals}</td>
                            <td className="py-3 text-center font-medium">{player.fouls || '0'}</td>
                          </>
                        )}
                        {expandedStats && (
                          <>
                            <td className={`py-3 text-center font-black ${isTopScorer ? 'text-orange-400 text-base' : 'text-orange-500'}`}>{player.points}</td>
                            <td className="py-3 text-center font-medium text-xs">{player.fieldGoalsMade_fieldGoalsAttempted}</td>
                            <td className="py-3 text-center font-medium text-xs">{player.threePointFieldGoalsMade_threePointFieldGoalsAttempted}</td>
                            <td className="py-3 text-center font-medium text-xs">{player.freeThrowsMade_freeThrowsAttempted}</td>
                            <td className="py-3 text-center font-medium">{player.offensiveRebounds || '0'}</td>
                            <td className="py-3 text-center font-medium">{player.defensiveRebounds || '0'}</td>
                            <td className="py-3 text-center font-medium">{player.rebounds}</td>
                            <td className="py-3 text-center font-medium">{player.assists}</td>
                            <td className="py-3 text-center font-medium">{player.steals}</td>
                            <td className="py-3 text-center font-medium">{player.blocks}</td>
                            <td className="py-3 text-center font-medium">{player.turnovers}</td>
                            <td className="py-3 text-center font-medium">{player.fouls || '0'}</td>
                            <td className={`py-3 text-center font-bold ${
                              player.plusMinus && parseInt(player.plusMinus) > 0
                                ? 'text-green-400'
                                : player.plusMinus && parseInt(player.plusMinus) < 0
                                ? 'text-red-400'
                                : 'text-slate-500'
                            }`}>
                              {player.plusMinus || '0'}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bench */}
            {sortedHomeBench.length > 0 && (
              <>
                <div className="text-xs text-slate-500 mb-2 mt-6 font-bold uppercase tracking-wider">Bench</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b-2 border-slate-700">
                      <tr className="text-left">
                        <th className="pb-2 font-bold text-slate-400 uppercase">Player</th>
                        <th className="pb-2 font-bold text-center text-slate-400 uppercase">Min</th>
                        {!expandedStats && (
                          <>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">FGM-A</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">3PM-A</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Pts</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Ast</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Reb</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Blk</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Stl</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Fls</th>
                          </>
                        )}
                        {expandedStats && (
                          <>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Pts</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">FGM-A</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">3PM-A</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">FTM-A</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">OR</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">DR</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Reb</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Ast</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Stl</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Blk</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">TO</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">Fls</th>
                            <th className="pb-2 font-bold text-center text-slate-400 uppercase">+/-</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {sortedHomeBench.map((player: any) => (
                        <tr
                          key={player.athlete_id}
                          className="cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:bg-slate-700/50"
                          onClick={() => navigate(`/player/${player.athlete_id}`)}
                        >
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              {player.athlete_headshot && (
                                <img
                                  src={player.athlete_headshot}
                                  alt={player.player_name}
                                  className="w-8 h-8 rounded-full bg-slate-700 object-cover"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              )}
                              <div>
                                <div className="font-semibold text-sm">{player.player_name}</div>
                                <div className="text-xs text-slate-500">{player.position}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 text-center font-medium">{player.minutes}</td>
                          {!expandedStats && (
                            <>
                              <td className="py-3 text-center font-medium text-xs">{player.fieldGoalsMade_fieldGoalsAttempted}</td>
                              <td className="py-3 text-center font-medium text-xs">{player.threePointFieldGoalsMade_threePointFieldGoalsAttempted}</td>
                              <td className="py-3 text-center font-black text-orange-500">{player.points}</td>
                              <td className="py-3 text-center font-medium">{player.assists}</td>
                              <td className="py-3 text-center font-medium">{player.rebounds}</td>
                              <td className="py-3 text-center font-medium">{player.blocks}</td>
                              <td className="py-3 text-center font-medium">{player.steals}</td>
                              <td className="py-3 text-center font-medium">{player.fouls || '0'}</td>
                            </>
                          )}
                          {expandedStats && (
                            <>
                              <td className="py-3 text-center font-black text-orange-500">{player.points}</td>
                              <td className="py-3 text-center font-medium text-xs">{player.fieldGoalsMade_fieldGoalsAttempted}</td>
                              <td className="py-3 text-center font-medium text-xs">{player.threePointFieldGoalsMade_threePointFieldGoalsAttempted}</td>
                              <td className="py-3 text-center font-medium text-xs">{player.freeThrowsMade_freeThrowsAttempted}</td>
                              <td className="py-3 text-center font-medium">{player.offensiveRebounds || '0'}</td>
                              <td className="py-3 text-center font-medium">{player.defensiveRebounds || '0'}</td>
                              <td className="py-3 text-center font-medium">{player.rebounds}</td>
                              <td className="py-3 text-center font-medium">{player.assists}</td>
                              <td className="py-3 text-center font-medium">{player.steals}</td>
                              <td className="py-3 text-center font-medium">{player.blocks}</td>
                              <td className="py-3 text-center font-medium">{player.turnovers}</td>
                              <td className="py-3 text-center font-medium">{player.fouls || '0'}</td>
                              <td className={`py-3 text-center font-bold ${
                                player.plusMinus && parseInt(player.plusMinus) > 0
                                  ? 'text-green-400'
                                  : player.plusMinus && parseInt(player.plusMinus) < 0
                                  ? 'text-red-400'
                                  : 'text-slate-500'
                              }`}>
                                {player.plusMinus || '0'}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )}

      {/* Play-by-Play Tab */}
      {activeTab === 'playbyplay' && (
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
        <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <span className="text-orange-500">📋</span>
          Play-by-Play
        </h3>

        {/* Filters */}
        <div className="flex gap-4 mb-6 flex-wrap items-center">
          {/* Quarter Filter */}
          <div className="flex gap-2">
            <span className="text-slate-400 font-semibold text-sm">Quarter:</span>
            {['all', '1', '2', '3', '4'].map((q) => (
              <button
                key={q}
                onClick={() => setSelectedQuarter(q)}
                className={`px-3 py-1 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  selectedQuarter === q
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {q === 'all' ? 'All' : `Q${q}`}
              </button>
            ))}
          </div>

          {/* Scoring Only Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={scoringOnly}
              onChange={(e) => setScoringOnly(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-orange-500 focus:ring-orange-500 focus:ring-offset-slate-800"
            />
            <span className="text-sm text-slate-300">Scoring plays only</span>
          </label>
        </div>

        {/* Plays List */}
        {isLoadingPlays ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-12 w-12 border-4 border-orange-500 border-t-transparent rounded-full"></div>
          </div>
        ) : playByPlay && playByPlay.plays && playByPlay.plays.length > 0 ? (
          <div className="space-y-1">
            {playByPlay.plays.map((play: any, idx: number) => {
              const isScoring = play.scoring_play === '1';
              const isMade = play.text && (play.text.includes('makes') || play.text.includes('made'));

              return (
                <div
                  key={play.play_id}
                  className={`flex items-center gap-4 p-3 rounded-lg transition-all duration-200 ${
                    isScoring
                      ? 'bg-gradient-to-r from-orange-900/20 to-orange-800/10 border-l-4 border-orange-500 hover:shadow-lg hover:shadow-orange-500/10'
                      : 'bg-slate-700/30 hover:bg-slate-700/50'
                  }`}
                >
                  {/* Quarter & Time */}
                  <div className="flex flex-col items-center min-w-[80px]">
                    <div className="text-xs text-slate-500 font-bold uppercase">{play.quarter_display_value?.replace(' Quarter', '')}</div>
                    <div className="text-sm font-mono font-semibold">{play.clock_display_value}</div>
                  </div>

                  {/* Player Photo (for scoring plays) */}
                  {isScoring && play.participant_1_headshot && (
                    <PlayerImage
                      src={play.participant_1_headshot}
                      alt={play.participant_1_name}
                      className="w-10 h-10 rounded-full bg-slate-700 object-cover ring-2 ring-orange-500/50 text-xs"
                      fallbackInitial={play.participant_1_name?.charAt(0) || '?'}
                    />
                  )}

                  {/* Play Description */}
                  <div className="flex-1">
                    <div className={`text-sm ${isScoring && isMade ? 'font-semibold text-white' : 'text-slate-300'}`}>
                      {play.text}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{play.playType_text}</div>
                  </div>

                  {/* Score */}
                  <div className="flex items-center gap-2 min-w-[150px] justify-end">
                    {isScoring ? (
                      <div className="flex items-center gap-2">
                        {game.away_team.team_logo && (
                          <img src={game.away_team.team_logo} alt="" className="w-5 h-5 object-contain" />
                        )}
                        <span className={`text-lg font-black ${isMade ? 'text-orange-400' : 'text-slate-500'}`}>
                          {play.awayScore}
                        </span>
                        <span className="text-slate-600">-</span>
                        <span className={`text-lg font-black ${isMade ? 'text-orange-400' : 'text-slate-500'}`}>
                          {play.homeScore}
                        </span>
                        {game.home_team.team_logo && (
                          <img src={game.home_team.team_logo} alt="" className="w-5 h-5 object-contain" />
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        {game.away_team.team_logo && (
                          <img src={game.away_team.team_logo} alt="" className="w-4 h-4 object-contain opacity-50" />
                        )}
                        <span>{play.awayScore}-{play.homeScore}</span>
                        {game.home_team.team_logo && (
                          <img src={game.home_team.team_logo} alt="" className="w-4 h-4 object-contain opacity-50" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-slate-400 py-12">
            No plays found
          </div>
        )}

        {playByPlay && playByPlay.total_plays > 0 && (
          <div className="text-center text-sm text-slate-500 mt-6">
            Showing {playByPlay.plays.length} of {playByPlay.total_plays} plays
          </div>
        )}
      </div>
      )}

      {/* Props Tab */}
      {activeTab === 'props' && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
          <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <span className="text-orange-500">🎯</span>
            Player Props Results
            {playerProps && playerProps.available && (
              <span className="text-xs text-slate-500 font-normal ml-2">({playerProps.provider})</span>
            )}
          </h3>

          {playerProps && playerProps.available ? (
            (() => {
              const propsResults = getPlayerPropsResults();

              if (propsResults.length === 0) {
                return (
                  <div className="text-center text-slate-400 py-12">
                    No player props data available for players who participated in this game
                  </div>
                );
              }

              // Get unique teams
              const teams = Array.from(new Set(propsResults.map((p: any) => p.team_name)));

              // Filter by team first
              const teamFilteredResults = selectedTeam === 'all'
                ? propsResults
                : propsResults.filter((p: any) => p.team_name === selectedTeam);

              // Get players from selected team
              const availablePlayers = teamFilteredResults.map((p: any) => ({
                id: p.athlete_id,
                name: p.athlete_name
              }));

              // Filter by player
              const filteredResults = selectedPlayer === 'all'
                ? teamFilteredResults
                : teamFilteredResults.filter((p: any) => p.athlete_id === selectedPlayer);

              // Reset player selection if team changes and player not in new team
              if (selectedPlayer !== 'all' && !availablePlayers.find((p: any) => p.id === selectedPlayer)) {
                setSelectedPlayer('all');
              }

              // Calculate summary statistics from filtered results
              const totalProps = filteredResults.reduce((sum: number, p: any) => sum + p.props.length, 0);
              const hitsCount = filteredResults.reduce((sum: number, p: any) =>
                sum + p.props.filter((prop: any) => prop.hitOver && prop.difference !== 0).length, 0
              );
              const missesCount = filteredResults.reduce((sum: number, p: any) =>
                sum + p.props.filter((prop: any) => !prop.hitOver && prop.difference !== 0).length, 0
              );
              const pushesCount = filteredResults.reduce((sum: number, p: any) =>
                sum + p.props.filter((prop: any) => prop.difference === 0).length, 0
              );
              const hitRate = totalProps > 0 ? ((hitsCount / (totalProps - pushesCount)) * 100).toFixed(1) : '0.0';

              return (
                <div className="space-y-6">
                  {/* Filters */}
                  <div className="flex flex-wrap gap-4 items-center">
                    {/* Team Filter */}
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-400 font-semibold">Team:</label>
                      <select
                        value={selectedTeam}
                        onChange={(e) => {
                          setSelectedTeam(e.target.value);
                          setSelectedPlayer('all');
                        }}
                        className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="all">All Teams</option>
                        {teams.map((team: string) => (
                          <option key={team} value={team}>{team}</option>
                        ))}
                      </select>
                    </div>

                    {/* Player Filter */}
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-400 font-semibold">Player:</label>
                      <select
                        value={selectedPlayer}
                        onChange={(e) => setSelectedPlayer(e.target.value)}
                        className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="all">All Players</option>
                        {availablePlayers.map((player: any) => (
                          <option key={player.id} value={player.id}>{player.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Clear Filters Button */}
                    {(selectedTeam !== 'all' || selectedPlayer !== 'all') && (
                      <button
                        onClick={() => {
                          setSelectedTeam('all');
                          setSelectedPlayer('all');
                        }}
                        className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-lg text-red-400 font-semibold text-sm transition-all"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>

                  {/* Summary Statistics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-slate-700/50 to-slate-700/30 rounded-lg p-4 border border-slate-600">
                      <div className="text-xs text-slate-400 uppercase font-bold mb-1">Total Props</div>
                      <div className="text-3xl font-black text-white">{totalProps}</div>
                    </div>
                    <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 rounded-lg p-4 border border-green-500/30">
                      <div className="text-xs text-green-400 uppercase font-bold mb-1">Hits</div>
                      <div className="text-3xl font-black text-green-400">{hitsCount}</div>
                    </div>
                    <div className="bg-gradient-to-br from-red-900/30 to-red-800/20 rounded-lg p-4 border border-red-500/30">
                      <div className="text-xs text-red-400 uppercase font-bold mb-1">Misses</div>
                      <div className="text-3xl font-black text-red-400">{missesCount}</div>
                    </div>
                    <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/20 rounded-lg p-4 border border-orange-500/30">
                      <div className="text-xs text-orange-400 uppercase font-bold mb-1">Hit Rate</div>
                      <div className="text-3xl font-black text-orange-400">{hitRate}%</div>
                    </div>
                  </div>

                  {/* Player Props */}
                  {filteredResults.map((playerResult: any) => {
                    // Calculate player's prop success rate
                    const playerHits = playerResult.props.filter((p: any) => p.hitOver && p.difference !== 0).length;
                    const playerMisses = playerResult.props.filter((p: any) => !p.hitOver && p.difference !== 0).length;
                    const playerTotal = playerHits + playerMisses;
                    const playerHitRate = playerTotal > 0 ? (playerHits / playerTotal) * 100 : 0;
                    const isPlayerWinning = playerHits > playerMisses;

                    return (
                    <div
                      key={playerResult.athlete_id}
                      className={`relative rounded-xl p-5 transition-all border-2 shadow-xl ${
                        isPlayerWinning
                          ? 'bg-gradient-to-br from-green-900/20 via-slate-800 to-slate-800 border-green-500/30 shadow-green-500/20'
                          : 'bg-gradient-to-br from-slate-800 via-slate-800 to-red-900/20 border-red-500/30 shadow-red-500/20'
                      } hover:scale-[1.01]`}
                    >
                      {/* Player Header */}
                      <div
                        className="flex items-center gap-4 mb-4 pb-4 border-b-2 border-slate-600/50 cursor-pointer group"
                        onClick={() => navigate(`/player/${playerResult.athlete_id}`)}
                      >
                        <div className="relative">
                          <PlayerImage
                            src={playerResult.athlete_headshot}
                            alt={playerResult.athlete_name}
                            className={`w-20 h-20 rounded-full bg-slate-700 object-cover ring-4 transition-all group-hover:scale-105 text-base ${
                              isPlayerWinning
                                ? 'ring-green-500/50 group-hover:ring-green-500/70'
                                : 'ring-orange-500/50 group-hover:ring-orange-500/70'
                            }`}
                            fallbackInitial={playerResult.athlete_name.charAt(0)}
                          />
                          {/* Hit rate badge */}
                          <div className={`absolute -bottom-1 -right-1 px-2 py-0.5 rounded-full text-xs font-black border-2 ${
                            isPlayerWinning
                              ? 'bg-green-500 text-white border-green-400'
                              : 'bg-red-500 text-white border-red-400'
                          }`}>
                            {playerHitRate.toFixed(0)}%
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="font-black text-2xl text-white group-hover:text-orange-400 transition-colors">
                            {playerResult.athlete_name}
                          </div>
                          <div className="text-sm text-slate-400 font-semibold">{playerResult.team_name}</div>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-xs text-green-400 font-bold">{playerHits} Hits</span>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-xs text-red-400 font-bold">{playerMisses} Misses</span>
                          </div>
                        </div>
                      </div>

                      {/* Props Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {playerResult.props.map((prop: any, idx: number) => {
                          const isPush = prop.difference === 0;
                          const hitOver = prop.hitOver;
                          const percentOfLine = (prop.actualValue / prop.line) * 100;

                          // Get prop type category for badge color
                          const getPropCategory = (type: string) => {
                            if (type.includes('Point')) return { color: 'orange', icon: '🏀' };
                            if (type.includes('Rebound')) return { color: 'green', icon: '🔄' };
                            if (type.includes('Assist')) return { color: 'blue', icon: '🎯' };
                            if (type.includes('Steal')) return { color: 'purple', icon: '🖐️' };
                            if (type.includes('Block')) return { color: 'red', icon: '🚫' };
                            if (type.includes('3-Point') || type.includes('Field Goal')) return { color: 'yellow', icon: '🎲' };
                            return { color: 'slate', icon: '📊' };
                          };

                          const category = getPropCategory(prop.type);

                          return (
                            <div
                              key={idx}
                              className={`relative rounded-lg p-4 border-2 transition-all hover:scale-[1.02] ${
                                isPush
                                  ? 'bg-slate-700/40 border-slate-600'
                                  : hitOver
                                    ? 'bg-gradient-to-br from-green-900/20 to-green-800/10 border-green-500/40 shadow-lg shadow-green-500/10'
                                    : 'bg-gradient-to-br from-red-900/20 to-red-800/10 border-red-500/40 shadow-lg shadow-red-500/10'
                              }`}
                            >
                              {/* Prop Type Badge */}
                              <div className="flex items-center justify-between mb-3">
                                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-${category.color}-500/20 text-${category.color}-400 border border-${category.color}-500/30`}>
                                  <span>{category.icon}</span>
                                  <span>{prop.type}</span>
                                </div>
                                <div className="text-2xl">
                                  {isPush ? '⚪' : hitOver ? '✅' : '🔻'}
                                </div>
                              </div>

                              {/* Line vs Actual */}
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <div className="text-xs text-slate-400 uppercase font-bold mb-1">Line</div>
                                  <div className="text-2xl font-black text-orange-400">{prop.line}</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs text-slate-400 uppercase font-bold mb-1">Actual</div>
                                  <div className={`text-2xl font-black ${
                                    isPush ? 'text-slate-400' : hitOver ? 'text-green-400' : 'text-red-400'
                                  }`}>
                                    {prop.actualValue}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs text-slate-400 uppercase font-bold mb-1">Diff</div>
                                  <div className={`text-xl font-black ${
                                    isPush ? 'text-slate-400' : hitOver ? 'text-green-400' : 'text-red-400'
                                  }`}>
                                    {isPush ? 'Push' : hitOver ? `+${prop.difference.toFixed(1)}` : prop.difference.toFixed(1)}
                                  </div>
                                </div>
                              </div>

                              {/* Progress Bar */}
                              <div className="mb-3">
                                {hitOver && !isPush ? (
                                  // Over hit - show full bar
                                  <>
                                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                                      <span>Line: {prop.line}</span>
                                      <span className="font-semibold text-green-400">Over Hit ✓</span>
                                      <span>Actual: {prop.actualValue}</span>
                                    </div>
                                    <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
                                      <div className="absolute left-0 top-0 h-full w-full bg-green-500 transition-all duration-500" />
                                    </div>
                                  </>
                                ) : !hitOver && !isPush ? (
                                  // Under - show how far from line
                                  <>
                                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                                      <span>0</span>
                                      <span className="font-semibold text-red-400">{Math.abs(prop.difference).toFixed(1)} short</span>
                                      <span>Line: {prop.line}</span>
                                    </div>
                                    <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
                                      <div
                                        className="absolute left-0 top-0 h-full bg-red-500 transition-all duration-500"
                                        style={{ width: `${(prop.actualValue / prop.line) * 100}%` }}
                                      />
                                      {/* Line marker at 100% */}
                                      <div className="absolute top-0 right-0 w-0.5 h-full bg-orange-400 shadow-lg" />
                                    </div>
                                  </>
                                ) : (
                                  // Push - exact line
                                  <>
                                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                                      <span>Line: {prop.line}</span>
                                      <span className="font-semibold">Exact Push</span>
                                      <span>Actual: {prop.actualValue}</span>
                                    </div>
                                    <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
                                      <div className="absolute left-0 top-0 h-full w-full bg-slate-500 transition-all duration-500" />
                                    </div>
                                  </>
                                )}
                              </div>

                              {/* Odds */}
                              <div className="flex items-center justify-between">
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                                  hitOver && !isPush ? 'bg-green-500/20 ring-2 ring-green-500/50' : 'bg-slate-700/50'
                                }`}>
                                  <span className="text-xs text-slate-400 font-semibold">Over</span>
                                  <span className={`text-sm font-bold ${
                                    hitOver && !isPush ? 'text-green-400' : 'text-slate-300'
                                  }`}>
                                    {prop.overOdds || '-'}
                                  </span>
                                </div>
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                                  !hitOver && !isPush ? 'bg-red-500/20 ring-2 ring-red-500/50' : 'bg-slate-700/50'
                                }`}>
                                  <span className="text-xs text-slate-400 font-semibold">Under</span>
                                  <span className={`text-sm font-bold ${
                                    !hitOver && !isPush ? 'text-red-400' : 'text-slate-300'
                                  }`}>
                                    {prop.underOdds || '-'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })}
                </div>
              );
            })()
          ) : (
            <div className="text-center text-slate-400 py-12">
              <div className="text-4xl mb-4">📊</div>
              <div className="text-lg font-semibold mb-2">No Props Data Available</div>
              <div className="text-sm">Player props are typically only available for upcoming games from ESPN BET</div>
            </div>
          )}
        </div>
      )}

      {/* Shot Chart Tab */}
      {activeTab === 'shotchart' && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
          <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <span className="text-orange-500">🏀</span>
            Shot Chart
          </h3>

          {isLoadingShots ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-12 w-12 border-4 border-orange-500 border-t-transparent rounded-full"></div>
            </div>
          ) : shotData && shotData.available && shotData.shots.length > 0 ? (
            <ShotChart
              shots={shotData.shots}
              awayTeamId={game.away_team.team_id}
              homeTeamId={game.home_team.team_id}
              awayTeamName={game.away_team.team_name}
              homeTeamName={game.home_team.team_name}
              awayTeamColor={game.away_team.team_color}
              homeTeamColor={game.home_team.team_color}
            />
          ) : (
            <div className="text-center text-slate-400 py-12">
              <div className="text-4xl mb-4">🏀</div>
              <div className="text-lg font-semibold mb-2">No Shot Chart Data Available</div>
              <div className="text-sm">Shot coordinate data is only available for games with play-by-play information from ESPN</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
