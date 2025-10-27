import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import PlayerImage from '../components/PlayerImage';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

// NBA Division mappings (using ESPN API abbreviations)
const DIVISIONS: Record<string, string> = {
  // Eastern Conference - Atlantic
  'BOS': 'Atlantic', 'BKN': 'Atlantic', 'NY': 'Atlantic', 'NYK': 'Atlantic', 'PHI': 'Atlantic', 'TOR': 'Atlantic',
  // Eastern Conference - Central
  'CHI': 'Central', 'CLE': 'Central', 'DET': 'Central', 'IND': 'Central', 'MIL': 'Central',
  // Eastern Conference - Southeast
  'ATL': 'Southeast', 'CHA': 'Southeast', 'MIA': 'Southeast', 'ORL': 'Southeast', 'WAS': 'Southeast', 'WSH': 'Southeast',
  // Western Conference - Northwest
  'DEN': 'Northwest', 'MIN': 'Northwest', 'OKC': 'Northwest', 'POR': 'Northwest', 'UTA': 'Northwest', 'UTAH': 'Northwest',
  // Western Conference - Pacific
  'GSW': 'Pacific', 'GS': 'Pacific', 'LAC': 'Pacific', 'LAL': 'Pacific', 'PHX': 'Pacific', 'SAC': 'Pacific',
  // Western Conference - Southwest
  'DAL': 'Southwest', 'HOU': 'Southwest', 'MEM': 'Southwest', 'NOR': 'Southwest', 'NO': 'Southwest', 'SAS': 'Southwest', 'SA': 'Southwest'
};

type TabType = 'overview' | 'schedule' | 'roster' | 'depthchart';
type SeasonTypeFilter = 'all' | 'preseason' | 'regular-season' | 'postseason';

// Component to show game leaders with headshots in card format
const GameLeadersCard: React.FC<{ gameId: string; teamId: string }> = ({ gameId, teamId }) => {
  const { data: gameDetails, isLoading } = useQuery({
    queryKey: ['game-leaders', gameId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/games/${gameId}`);
      return data;
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    retry: false,
  });

  if (isLoading || !gameDetails) {
    return null;
  }

  const isHomeTeam = gameDetails.home_team?.team_id === teamId;
  const teamPlayersData = isHomeTeam
    ? gameDetails.home_team?.players
    : gameDetails.away_team?.players;

  const teamPlayers = [
    ...(teamPlayersData?.starters || []),
    ...(teamPlayersData?.bench || [])
  ];

  if (!teamPlayers || teamPlayers.length === 0) {
    return null;
  }

  const pointsLeader = [...teamPlayers].sort((a: any, b: any) => {
    const aPoints = parseInt(a.points) || 0;
    const bPoints = parseInt(b.points) || 0;
    return bPoints - aPoints;
  })[0];

  const assistsLeader = [...teamPlayers].sort((a: any, b: any) => {
    const aAssists = parseInt(a.assists) || 0;
    const bAssists = parseInt(b.assists) || 0;
    return bAssists - aAssists;
  })[0];

  const reboundsLeader = [...teamPlayers].sort((a: any, b: any) => {
    const aRebounds = parseInt(a.rebounds) || 0;
    const bRebounds = parseInt(b.rebounds) || 0;
    return bRebounds - aRebounds;
  })[0];

  if (!pointsLeader || !assistsLeader || !reboundsLeader) {
    return null;
  }

  return (
    <div className="px-3 py-3 space-y-3 bg-slate-900/50">
      {/* Points Leader */}
      <div className="flex items-center gap-2">
        <PlayerImage
          src={pointsLeader.athlete_headshot}
          alt={pointsLeader.player_name}
          className="w-8 h-8 rounded-full bg-slate-700 object-cover flex-shrink-0"
          fallbackInitial={pointsLeader.player_name?.charAt(0)}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-slate-500 uppercase font-bold">PTS</div>
          <div className="text-xs text-slate-300 truncate">{pointsLeader.player_name?.split(' ').pop()}</div>
        </div>
        <div className="text-lg font-black text-orange-400">{pointsLeader.points}</div>
      </div>

      {/* Rebounds Leader */}
      <div className="flex items-center gap-2">
        <PlayerImage
          src={reboundsLeader.athlete_headshot}
          alt={reboundsLeader.player_name}
          className="w-8 h-8 rounded-full bg-slate-700 object-cover flex-shrink-0"
          fallbackInitial={reboundsLeader.player_name?.charAt(0)}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-slate-500 uppercase font-bold">REB</div>
          <div className="text-xs text-slate-300 truncate">{reboundsLeader.player_name?.split(' ').pop()}</div>
        </div>
        <div className="text-lg font-black text-purple-400">{reboundsLeader.rebounds}</div>
      </div>

      {/* Assists Leader */}
      <div className="flex items-center gap-2">
        <PlayerImage
          src={assistsLeader.athlete_headshot}
          alt={assistsLeader.player_name}
          className="w-8 h-8 rounded-full bg-slate-700 object-cover flex-shrink-0"
          fallbackInitial={assistsLeader.player_name?.charAt(0)}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-slate-500 uppercase font-bold">AST</div>
          <div className="text-xs text-slate-300 truncate">{assistsLeader.player_name?.split(' ').pop()}</div>
        </div>
        <div className="text-lg font-black text-blue-400">{assistsLeader.assists}</div>
      </div>
    </div>
  );
};

// Component to show game leaders for a specific game (inline version)
const GameLeaders: React.FC<{ gameId: string; teamId: string }> = ({ gameId, teamId }) => {
  const { data: gameDetails, isLoading } = useQuery({
    queryKey: ['game-leaders', gameId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/games/${gameId}`);
      return data;
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    retry: false, // Don't retry on error
  });

  if (isLoading || !gameDetails) {
    return null;
  }

  const isHomeTeam = gameDetails.home_team?.team_id === teamId;

  // Players are nested under home_team.players and away_team.players
  const teamPlayersData = isHomeTeam
    ? gameDetails.home_team?.players
    : gameDetails.away_team?.players;

  // Combine starters and bench
  const teamPlayers = [
    ...(teamPlayersData?.starters || []),
    ...(teamPlayersData?.bench || [])
  ];

  if (!teamPlayers || teamPlayers.length === 0) {
    return null; // Silently fail for games without player data
  }

  // Find leaders
  const pointsLeader = [...teamPlayers].sort((a: any, b: any) => {
    const aPoints = parseInt(a.points) || 0;
    const bPoints = parseInt(b.points) || 0;
    return bPoints - aPoints;
  })[0];

  const assistsLeader = [...teamPlayers].sort((a: any, b: any) => {
    const aAssists = parseInt(a.assists) || 0;
    const bAssists = parseInt(b.assists) || 0;
    return bAssists - aAssists;
  })[0];

  const reboundsLeader = [...teamPlayers].sort((a: any, b: any) => {
    const aRebounds = parseInt(a.rebounds) || 0;
    const bRebounds = parseInt(b.rebounds) || 0;
    return bRebounds - aRebounds;
  })[0];

  if (!pointsLeader || !assistsLeader || !reboundsLeader) {
    return null;
  }

  return (
    <div className="mt-2 pt-2 border-t border-slate-700/50 flex gap-4 text-xs flex-wrap">
      <div className="flex items-center gap-1">
        <span className="text-slate-500">PTS:</span>
        <span className="font-bold text-orange-400">{pointsLeader.player_name?.split(' ').pop() || pointsLeader.player_name}</span>
        <span className="text-slate-400">{pointsLeader.points}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-500">REB:</span>
        <span className="font-bold text-purple-400">{reboundsLeader.player_name?.split(' ').pop() || reboundsLeader.player_name}</span>
        <span className="text-slate-400">{reboundsLeader.rebounds}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-500">AST:</span>
        <span className="font-bold text-blue-400">{assistsLeader.player_name?.split(' ').pop() || assistsLeader.player_name}</span>
        <span className="text-slate-400">{assistsLeader.assists}</span>
      </div>
    </div>
  );
};

// Available NBA seasons
const NBA_SEASONS = ['2026', '2025', '2024', '2023', '2022', '2021', '2020'];

export default function TeamPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();

  // Get tab from URL params
  const [searchParams, setSearchParams] = React.useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search);
    }
    return new URLSearchParams();
  });

  const tabFromUrl = (searchParams.get('tab') as TabType) || 'overview';
  const [activeTab, setActiveTab] = useState<TabType>(tabFromUrl);
  const [selectedSeason, setSelectedSeason] = useState<string>('2026');
  const [seasonTypeFilter, setSeasonTypeFilter] = useState<SeasonTypeFilter>('all');
  const [opponentSearch, setOpponentSearch] = useState<string>('');
  const mostRecentGameRef = useRef<HTMLDivElement>(null);
  const allGamesContainerRef = useRef<HTMLDivElement>(null);

  // Update URL when tab changes
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const newParams = new URLSearchParams(window.location.search);
    newParams.set('tab', tab);
    window.history.pushState({}, '', `${window.location.pathname}?${newParams.toString()}`);
  };

  // Fetch team info
  const { data: teamInfo, isLoading: isLoadingInfo } = useQuery({
    queryKey: ['team-info', teamId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/teams/live/${teamId}`);
      return data;
    },
    enabled: !!teamId,
  });

  // Fetch team roster
  const { data: roster, isLoading: isLoadingRoster } = useQuery({
    queryKey: ['team-roster', teamId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/teams/live/${teamId}/roster`);
      return data;
    },
    enabled: !!teamId,
  });

  // Fetch team schedule (filtered by season in Schedule tab)
  const { data: schedule, isLoading: isLoadingSchedule } = useQuery({
    queryKey: ['team-schedule', teamId, activeTab === 'schedule' ? selectedSeason : '2026'],
    queryFn: async () => {
      const season = activeTab === 'schedule' ? selectedSeason : '2026';
      const { data} = await axios.get(`${API_BASE_URL}/teams/live/${teamId}/schedule?season=${season}`);
      return data;
    },
    enabled: !!teamId,
  });

  // Fetch standings
  const { data: standings, isLoading: isLoadingStandings } = useQuery({
    queryKey: ['standings'],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/teams/live/standings`);
      return data;
    },
  });

  // Fetch injuries
  const { data: injuries, isLoading: isLoadingInjuries } = useQuery({
    queryKey: ['team-injuries', teamId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/teams/live/${teamId}/injuries`);
      return data;
    },
    enabled: !!teamId,
  });

  // Fetch odds for upcoming games (only in schedule tab)
  const { data: odds } = useQuery({
    queryKey: ['team-odds', teamId, selectedSeason],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/teams/live/${teamId}/schedule/odds?season=${selectedSeason}`);
      return data;
    },
    enabled: !!teamId && activeTab === 'schedule',
  });

  // Fetch depth chart
  const { data: depthChart, isLoading: isLoadingDepthChart } = useQuery({
    queryKey: ['team-depthchart', teamId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/teams/live/${teamId}/depthchart`);
      return data;
    },
    enabled: !!teamId && activeTab === 'depthchart',
  });

  // Fetch most recent game details for leaders
  const mostRecentGameId = schedule?.completed_games?.[0]?.game_id;
  const { data: recentGameDetails } = useQuery({
    queryKey: ['game-details', mostRecentGameId],
    queryFn: async () => {
      if (!mostRecentGameId) return null;
      const { data } = await axios.get(`${API_BASE_URL}/games/${mostRecentGameId}`);
      return data;
    },
    enabled: !!mostRecentGameId && activeTab === 'schedule',
  });

  // Auto-scroll to most recent completed game when schedule loads
  useEffect(() => {
    if (activeTab !== 'schedule' || !schedule) {
      return;
    }

    // Wait for DOM to be ready and elements to mount
    const scrollToRecent = () => {
      const container = allGamesContainerRef.current;
      const element = mostRecentGameRef.current;

      if (container && element) {
        // Calculate the position to scroll to within the container
        const containerTop = container.offsetTop;
        const elementTop = element.offsetTop;
        const offset = elementTop - containerTop - 100; // 100px offset from top

        // Scroll the container directly without affecting page scroll
        container.scrollTop = offset;
      } else {
        // If refs aren't ready yet, try again after a short delay
        setTimeout(scrollToRecent, 100);
      }
    };

    // Initial delay to ensure DOM and game leaders are fully rendered
    const timer = setTimeout(scrollToRecent, 300);

    return () => clearTimeout(timer);
  }, [schedule, activeTab]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  // Get division standings for this team
  const getDivisionStandings = () => {
    if (!teamInfo || !standings) return [];

    const allTeams = [
      ...(standings?.eastern_conference || []).map((t: any) => ({
        ...t,
        division: DIVISIONS[t.team_abbreviation] || 'Unknown'
      })),
      ...(standings?.western_conference || []).map((t: any) => ({
        ...t,
        division: DIVISIONS[t.team_abbreviation] || 'Unknown'
      }))
    ];

    const currentTeamAbbr = teamInfo.team_abbreviation;
    const currentTeamDivision = DIVISIONS[currentTeamAbbr];

    return allTeams
      .filter(t => t.division === currentTeamDivision)
      .sort((a, b) => (a.rank || 999) - (b.rank || 999));
  };

  const divisionStandings = getDivisionStandings();
  const currentTeamDivision = teamInfo?.team_abbreviation ? DIVISIONS[teamInfo.team_abbreviation] : '';
  const currentTeamData = divisionStandings.find(t => t.team_id === teamId);

  if (isLoadingInfo || isLoadingRoster || isLoadingSchedule || isLoadingStandings || isLoadingInjuries) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-16 w-16 border-4 border-orange-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate('/teams')}
        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-white transition-colors"
      >
        ← Back to Standings
      </button>

      {/* Enhanced Team Hero Section */}
      {teamInfo && (
        <div
          className="rounded-xl overflow-hidden shadow-2xl border-2"
          style={{
            background: `linear-gradient(135deg, #${teamInfo.team_color}20 0%, #${teamInfo.team_color}05 100%)`,
            borderColor: `#${teamInfo.team_color}`
          }}
        >
          <div className="p-8">
            <div className="flex items-center gap-8 mb-6">
              {/* Team Logo */}
              {teamInfo.team_logo && (
                <img
                  src={teamInfo.team_logo}
                  alt={teamInfo.team_name}
                  className="w-32 h-32 object-contain"
                />
              )}

              {/* Team Info */}
              <div className="flex-1">
                <h1 className="text-5xl font-black mb-2" style={{ color: `#${teamInfo.team_color}` }}>
                  {teamInfo.team_name}
                </h1>
                <div className="flex items-center gap-4 mb-3 flex-wrap">
                  <div className="text-3xl font-black text-white">
                    {teamInfo.record?.wins}-{teamInfo.record?.losses}
                  </div>
                  <div className="text-lg text-slate-400">
                    {teamInfo.standing_summary}
                  </div>
                  {currentTeamData?.streak && (
                    <div className={`px-3 py-1 rounded-full text-sm font-bold ${
                      currentTeamData?.streak?.startsWith('W')
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      Current Streak: {currentTeamData?.streak}
                    </div>
                  )}
                </div>

                {/* Stats Bar */}
                {currentTeamData && (
                  <div className="flex items-center gap-6 mb-4 flex-wrap">
                    {currentTeamData?.points_per_game && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 uppercase font-bold">PPG</span>
                        <span className="text-lg font-bold text-green-400">
                          {currentTeamData?.points_per_game}
                        </span>
                      </div>
                    )}
                    {currentTeamData?.opp_points_per_game && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 uppercase font-bold">OPP PPG</span>
                        <span className="text-lg font-bold text-red-400">
                          {currentTeamData?.opp_points_per_game}
                        </span>
                      </div>
                    )}
                    {currentTeamData?.point_diff && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 uppercase font-bold">DIFF</span>
                        <span className={`text-lg font-bold ${
                          parseFloat(currentTeamData?.point_diff || '0') >= 0
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}>
                          {currentTeamData?.point_diff}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Venue */}
                {teamInfo.venue?.name && (
                  <div className="text-sm text-slate-400">
                    🏟️ {teamInfo.venue.name}
                    {teamInfo.venue.city && ` • ${teamInfo.venue.city}`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => handleTabChange('overview')}
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
            onClick={() => handleTabChange('schedule')}
            className={`flex-1 px-6 py-4 font-bold transition-all ${
              activeTab === 'schedule'
                ? 'bg-orange-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <span className="text-xl mr-2">📅</span>
            Schedule
          </button>
          <button
            onClick={() => handleTabChange('roster')}
            className={`flex-1 px-6 py-4 font-bold transition-all ${
              activeTab === 'roster'
                ? 'bg-orange-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <span className="text-xl mr-2">👥</span>
            Roster
          </button>
          <button
            onClick={() => handleTabChange('depthchart')}
            className={`flex-1 px-6 py-4 font-bold transition-all ${
              activeTab === 'depthchart'
                ? 'bg-orange-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <span className="text-xl mr-2">📋</span>
            Depth Chart
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Column (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Next Game */}
          {teamInfo?.next_game && (
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                🏀 Next Game
              </h2>
              <div className="bg-slate-700/30 rounded-lg p-6">
                <div className="text-xl font-bold mb-3">{teamInfo.next_game.name}</div>
                <div className="text-lg text-slate-300 mb-4">
                  {new Date(teamInfo.next_game.date).toLocaleString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </div>
                {teamInfo.next_game.venue && (
                  <div className="text-sm text-slate-400">📍 {teamInfo.next_game.venue}</div>
                )}
              </div>
            </div>
          )}

          {/* Team Leaders */}
          {teamInfo?.leaders && teamInfo.leaders.length > 0 && (
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                ⭐ Team Leaders
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {teamInfo.leaders.map((leader: any, index: number) => (
                  <div
                    key={index}
                    className="bg-slate-700/30 rounded-lg p-4 flex flex-col items-center gap-3 hover:scale-105 transition-transform cursor-pointer"
                    onClick={() => navigate(`/player/${leader.athlete_id}`)}
                  >
                    <div className="flex-shrink-0">
                      <PlayerImage
                        src={leader.athlete_headshot}
                        alt={leader.athlete_name}
                        className="w-20 h-20 rounded-full bg-slate-700 object-cover ring-2 ring-orange-500"
                        fallbackInitial={leader.athlete_name.charAt(0)}
                      />
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-slate-500 uppercase font-bold mb-1">{leader.category}</div>
                      <div className="font-bold text-orange-400 hover:text-orange-300 transition-colors mb-1">
                        {leader.athlete_name}
                      </div>
                      <div className="text-xs text-slate-500 mb-2">{leader.position}</div>
                      <div className="text-3xl font-black text-orange-400">{leader.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Form */}
          {schedule?.completed_games && schedule.completed_games.length > 0 && (
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                📊 Recent Form
              </h2>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-slate-400">Last 10:</span>
                {schedule.completed_games.slice(0, 10).map((game: any, idx: number) => {
                  const isHome = game.home_team?.id === teamId;
                  const won = isHome ? game.home_team?.winner : game.away_team?.winner;
                  return (
                    <div
                      key={idx}
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                        won
                          ? 'bg-green-500/20 text-green-400 border-2 border-green-500'
                          : 'bg-red-500/20 text-red-400 border-2 border-red-500'
                      }`}
                      title={game.name}
                    >
                      {won ? 'W' : 'L'}
                    </div>
                  );
                })}
                <span className="text-slate-400 ml-2">
                  ({schedule.completed_games.slice(0, 10).filter((g: any) => {
                    const isHome = g.home_team?.id === teamId;
                    return isHome ? g.home_team?.winner : g.away_team?.winner;
                  }).length}-{10 - schedule.completed_games.slice(0, 10).filter((g: any) => {
                    const isHome = g.home_team?.id === teamId;
                    return isHome ? g.home_team?.winner : g.away_team?.winner;
                  }).length})
                </span>
              </div>
            </div>
          )}

          {/* Recent Games */}
          {schedule?.completed_games && schedule.completed_games.length > 0 && (
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                🎯 Recent Games
              </h2>
              <div className="space-y-3">
                {schedule.completed_games.slice(0, 5).map((game: any) => {
                  const isHome = game.home_team?.id === teamId;
                  const opponent = isHome ? game.away_team : game.home_team;
                  const teamScoreObj = isHome ? game.home_team?.score : game.away_team?.score;
                  const opponentScoreObj = isHome ? game.away_team?.score : game.home_team?.score;
                  const teamScore = teamScoreObj?.displayValue || teamScoreObj?.value || teamScoreObj;
                  const opponentScore = opponentScoreObj?.displayValue || opponentScoreObj?.value || opponentScoreObj;
                  const won = isHome ? game.home_team?.winner : game.away_team?.winner;

                  return (
                    <div
                      key={game.game_id}
                      onClick={() => navigate(`/game/${game.game_id}`)}
                      className={`flex items-center justify-between p-4 rounded-lg cursor-pointer hover:scale-[1.02] transition-all ${
                        won
                          ? 'bg-green-500/10 border-l-4 border-l-green-500'
                          : 'bg-red-500/10 border-l-4 border-l-red-500'
                      }`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="text-xs text-slate-500 font-bold w-16">{formatDate(game.date)}</div>
                        <div className="flex items-center gap-2">
                          {opponent?.logo && (
                            <img src={opponent.logo} alt={opponent.name} className="w-8 h-8 object-contain" />
                          )}
                          <div>
                            <div className="font-semibold">
                              {isHome ? 'vs' : '@'} {opponent?.abbreviation}
                            </div>
                            {opponent?.record && typeof opponent.record === 'string' && (
                              <div className="text-xs text-slate-500">{opponent.record}</div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className={`text-2xl font-black ${won ? 'text-green-400' : 'text-red-400'}`}>
                          {teamScore} - {opponentScore}
                        </div>
                        <div
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            won ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {won ? 'W' : 'L'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar (1/3 width) */}
        <div className="space-y-6">
          {/* Injury Report */}
          {injuries && injuries.injuries && injuries.injuries.length > 0 && (
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                🏥 Injury Report
              </h2>
              <div className="space-y-3">
                {injuries.injuries.map((injury: any, index: number) => (
                  <div
                    key={index}
                    className="p-3 rounded-lg bg-slate-700/30 border-l-4 border-l-red-500"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <PlayerImage
                        src={injury.athlete_headshot}
                        alt={injury.athlete_name}
                        className="w-10 h-10 rounded-full bg-slate-700 object-cover"
                        fallbackInitial={injury.athlete_name.charAt(0)}
                      />
                      <div className="flex-1">
                        <div className="font-bold text-white">{injury.athlete_name}</div>
                        <div className="text-xs text-slate-400">
                          {typeof injury.position === 'string' ? injury.position : injury.position?.abbreviation || injury.position?.name || ''}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {injury.injury_status && (
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400">
                            {injury.injury_status}
                          </span>
                          {injury.injury_type && (
                            <span className="text-xs text-slate-400">
                              {typeof injury.injury_type === 'string' ? injury.injury_type : injury.injury_type?.name || injury.injury_type?.description || ''}
                            </span>
                          )}
                        </div>
                      )}
                      {injury.detail && (
                        <div className="text-xs text-slate-400 mt-2">{injury.detail}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Division Standings - Card Grid */}
          {divisionStandings.length > 0 && (
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
              <h2 className="text-xl font-bold mb-4">{currentTeamDivision} Division</h2>
              <div className="space-y-3">
                {divisionStandings.map((team) => {
                  const isCurrentTeam = team.team_id === teamId;
                  const isTopSeed = team.rank <= 6;
                  const isPlayIn = team.rank > 6 && team.rank <= 10;

                  return (
                    <div
                      key={team.team_id}
                      onClick={() => navigate(`/team/${team.team_id}`)}
                      className={`p-4 rounded-lg cursor-pointer transition-all hover:scale-105 ${
                        isCurrentTeam
                          ? 'bg-orange-500/20 border-2 border-orange-500 shadow-lg shadow-orange-500/20'
                          : 'bg-slate-700/30 hover:bg-slate-700/50'
                      } ${
                        isTopSeed ? 'border-l-4 border-l-green-500' : ''
                      } ${
                        isPlayIn ? 'border-l-4 border-l-yellow-500' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="text-xs font-bold text-slate-500">#{team.rank}</div>
                        {team.team_logo && (
                          <img
                            src={team.team_logo}
                            alt={team.team_abbreviation}
                            className="w-8 h-8 object-contain"
                          />
                        )}
                        <div className={`font-bold ${isCurrentTeam ? 'text-orange-400' : 'text-white'}`}>
                          {team.team_abbreviation}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-lg font-bold">
                            <span className="text-green-400">{team.wins}</span>
                            <span className="text-slate-600 mx-1">-</span>
                            <span className="text-red-400">{team.losses}</span>
                          </div>
                          <div className="text-xs text-slate-400">{team.win_pct}</div>
                        </div>
                        <div className={`px-2 py-1 rounded text-xs font-bold ${
                          team.streak?.startsWith('W')
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {team.streak}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-4 pt-4 border-t border-slate-700 space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded"></div>
                  <span className="text-slate-400">Playoff (1-6)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                  <span className="text-slate-400">Play-In (7-10)</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Schedule Tab */}
      {activeTab === 'schedule' && (
        <div className="space-y-6">
          {/* Season Filter */}
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-xl">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-slate-400 font-semibold">Season:</span>
              {NBA_SEASONS.map((season) => (
                <button
                  key={season}
                  onClick={() => setSelectedSeason(season)}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                    selectedSeason === season
                      ? 'bg-orange-500 text-white shadow-lg'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {season}-{(parseInt(season) + 1).toString().slice(-2)}
                </button>
              ))}
            </div>
          </div>

          {/* Top Section - Next Game and Last Game Leaders */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Next Game Hero Card */}
            <div>
          {schedule?.upcoming_games && schedule.upcoming_games.length > 0 && (() => {
            const nextGame = schedule.upcoming_games[0];
            const isHome = nextGame.home_team?.id === teamId;
            const opponent = isHome ? nextGame.away_team : nextGame.home_team;
            const gameDate = new Date(nextGame.date);
            const now = new Date();
            const daysUntil = Math.ceil((gameDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            // Look up opponent logo from standings data
            const allTeamsInStandings = [
              ...(standings?.eastern_conference || []),
              ...(standings?.western_conference || [])
            ];
            const opponentTeamData = allTeamsInStandings.find(t => t.team_id === opponent?.id);
            const opponentLogo = opponentTeamData?.team_logo || opponent?.logo;

            return (
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 border-2 border-orange-500/50 shadow-2xl">
                <div className="text-center mb-4">
                  <h3 className="text-sm font-bold text-orange-400 uppercase tracking-wider mb-1">Next Game</h3>
                  <p className="text-slate-400 text-sm">
                    {gameDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} • {gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                  {daysUntil >= 0 && (
                    <p className="text-xs text-slate-500 mt-1">
                      {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-center gap-8 mb-6">
                  {/* Team Logo */}
                  <div className="flex flex-col items-center">
                    {teamInfo?.team_logo && (
                      <img src={teamInfo.team_logo} alt={teamInfo.team_name} className="w-24 h-24 object-contain mb-2" />
                    )}
                    <p className="font-bold text-white text-lg">{teamInfo?.team_abbreviation}</p>
                    <p className="text-slate-400 text-sm">{teamInfo?.record?.summary}</p>
                    {isHome && (
                      <p className="text-xs text-green-400 font-bold mt-1">HOME</p>
                    )}
                  </div>

                  <div className="text-4xl font-black text-slate-600">{isHome ? 'vs' : '@'}</div>

                  {/* Opponent Logo */}
                  <div className="flex flex-col items-center">
                    {opponentLogo ? (
                      <img src={opponentLogo} alt={opponent?.name} className="w-24 h-24 object-contain mb-2" />
                    ) : (
                      <div className="w-24 h-24 bg-slate-700 rounded-full flex items-center justify-center mb-2">
                        <span className="text-3xl font-black text-slate-500">{opponent?.abbreviation?.[0]}</span>
                      </div>
                    )}
                    <p className="font-bold text-white text-lg">{opponent?.abbreviation}</p>
                    {opponent?.record && typeof opponent.record === 'string' && (
                      <p className="text-slate-400 text-sm">{opponent.record}</p>
                    )}
                    {!isHome && (
                      <p className="text-xs text-green-400 font-bold mt-1">HOME</p>
                    )}
                  </div>
                </div>

                <div className="text-center space-y-2">
                  {nextGame.venue && (
                    <p className="text-slate-400 text-sm">
                      <span className="text-slate-500">📍</span> {nextGame.venue}
                    </p>
                  )}
                  {nextGame.broadcast && nextGame.broadcast.length > 0 && (
                    <p className="text-slate-400 text-sm">
                      <span className="text-slate-500">📺</span> {nextGame.broadcast.flat().join(', ')}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
            </div>

            {/* Game Leaders from Most Recent Game */}
            <div>
          {schedule?.completed_games && schedule.completed_games.length > 0 && recentGameDetails && (() => {
            const mostRecentGame = schedule.completed_games[0];
            const isHome = mostRecentGame.home_team?.id === teamId;
            const opponent = isHome ? mostRecentGame.away_team : mostRecentGame.home_team;
            const won = isHome ? mostRecentGame.home_team?.winner : mostRecentGame.away_team?.winner;

            // Get team's player stats
            const teamPlayers = isHome ? recentGameDetails.home_team_players : recentGameDetails.away_team_players;

            if (!teamPlayers || teamPlayers.length === 0) {
              return null;
            }

            // Find leaders
            const pointsLeader = [...teamPlayers].sort((a, b) => (b.points || 0) - (a.points || 0))[0];
            const assistsLeader = [...teamPlayers].sort((a, b) => (b.assists || 0) - (a.assists || 0))[0];
            const reboundsLeader = [...teamPlayers].sort((a, b) => (b.totalRebounds || 0) - (a.totalRebounds || 0))[0];

            return (
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    ⭐ Last Game Leaders
                  </h3>
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                    won ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {won ? 'W' : 'L'}
                  </span>
                </div>
                <div className="text-sm text-slate-400 mb-4">
                  {isHome ? 'vs' : '@'} {opponent?.abbreviation} • {formatDate(mostRecentGame.date)}
                </div>

                <div className="space-y-4">
                  {/* Points Leader */}
                  <div
                    className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/player/${pointsLeader.player_id}`)}
                  >
                    <PlayerImage
                      src={pointsLeader.player_headshot}
                      alt={pointsLeader.player_name}
                      className="w-12 h-12 rounded-full bg-slate-700 object-cover"
                      fallbackInitial={pointsLeader.player_name?.charAt(0)}
                    />
                    <div className="flex-1">
                      <div className="text-xs text-slate-500 uppercase font-bold">Points</div>
                      <div className="font-bold text-white">{pointsLeader.player_name}</div>
                    </div>
                    <div className="text-2xl font-black text-orange-400">{pointsLeader.points}</div>
                  </div>

                  {/* Assists Leader */}
                  <div
                    className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/player/${assistsLeader.player_id}`)}
                  >
                    <PlayerImage
                      src={assistsLeader.player_headshot}
                      alt={assistsLeader.player_name}
                      className="w-12 h-12 rounded-full bg-slate-700 object-cover"
                      fallbackInitial={assistsLeader.player_name?.charAt(0)}
                    />
                    <div className="flex-1">
                      <div className="text-xs text-slate-500 uppercase font-bold">Assists</div>
                      <div className="font-bold text-white">{assistsLeader.player_name}</div>
                    </div>
                    <div className="text-2xl font-black text-blue-400">{assistsLeader.assists}</div>
                  </div>

                  {/* Rebounds Leader */}
                  <div
                    className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/player/${reboundsLeader.player_id}`)}
                  >
                    <PlayerImage
                      src={reboundsLeader.player_headshot}
                      alt={reboundsLeader.player_name}
                      className="w-12 h-12 rounded-full bg-slate-700 object-cover"
                      fallbackInitial={reboundsLeader.player_name?.charAt(0)}
                    />
                    <div className="flex-1">
                      <div className="text-xs text-slate-500 uppercase font-bold">Rebounds</div>
                      <div className="font-bold text-white">{reboundsLeader.player_name}</div>
                    </div>
                    <div className="text-2xl font-black text-purple-400">{reboundsLeader.totalRebounds}</div>
                  </div>
                </div>

                <button
                  onClick={() => navigate(`/game/${mostRecentGame.game_id}`)}
                  className="w-full mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-semibold text-white transition-colors"
                >
                  View Full Box Score →
                </button>
              </div>
            );
          })()}
            </div>
          </div>

          {/* Filters and Controls - Full Width */}
          {schedule?.all_games && schedule.all_games.length > 0 && (
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-xl">
              <div className="space-y-4">
                {/* Season Type Filter Pills */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-400 font-semibold text-xs">Filter:</span>
                  {[
                    { type: 'all' as SeasonTypeFilter, label: 'All', count: schedule.all_games.length },
                    { type: 'preseason' as SeasonTypeFilter, label: 'Preseason', count: schedule.all_games.filter((g: any) => g.season_type?.includes('pre')).length },
                    { type: 'regular-season' as SeasonTypeFilter, label: 'Regular', count: schedule.all_games.filter((g: any) => g.season_type?.includes('regular')).length },
                    { type: 'postseason' as SeasonTypeFilter, label: 'Postseason', count: schedule.all_games.filter((g: any) => g.season_type?.includes('post')).length },
                  ].map((filter) => (
                    <button
                      key={filter.type}
                      onClick={() => setSeasonTypeFilter(filter.type)}
                      className={`px-2 py-1 rounded-lg font-semibold text-xs transition-all ${
                        seasonTypeFilter === filter.type
                          ? 'bg-orange-500 text-white shadow-lg'
                          : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {filter.label} ({filter.count})
                    </button>
                  ))}
                </div>

                {/* Search Bar */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search opponent..."
                    value={opponentSearch}
                    onChange={(e) => setOpponentSearch(e.target.value)}
                    className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  {opponentSearch && (
                    <button
                      onClick={() => setOpponentSearch('')}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-slate-300 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Season Summary and Last 10 Games - Side by Side */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Summary Stats Card */}
          {schedule?.all_games && schedule.all_games.length > 0 && (() => {
            // Apply filters to get the current view - ONLY show games with actual scores
            let filteredGames = schedule.all_games.filter((g: any) => {
              const homeScore = g.home_team?.score?.value || g.home_team?.score;
              const awayScore = g.away_team?.score?.value || g.away_team?.score;
              // Only include games where both teams have scores and at least one team scored
              return homeScore != null && awayScore != null &&
                     (parseFloat(homeScore) > 0 || parseFloat(awayScore) > 0);
            });

            // Apply season type filter
            if (seasonTypeFilter !== 'all') {
              filteredGames = filteredGames.filter((g: any) => {
                const gameSeasonType = g.season_type || '';
                return gameSeasonType === seasonTypeFilter || gameSeasonType.includes(seasonTypeFilter);
              });
            }

            // Apply opponent search
            if (opponentSearch) {
              filteredGames = filteredGames.filter((game: any) => {
                const isHome = game.home_team?.id === teamId;
                const opponent = isHome ? game.away_team : game.home_team;
                return opponent?.name?.toLowerCase().includes(opponentSearch.toLowerCase()) ||
                       opponent?.abbreviation?.toLowerCase().includes(opponentSearch.toLowerCase());
              });
            }

            const completedGames = filteredGames;

            const wins = completedGames.filter((g: any) => {
              const isHome = g.home_team?.id === teamId;
              return isHome ? g.home_team?.winner : g.away_team?.winner;
            }).length;
            const losses = completedGames.length - wins;

            const homeGames = completedGames.filter((g: any) => g.home_team?.id === teamId);
            const homeWins = homeGames.filter((g: any) => g.home_team?.winner).length;
            const homeLosses = homeGames.length - homeWins;

            const awayGames = completedGames.filter((g: any) => g.away_team?.id === teamId);
            const awayWins = awayGames.filter((g: any) => g.away_team?.winner).length;
            const awayLosses = awayGames.length - awayWins;

            const totalPoints = completedGames.reduce((sum: number, g: any) => {
              const isHome = g.home_team?.id === teamId;
              const score = isHome ? g.home_team?.score : g.away_team?.score;
              return sum + (parseFloat(score?.value || score?.displayValue || score || 0));
            }, 0);

            const totalOppPoints = completedGames.reduce((sum: number, g: any) => {
              const isHome = g.home_team?.id === teamId;
              const score = isHome ? g.away_team?.score : g.home_team?.score;
              return sum + (parseFloat(score?.value || score?.displayValue || score || 0));
            }, 0);

            const avgPoints = completedGames.length > 0 ? (totalPoints / completedGames.length).toFixed(1) : '0.0';
            const avgOppPoints = completedGames.length > 0 ? (totalOppPoints / completedGames.length).toFixed(1) : '0.0';
            const pointDiff = completedGames.length > 0 ? ((totalPoints - totalOppPoints) / completedGames.length).toFixed(1) : '0.0';

            return (
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
                <h3 className="text-lg font-bold mb-4 text-orange-400">Season Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-700/30 rounded-lg p-3">
                    <div className="text-xs text-slate-400 uppercase font-bold mb-1">Overall</div>
                    <div className="text-2xl font-black">
                      <span className="text-green-400">{wins}</span>
                      <span className="text-slate-600 mx-1">-</span>
                      <span className="text-red-400">{losses}</span>
                    </div>
                  </div>
                  <div className="bg-slate-700/30 rounded-lg p-3">
                    <div className="text-xs text-slate-400 uppercase font-bold mb-1">Home</div>
                    <div className="text-2xl font-black">
                      <span className="text-green-400">{homeWins}</span>
                      <span className="text-slate-600 mx-1">-</span>
                      <span className="text-red-400">{homeLosses}</span>
                    </div>
                  </div>
                  <div className="bg-slate-700/30 rounded-lg p-3">
                    <div className="text-xs text-slate-400 uppercase font-bold mb-1">Away</div>
                    <div className="text-2xl font-black">
                      <span className="text-green-400">{awayWins}</span>
                      <span className="text-slate-600 mx-1">-</span>
                      <span className="text-red-400">{awayLosses}</span>
                    </div>
                  </div>
                  <div className="bg-slate-700/30 rounded-lg p-3">
                    <div className="text-xs text-slate-400 uppercase font-bold mb-1">Avg +/-</div>
                    <div className={`text-2xl font-black ${parseFloat(pointDiff) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {parseFloat(pointDiff) >= 0 ? '+' : ''}{pointDiff}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{avgPoints} - {avgOppPoints}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Last 10 Games Visualization */}
          {schedule?.completed_games && schedule.completed_games.length > 0 && (
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
              <h4 className="text-lg font-bold text-slate-400 uppercase tracking-wider mb-4">Last 10 Games</h4>
              <div className="flex gap-2 justify-center">
                {schedule.completed_games.slice(0, 10).map((game: any, idx: number) => {
                  const isHome = game.home_team?.id === teamId;
                  const won = isHome ? game.home_team?.winner : game.away_team?.winner;
                  return (
                    <div
                      key={game.game_id}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all hover:scale-110 cursor-pointer ${
                        won ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                      }`}
                      title={`${won ? 'W' : 'L'} vs ${isHome ? game.away_team?.abbreviation : game.home_team?.abbreviation}`}
                    >
                      {won ? 'W' : 'L'}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </div>

          {/* All Games - Full Width Grid */}
          {schedule?.all_games && schedule.all_games.length > 0 && (
            <div className="space-y-6">
              <div className="bg-slate-800 rounded-xl px-4 py-3 border border-slate-700">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  📅 All Games
                </h3>
              </div>
              <div ref={allGamesContainerRef} className="max-h-[1000px] overflow-y-auto pr-2 space-y-6">
                    {(() => {
                      // Show ALL games (completed and upcoming)
                      let filteredGames = schedule.all_games;

                      // Apply season type filter
                      if (seasonTypeFilter !== 'all') {
                        filteredGames = filteredGames.filter((g: any) => {
                          const gameSeasonType = g.season_type || '';
                          return gameSeasonType === seasonTypeFilter || gameSeasonType.includes(seasonTypeFilter);
                        });
                      }

                      // Apply opponent search
                      if (opponentSearch) {
                        filteredGames = filteredGames.filter((game: any) => {
                          const isHome = game.home_team?.id === teamId;
                          const opponent = isHome ? game.away_team : game.home_team;
                          return opponent?.name?.toLowerCase().includes(opponentSearch.toLowerCase()) ||
                                 opponent?.abbreviation?.toLowerCase().includes(opponentSearch.toLowerCase());
                        });
                      }

                      // Group games by month
                      const gamesByMonth: Record<string, any[]> = {};
                      filteredGames.forEach((game: any) => {
                        const date = new Date(game.date);
                        const monthKey = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
                        if (!gamesByMonth[monthKey]) {
                          gamesByMonth[monthKey] = [];
                        }
                        gamesByMonth[monthKey].push(game);
                      });

                      // Find the most recent completed game (first one with scores when sorted by date desc)
                      let mostRecentCompletedGameId: string | null = null;
                      for (const game of filteredGames) {
                        const homeScore = game.home_team?.score?.value || game.home_team?.score;
                        const awayScore = game.away_team?.score?.value || game.away_team?.score;
                        const hasScore = homeScore != null && awayScore != null && (parseFloat(homeScore) > 0 || parseFloat(awayScore) > 0);
                        if (hasScore) {
                          mostRecentCompletedGameId = game.game_id;
                          break;
                        }
                      }

                      return Object.entries(gamesByMonth).map(([month, games]) => (
                        <div key={`month-${month}`} className="space-y-4">
                          {/* Month Divider */}
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-orange-400 uppercase tracking-wider">{month}</h4>
                            <div className="flex-1 h-px bg-slate-700"></div>
                          </div>

                          {/* Games for this month as rows */}
                          <div className="space-y-3">
                          {games.map((game: any) => {
                            const isHome = game.home_team?.id === teamId;
                            const opponent = isHome ? game.away_team : game.home_team;
                            const teamScoreObj = isHome ? game.home_team?.score : game.away_team?.score;
                            const opponentScoreObj = isHome ? game.away_team?.score : game.home_team?.score;
                            const teamScore = teamScoreObj?.displayValue || teamScoreObj?.value || teamScoreObj;
                            const opponentScore = opponentScoreObj?.displayValue || opponentScoreObj?.value || opponentScoreObj;
                            const won = isHome ? game.home_team?.winner : game.away_team?.winner;

                            // Get season type
                            const seasonType = game.season_type || game.seasonType || 'Regular Season';
                            const seasonTypeDisplay = seasonType.replace('-', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());

                            // Calculate point differential
                            const teamScoreNum = parseFloat(teamScore) || 0;
                            const opponentScoreNum = parseFloat(opponentScore) || 0;
                            const pointDiff = teamScoreNum - opponentScoreNum;

                            // Check if game is completed or upcoming
                            const isCompleted = teamScore != null && opponentScore != null && (teamScoreNum > 0 || opponentScoreNum > 0);
                            const gameDate = new Date(game.date);
                            const now = new Date();
                            const isUpcoming = gameDate > now;

                            // Get team logo from standings
                            const allTeamsInStandings = [
                              ...(standings?.eastern_conference || []),
                              ...(standings?.western_conference || [])
                            ];
                            const teamData = allTeamsInStandings.find(t => t.team_id === teamId);
                            const teamLogo = teamData?.team_logo || teamInfo?.team_logo;

                            // Get opponent logo from standings
                            const opponentData = allTeamsInStandings.find(t => t.team_id === opponent?.id);
                            const opponentLogo = opponentData?.team_logo || opponent?.logo;

                            return (
                              <div
                                key={game.game_id}
                                ref={game.game_id === mostRecentCompletedGameId ? mostRecentGameRef : null}
                                className={`rounded-lg border-l-4 ${
                                  isCompleted
                                    ? won ? 'border-l-green-500 bg-slate-800' : 'border-l-red-500 bg-slate-800'
                                    : 'border-l-blue-500 bg-slate-800/70'
                                } border border-slate-700 shadow-lg overflow-hidden hover:shadow-xl transition-all`}
                              >
                                <div
                                  className="grid grid-cols-12 gap-4 p-4 cursor-pointer"
                                  onClick={() => {
                                    if (isCompleted) {
                                      navigate(`/game/${game.game_id}`);
                                    } else {
                                      navigate(`/preview/${game.game_id}`);
                                    }
                                  }}
                                >
                                  {/* Column 1: Team Logo */}
                                  <div className="col-span-2 flex items-center justify-center py-2">
                                    {teamLogo && (
                                      <img src={teamLogo} alt="Team" className="w-16 h-16 object-contain" />
                                    )}
                                  </div>

                                  {/* Column 2: Date & Opponent */}
                                  <div className="col-span-3 flex flex-col justify-center py-2">
                                    <div className="text-xs text-slate-400 mb-3">
                                      {new Date(game.date).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric'
                                      })}
                                    </div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="text-base font-bold text-slate-400 w-6 text-center">
                                        {isHome ? 'vs' : '@'}
                                      </div>
                                      {opponentLogo && (
                                        <img src={opponentLogo} alt={opponent?.name} className="w-16 h-16 object-contain" />
                                      )}
                                      {opponent?.record && typeof opponent.record === 'string' && (
                                        <div className="text-xs text-slate-500 ml-1">({opponent.record})</div>
                                      )}
                                    </div>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase self-start ${
                                      seasonType.includes('post') || seasonType.includes('playoff')
                                        ? 'bg-yellow-500/20 text-yellow-400'
                                        : seasonType.includes('pre')
                                        ? 'bg-blue-500/20 text-blue-400'
                                        : 'bg-slate-600/50 text-slate-400'
                                    }`}>
                                      {seasonType.includes('post') || seasonType.includes('playoff') ? 'PLY' : seasonType.includes('pre') ? 'PRE' : 'REG'}
                                    </span>
                                  </div>

                                  {/* Column 3: Score/Result */}
                                  <div className="col-span-2 flex flex-col items-center justify-center">
                                    {isCompleted ? (
                                      <>
                                        <div className="text-3xl font-black mb-1">
                                          <span className={won ? 'text-green-400' : 'text-white'}>{teamScore}</span>
                                          <span className="text-slate-600 mx-1">-</span>
                                          <span className={!won ? 'text-red-400' : 'text-slate-500'}>{opponentScore}</span>
                                        </div>
                                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                                          won ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                                        }`}>
                                          {won ? 'W' : 'L'}
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-sm font-semibold text-blue-400 mb-1">
                                          {gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                        </span>
                                        <span className="text-xs text-slate-500">Upcoming</span>
                                      </>
                                    )}
                                  </div>

                                  {/* Column 4: Game Leaders */}
                                  <div className="col-span-5">
                                    {isCompleted && teamId ? (
                                      <div className="space-y-2">
                                        <GameLeadersCard gameId={game.game_id} teamId={teamId} />

                                        {/* Betting Odds Results */}
                                        {odds?.odds?.[game.game_id] && (() => {
                                          const gameOdds = odds.odds[game.game_id];
                                          const overUnder = gameOdds.over_under;
                                          const totalPoints = teamScoreNum + opponentScoreNum;
                                          const ouDiff = totalPoints - overUnder;
                                          const hitOver = ouDiff > 0;

                                          const teamSpread = isHome ? gameOdds.spread : -gameOdds.spread;
                                          const actualMargin = teamScoreNum - opponentScoreNum;
                                          const spreadResult = actualMargin + teamSpread;
                                          const coveredSpread = spreadResult > 0;

                                          return (
                                            <div className="flex gap-2 px-3">
                                              {/* Spread Badge */}
                                              <div className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold ${
                                                Math.abs(spreadResult) < 0.5
                                                  ? 'bg-slate-700/50 text-slate-400'
                                                  : coveredSpread
                                                    ? 'bg-green-500/20 text-green-400'
                                                    : 'bg-red-500/20 text-red-400'
                                              }`}>
                                                <span className="text-slate-500">SPREAD</span>
                                                <span>{teamSpread > 0 ? '+' : ''}{teamSpread}</span>
                                                {Math.abs(spreadResult) >= 0.5 && (
                                                  <span>{coveredSpread ? '✓' : '✗'}</span>
                                                )}
                                              </div>

                                              {/* Over/Under Badge */}
                                              <div className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold ${
                                                Math.abs(ouDiff) < 0.5
                                                  ? 'bg-slate-700/50 text-slate-400'
                                                  : hitOver
                                                    ? 'bg-green-500/20 text-green-400'
                                                    : 'bg-red-500/20 text-red-400'
                                              }`}>
                                                <span className="text-slate-500">O/U</span>
                                                <span>{overUnder}</span>
                                                <span className="text-slate-400">({totalPoints})</span>
                                                {Math.abs(ouDiff) >= 0.5 && (
                                                  <span>{hitOver ? '↑' : '↓'}</span>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-center h-full text-slate-600">
                                        <div className="text-xs text-center">
                                          {game.venue ? game.venue : 'Scheduled'}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          </div>
                        </div>
                      ));
                    })()}
              </div>
            </div>
          )}

          {/* Removed duplicate Upcoming Games section - already shown in Next Game Hero Card */}
          {false && schedule?.upcoming_games && schedule.upcoming_games.length > 0 && (
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                📅 Upcoming Schedule
              </h2>
              <div className="space-y-4">
                {schedule.upcoming_games.map((game: any, idx: number) => {
                  const isHome = game.home_team?.id === teamId;
                  const opponent = isHome ? game.away_team : game.home_team;
                  const gameDate = new Date(game.date);
                  const isNextGame = idx === 0;

                  return (
                    <div
                      key={game.game_id}
                      className={`p-5 rounded-lg transition-all ${
                        isNextGame
                          ? 'bg-orange-500/10 border-2 border-orange-500'
                          : 'bg-slate-700/30 border border-slate-700 hover:bg-slate-700/50'
                      }`}
                    >
                      {isNextGame && (
                        <div className="text-xs font-bold text-orange-400 uppercase mb-3">
                          Next Game
                        </div>
                      )}

                      <div className="grid grid-cols-[1fr,auto,1fr] gap-6 items-center mb-4">
                        {/* Date & Time */}
                        <div>
                          <div className="text-sm font-bold text-slate-400">
                            {gameDate.toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                          <div className="text-lg font-black text-white">
                            {gameDate.toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              timeZoneName: 'short'
                            })}
                          </div>
                          {game.venue && (
                            <div className="text-xs text-slate-500 mt-1">
                              {isHome ? '🏠 Home' : `✈️ @ ${game.venue}`}
                            </div>
                          )}
                        </div>

                        {/* Matchup */}
                        <div className="text-center">
                          <div className="flex items-center gap-4">
                            <div className="text-center">
                              {game.home_team?.logo && (
                                <img
                                  src={game.home_team.logo}
                                  alt={game.home_team.name}
                                  className="w-12 h-12 object-contain mx-auto mb-1"
                                />
                              )}
                              <div className={`text-sm font-bold ${
                                game.home_team?.id === teamId ? 'text-orange-400' : 'text-slate-300'
                              }`}>
                                {game.home_team?.abbreviation}
                              </div>
                              {game.home_team?.record && typeof game.home_team.record === 'string' && (
                                <div className="text-xs text-slate-500">{game.home_team.record}</div>
                              )}
                            </div>

                            <div className="text-slate-600 font-bold text-xl">vs</div>

                            <div className="text-center">
                              {game.away_team?.logo && (
                                <img
                                  src={game.away_team.logo}
                                  alt={game.away_team.name}
                                  className="w-12 h-12 object-contain mx-auto mb-1"
                                />
                              )}
                              <div className={`text-sm font-bold ${
                                game.away_team?.id === teamId ? 'text-orange-400' : 'text-slate-300'
                              }`}>
                                {game.away_team?.abbreviation}
                              </div>
                              {game.away_team?.record && typeof game.away_team.record === 'string' && (
                                <div className="text-xs text-slate-500">{game.away_team.record}</div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Broadcast Info */}
                        <div className="text-right">
                          {game.broadcast && game.broadcast.length > 0 && game.broadcast[0].length > 0 && (
                            <div>
                              <div className="text-xs text-slate-500 mb-1">WATCH ON</div>
                              <div className="text-sm font-bold text-slate-300">
                                {game.broadcast[0].slice(0, 2).join(', ')}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Betting Odds */}
                      {odds?.odds?.[game.game_id] && (() => {
                        const gameOdds = odds.odds[game.game_id];
                        const isHome = game.home_team?.id === teamId;
                        const teamOdds = isHome ? gameOdds.home_team_odds : gameOdds.away_team_odds;
                        const opponentOdds = isHome ? gameOdds.away_team_odds : gameOdds.home_team_odds;

                        return (
                          <div className="border-t border-slate-700/50 pt-4">
                            <div className="text-xs text-slate-500 uppercase font-bold mb-2">Betting Lines ({gameOdds.provider})</div>
                            <div className="grid grid-cols-3 gap-3">
                              {/* Spread */}
                              {gameOdds.spread && (
                                <div className="bg-slate-700/30 rounded-lg p-3 text-center">
                                  <div className="text-xs text-slate-500 uppercase font-bold mb-1">Spread</div>
                                  <div className="text-sm font-bold text-orange-400">
                                    {(() => {
                                      const teamSpread = isHome ? gameOdds.spread : -gameOdds.spread;
                                      return `${teamSpread > 0 ? '+' : ''}${teamSpread}`;
                                    })()}
                                  </div>
                                  {teamOdds.spread_odds && (
                                    <div className="text-xs text-slate-400 mt-1">
                                      ({teamOdds.spread_odds > 0 ? '+' : ''}{teamOdds.spread_odds})
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Money Line */}
                              {teamOdds.money_line && (
                                <div className="bg-slate-700/30 rounded-lg p-3 text-center">
                                  <div className="text-xs text-slate-500 uppercase font-bold mb-1">Money Line</div>
                                  <div className="text-sm font-bold text-orange-400">
                                    {teamOdds.money_line > 0 ? '+' : ''}{teamOdds.money_line}
                                  </div>
                                  {teamOdds.favorite && (
                                    <div className="text-xs text-yellow-400 mt-1">★ Favorite</div>
                                  )}
                                </div>
                              )}

                              {/* Over/Under */}
                              {gameOdds.over_under && (
                                <div className="bg-slate-700/30 rounded-lg p-3 text-center">
                                  <div className="text-xs text-slate-500 uppercase font-bold mb-1">Over/Under</div>
                                  <div className="text-sm font-bold text-orange-400">
                                    {gameOdds.over_under}
                                  </div>
                                  {gameOdds.over_odds && gameOdds.under_odds && (
                                    <div className="text-xs text-slate-400 mt-1">
                                      O: {gameOdds.over_odds > 0 ? '+' : ''}{gameOdds.over_odds} / U: {gameOdds.under_odds > 0 ? '+' : ''}{gameOdds.under_odds}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Roster Tab */}
      {activeTab === 'roster' && roster && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
          <div className="px-6 py-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              👥 Team Roster ({roster.total_players} Players)
            </h2>
          </div>
          <div className="px-6 pb-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b-2 border-slate-700">
                    <tr className="text-left">
                      <th className="pb-3 font-bold text-slate-400 uppercase">#</th>
                      <th className="pb-3 font-bold text-slate-400 uppercase">Player</th>
                      <th className="pb-3 font-bold text-center text-slate-400 uppercase">Pos</th>
                      <th className="pb-3 font-bold text-center text-slate-400 uppercase">Ht</th>
                      <th className="pb-3 font-bold text-center text-slate-400 uppercase">Wt</th>
                      <th className="pb-3 font-bold text-center text-slate-400 uppercase">Age</th>
                      <th className="pb-3 font-bold text-center text-slate-400 uppercase">Exp</th>
                      <th className="pb-3 font-bold text-center text-slate-400 uppercase">College</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.roster.map((player: any) => (
                      <tr
                        key={player.athlete_id}
                        className="border-b border-slate-700 hover:bg-slate-700/50 transition-colors cursor-pointer"
                        onClick={() => navigate(`/player/${player.athlete_id}`)}
                      >
                        <td className="py-3">
                          <span className="font-bold text-slate-400">#{player.jersey || '--'}</span>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <PlayerImage
                              src={player.athlete_headshot}
                              alt={player.athlete_name}
                              className="w-10 h-10 rounded-full bg-slate-700 object-cover"
                              fallbackInitial={player.athlete_name.charAt(0)}
                            />
                            <div className="font-semibold text-orange-400 hover:text-orange-300 transition-colors">
                              {player.athlete_name}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-center font-semibold">{player.position_abbr || '--'}</td>
                        <td className="py-3 text-center text-slate-400">{player.height || '--'}</td>
                        <td className="py-3 text-center text-slate-400">{player.weight || '--'}</td>
                        <td className="py-3 text-center text-slate-400">{player.age || '--'}</td>
                        <td className="py-3 text-center text-slate-400">{player.experience || '--'}</td>
                        <td className="py-3 text-center text-slate-400 text-sm">{player.college || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
        </div>
      )}

      {/* Depth Chart Tab */}
      {activeTab === 'depthchart' && (
        <div className="space-y-6">
          {isLoadingDepthChart ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin h-16 w-16 border-4 border-orange-500 border-t-transparent rounded-full"></div>
            </div>
          ) : depthChart?.depth_chart ? (
            <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-700">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  📋 Depth Chart
                  <span className="text-sm font-normal text-slate-400 ml-2">
                    ({depthChart.season})
                  </span>
                </h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
                  {Object.entries(depthChart.depth_chart).map(([posKey, posData]: [string, any]) => (
                    <div key={posKey} className="bg-slate-700/30 rounded-lg p-4 border border-slate-600">
                      <div className="mb-4 pb-3 border-b border-slate-600">
                        <h3 className="text-lg font-bold text-orange-400">{posData.position_abbr}</h3>
                        <p className="text-xs text-slate-400">{posData.position_name}</p>
                      </div>
                      <div className="space-y-3">
                        {posData.athletes.map((athlete: any, index: number) => (
                          <div
                            key={athlete.athlete_id}
                            onClick={() => navigate(`/player/${athlete.athlete_id}`)}
                            className={`p-3 rounded-lg cursor-pointer transition-all hover:scale-105 ${
                              index === 0
                                ? 'bg-orange-500/20 border-2 border-orange-500'
                                : 'bg-slate-800/50 border border-slate-600 hover:bg-slate-700/50'
                            }`}
                          >
                            <div className="flex items-center gap-3 mb-2">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                                index === 0
                                  ? 'bg-orange-500 text-white'
                                  : 'bg-slate-700 text-slate-400'
                              }`}>
                                {athlete.rank}
                              </div>
                              <PlayerImage
                                src={athlete.headshot}
                                alt={athlete.athlete_name}
                                className="w-12 h-12 rounded-full bg-slate-700 object-cover ring-2 ring-slate-600"
                                fallbackInitial={athlete.athlete_name.charAt(0)}
                              />
                            </div>
                            <div>
                              <div className={`font-bold text-sm mb-1 ${
                                index === 0 ? 'text-orange-400' : 'text-white'
                              }`}>
                                {athlete.athlete_name}
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                {athlete.jersey && (
                                  <span className="text-slate-400">#{athlete.jersey}</span>
                                )}
                                {athlete.position_abbr && (
                                  <span className="px-2 py-0.5 bg-slate-700 rounded text-slate-300">
                                    {athlete.position_abbr}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-800 rounded-xl p-12 border border-slate-700 text-center">
              <p className="text-slate-400 text-lg">No depth chart data available</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
