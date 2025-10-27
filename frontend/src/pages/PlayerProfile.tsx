import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { playersAPI } from '../lib/api';
import StatsChart from '../components/StatsChart';
import PlayerImage from '../components/PlayerImage';

type TabType = 'overview' | 'splits' | 'gamelog' | 'props';

export default function PlayerProfile() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get initial values from URL or use defaults
  const activeTab = (searchParams.get('tab') as TabType) || 'overview';
  const [selectedSeason, setSelectedSeason] = useState<string | undefined>(searchParams.get('season') || undefined);
  const [selectedSeasonType, setSelectedSeasonType] = useState<number | undefined>(
    searchParams.get('seasonType') ? Number(searchParams.get('seasonType')) : undefined
  );
  const [selectedStarterStatus, setSelectedStarterStatus] = useState<string | undefined>(
    searchParams.get('starterStatus') || undefined
  );
  const [selectedLocation, setSelectedLocation] = useState<string | undefined>(
    searchParams.get('location') || undefined
  );
  const [selectedPropType, setSelectedPropType] = useState(searchParams.get('propType') || 'Total Points');
  const [propSeason, setPropSeason] = useState(searchParams.get('propSeason') || '2025');

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [splitsData, setSplitsData] = useState<{ [key: string]: any }>({});

  // Helper function to update URL params
  const updateSearchParams = (updates: Record<string, string | undefined>) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    });
    setSearchParams(newParams, { replace: true });
  };

  // Update tab in URL
  const setActiveTab = (tab: TabType) => {
    updateSearchParams({ tab });
  };

  // Wrapper functions for filter state updates that also update URL
  const updateSelectedSeason = (value: string | undefined) => {
    setSelectedSeason(value);
    updateSearchParams({ season: value });
  };

  const updateSelectedSeasonType = (value: number | undefined) => {
    setSelectedSeasonType(value);
    updateSearchParams({ seasonType: value?.toString() });
  };

  const updateSelectedStarterStatus = (value: string | undefined) => {
    setSelectedStarterStatus(value);
    updateSearchParams({ starterStatus: value });
  };

  const updateSelectedLocation = (value: string | undefined) => {
    setSelectedLocation(value);
    updateSearchParams({ location: value });
  };

  const updateSelectedPropType = (value: string) => {
    setSelectedPropType(value);
    updateSearchParams({ propType: value });
  };

  const updatePropSeason = (value: string) => {
    setPropSeason(value);
    updateSearchParams({ propSeason: value });
  };

  const { data: player, isLoading: loadingPlayer } = useQuery({
    queryKey: ['player', athleteId],
    queryFn: () => playersAPI.getPlayer(athleteId!),
    enabled: !!athleteId,
  });

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['player-stats', athleteId],
    queryFn: () => playersAPI.getPlayerStats(athleteId!),
    enabled: !!athleteId,
  });

  const { data: careerSummary } = useQuery({
    queryKey: ['career-summary', athleteId],
    queryFn: () => playersAPI.getCareerSummary(athleteId!),
    enabled: !!athleteId,
  });

  const { data: careerHighs } = useQuery({
    queryKey: ['career-highs', athleteId],
    queryFn: () => playersAPI.getCareerHighs(athleteId!),
    enabled: !!athleteId,
  });

  const { data: playerSeasons } = useQuery({
    queryKey: ['player-seasons', athleteId],
    queryFn: () => playersAPI.getPlayerSeasons(athleteId!),
    enabled: !!athleteId,
  });

  // Get most recent regular season game to set default filters
  const { data: recentGame } = useQuery({
    queryKey: ['recent-game', athleteId],
    queryFn: () => playersAPI.getPlayerGames(athleteId!, undefined, 2, undefined, undefined, 1),
    enabled: !!athleteId && activeTab === 'gamelog' && !searchParams.get('season') && !searchParams.get('seasonType'),
  });

  // Set defaults when we get the recent game and tab becomes active
  useEffect(() => {
    if (recentGame && recentGame.games && recentGame.games.length > 0 &&
        activeTab === 'gamelog' &&
        !searchParams.get('season') &&
        !searchParams.get('seasonType')) {
      const mostRecentGame = recentGame.games[0];
      if (selectedSeason !== mostRecentGame.season || selectedSeasonType !== mostRecentGame.event_season_type) {
        updateSelectedSeason(mostRecentGame.season);
        updateSelectedSeasonType(mostRecentGame.event_season_type);
      }
    }
  }, [recentGame, activeTab, searchParams, selectedSeason, selectedSeasonType]);

  const { data: gameLog } = useQuery({
    queryKey: ['game-log', athleteId, selectedSeason, selectedSeasonType, selectedStarterStatus, selectedLocation],
    queryFn: () => playersAPI.getPlayerGames(athleteId!, selectedSeason, selectedSeasonType, selectedStarterStatus, selectedLocation, 100),
    enabled: !!athleteId && activeTab === 'gamelog' && (selectedSeason !== undefined && selectedSeasonType !== undefined),
  });

  const { data: propHistory, isLoading: loadingPropHistory } = useQuery({
    queryKey: ['prop-history', athleteId, propSeason, selectedPropType],
    queryFn: () => playersAPI.getPropHistory(athleteId!, propSeason, selectedPropType, 50),
    enabled: !!athleteId && activeTab === 'props',
  });

  if (loadingPlayer || loadingStats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-12 w-12 border-4 border-orange-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="text-center text-slate-400 py-12">
        Player not found
      </div>
    );
  }

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: '📊' },
    { id: 'splits' as TabType, label: 'Season Splits', icon: '📅' },
    { id: 'gamelog' as TabType, label: 'Game Log', icon: '🎮' },
    { id: 'props' as TabType, label: 'Props Performance', icon: '💰' },
  ];

  const toggleRow = async (season: string, teamId: string) => {
    const rowKey = `${season}-${teamId}`;

    if (expandedRows.has(rowKey)) {
      // Collapse the row
      const newExpanded = new Set(expandedRows);
      newExpanded.delete(rowKey);
      setExpandedRows(newExpanded);
    } else {
      // Expand the row and fetch splits data if not already loaded
      const newExpanded = new Set(expandedRows);
      newExpanded.add(rowKey);
      setExpandedRows(newExpanded);

      if (!splitsData[rowKey]) {
        try {
          const splits = await playersAPI.getPlayerSplits(athleteId!, season, teamId);
          setSplitsData(prev => ({ ...prev, [rowKey]: splits }));
        } catch (error) {
          console.error('Error fetching splits:', error);
        }
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Enhanced Player Header */}
      <div
        className="relative overflow-hidden rounded-xl border border-slate-700"
        style={{
          background: player.team_colors?.primary
            ? `linear-gradient(135deg, #${player.team_colors.primary}20 0%, #${player.team_colors.secondary || player.team_colors.primary}15 50%, #1e293b 100%)`
            : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)'
        }}
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
            backgroundSize: '30px 30px'
          }} />
        </div>

        <div className="relative px-8 py-8">
          <div className="flex items-start gap-8">
            {/* Player Image with Jersey Number */}
            <div className="relative flex-shrink-0">
              <div
                className="absolute -inset-2 rounded-full blur-2xl opacity-40"
                style={{
                  background: player.team_colors?.primary
                    ? `radial-gradient(circle, #${player.team_colors.primary}, transparent)`
                    : 'radial-gradient(circle, #f97316, transparent)'
                }}
              />
              <PlayerImage
                src={player.athlete_headshot}
                alt={player.athlete_display_name}
                className="w-40 h-40 rounded-full bg-slate-700/50 backdrop-blur-sm text-6xl relative border-4 border-slate-700/50 shadow-2xl"
                fallbackInitial={player.athlete_display_name.charAt(0)}
              />
              {player.athlete_jersey && (
                <div
                  className="absolute -bottom-2 -right-2 w-16 h-16 rounded-full flex items-center justify-center font-bold text-2xl shadow-lg border-4 border-slate-800"
                  style={{
                    background: player.team_colors?.primary
                      ? `linear-gradient(135deg, #${player.team_colors.primary}, #${player.team_colors.secondary || player.team_colors.primary})`
                      : 'linear-gradient(135deg, #f97316, #ea580c)',
                    color: '#ffffff'
                  }}
                >
                  #{player.athlete_jersey}
                </div>
              )}
            </div>

            {/* Player Info */}
            <div className="flex-1 min-w-0 pt-2">
              {/* Name and Team */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                    {player.athlete_display_name}
                  </h1>
                  {player.team_name && (
                    <button
                      onClick={() => player.team_id && navigate(`/team/${player.team_id}`)}
                      className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
                      disabled={!player.team_id}
                    >
                      {player.team_logo && (
                        <img
                          src={player.team_logo}
                          alt={player.team_name}
                          className="w-8 h-8 object-contain"
                        />
                      )}
                      <span className="text-xl font-semibold text-slate-300">
                        {player.team_name}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {/* Position */}
                {player.athlete_position && (
                  <div className="bg-slate-800/60 backdrop-blur-sm rounded-lg p-3 border border-slate-700/50">
                    <div className="text-xs text-slate-400 mb-1">Position</div>
                    <div className="text-lg font-bold text-white">{player.athlete_position_abbreviation || player.athlete_position}</div>
                  </div>
                )}

                {/* Height */}
                {player.athlete_display_height && (
                  <div className="bg-slate-800/60 backdrop-blur-sm rounded-lg p-3 border border-slate-700/50">
                    <div className="text-xs text-slate-400 mb-1">Height</div>
                    <div className="text-lg font-bold text-white">{player.athlete_display_height}</div>
                  </div>
                )}

                {/* Weight */}
                {player.athlete_display_weight && (
                  <div className="bg-slate-800/60 backdrop-blur-sm rounded-lg p-3 border border-slate-700/50">
                    <div className="text-xs text-slate-400 mb-1">Weight</div>
                    <div className="text-lg font-bold text-white">{player.athlete_display_weight}</div>
                  </div>
                )}

                {/* Age */}
                {player.athlete_age && (
                  <div className="bg-slate-800/60 backdrop-blur-sm rounded-lg p-3 border border-slate-700/50">
                    <div className="text-xs text-slate-400 mb-1">Age</div>
                    <div className="text-lg font-bold text-white">{player.athlete_age} yrs</div>
                  </div>
                )}

                {/* Experience */}
                {player.experience_years && (
                  <div className="bg-slate-800/60 backdrop-blur-sm rounded-lg p-3 border border-slate-700/50">
                    <div className="text-xs text-slate-400 mb-1">Experience</div>
                    <div className="text-lg font-bold text-white">{player.experience_years} seasons</div>
                  </div>
                )}

                {/* Draft */}
                {player.draft_info && (
                  <div className="bg-slate-800/60 backdrop-blur-sm rounded-lg p-3 border border-slate-700/50">
                    <div className="text-xs text-slate-400 mb-1">Draft</div>
                    <div className="text-sm font-bold text-white">{player.draft_year} R{player.draft_round} P{player.draft_pick}</div>
                  </div>
                )}
              </div>

              {/* Additional Info Row */}
              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-400">
                {player.athlete_birth_place_city && player.athlete_birth_place_state && (
                  <div className="flex items-center gap-1">
                    <span>Born:</span>
                    <span className="text-slate-300 font-medium">
                      {player.athlete_birth_place_city}, {player.athlete_birth_place_state}
                    </span>
                  </div>
                )}
                {player.debut_year && (
                  <div className="flex items-center gap-1">
                    <span>•</span>
                    <span>Debut:</span>
                    <span className="text-slate-300 font-medium">{player.debut_year}</span>
                  </div>
                )}
                {player.salary && (
                  <div className="flex items-center gap-1">
                    <span>•</span>
                    <span>Salary:</span>
                    <span className="text-slate-300 font-medium">
                      ${(player.salary / 1000000).toFixed(1)}M
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-slate-800 rounded-lg border border-slate-700">
        {/* Tab Navigation */}
        <div className="flex border-b border-slate-700 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-slate-700 text-orange-500 border-b-2 border-orange-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-750'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Career Overview Cards */}
              {careerSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/20 border border-orange-700/50 rounded-lg p-6">
                    <div className="text-sm text-orange-300 mb-1">Career Points</div>
                    <div className="text-3xl font-bold text-orange-400">
                      {careerSummary.career_points?.toLocaleString() || 'N/A'}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {careerSummary.career_ppg?.toFixed(1)} PPG avg
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700/50 rounded-lg p-6">
                    <div className="text-sm text-green-300 mb-1">Career Rebounds</div>
                    <div className="text-3xl font-bold text-green-400">
                      {careerSummary.career_rebounds?.toLocaleString() || 'N/A'}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {careerSummary.career_rpg?.toFixed(1)} RPG avg
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/50 rounded-lg p-6">
                    <div className="text-sm text-blue-300 mb-1">Career Assists</div>
                    <div className="text-3xl font-bold text-blue-400">
                      {careerSummary.career_assists?.toLocaleString() || 'N/A'}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {careerSummary.career_apg?.toFixed(1)} APG avg
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-700/50 rounded-lg p-6">
                    <div className="text-sm text-purple-300 mb-1">Games Played</div>
                    <div className="text-3xl font-bold text-purple-400">
                      {careerSummary.total_games?.toLocaleString() || 'N/A'}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {careerSummary.seasons_played} seasons
                    </div>
                  </div>
                </div>
              )}

              {/* Career Highs */}
              {careerHighs && (
                <div>
                  <h3 className="text-xl font-bold mb-4">Career Highs 🏆</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="text-center p-4 bg-slate-700/50 rounded-lg">
                      <div className="text-4xl font-bold text-orange-500">
                        {careerHighs.career_high_points}
                      </div>
                      <div className="text-sm text-slate-400 mt-1">Points</div>
                    </div>
                    <div className="text-center p-4 bg-slate-700/50 rounded-lg">
                      <div className="text-4xl font-bold text-green-500">
                        {careerHighs.career_high_rebounds}
                      </div>
                      <div className="text-sm text-slate-400 mt-1">Rebounds</div>
                    </div>
                    <div className="text-center p-4 bg-slate-700/50 rounded-lg">
                      <div className="text-4xl font-bold text-blue-500">
                        {careerHighs.career_high_assists}
                      </div>
                      <div className="text-sm text-slate-400 mt-1">Assists</div>
                    </div>
                    <div className="text-center p-4 bg-slate-700/50 rounded-lg">
                      <div className="text-4xl font-bold text-yellow-500">
                        {careerHighs.career_high_steals}
                      </div>
                      <div className="text-sm text-slate-400 mt-1">Steals</div>
                    </div>
                    <div className="text-center p-4 bg-slate-700/50 rounded-lg">
                      <div className="text-4xl font-bold text-red-500">
                        {careerHighs.career_high_blocks}
                      </div>
                      <div className="text-sm text-slate-400 mt-1">Blocks</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Career Progression Chart */}
              {stats && stats.seasons.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold mb-4">Career Progression</h3>
                  <StatsChart seasons={stats.seasons} />
                </div>
              )}
            </div>
          )}

          {/* Season Splits Tab */}
          {activeTab === 'splits' && stats && stats.seasons.length > 0 && (
            <div>
              <h3 className="text-xl font-bold mb-4">Season by Season Statistics</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b-2 border-slate-700">
                    <tr className="text-left">
                      <th className="pb-3 font-semibold sticky left-0 bg-slate-800">Season</th>
                      <th className="pb-3 font-semibold">Team</th>
                      <th className="pb-3 font-semibold text-center">GP</th>
                      <th className="pb-3 font-semibold text-center">PPG</th>
                      <th className="pb-3 font-semibold text-center">RPG</th>
                      <th className="pb-3 font-semibold text-center">APG</th>
                      <th className="pb-3 font-semibold text-center">SPG</th>
                      <th className="pb-3 font-semibold text-center">BPG</th>
                      <th className="pb-3 font-semibold text-center">Total PTS</th>
                      <th className="pb-3 font-semibold text-center">Total REB</th>
                      <th className="pb-3 font-semibold text-center">Total AST</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {stats.seasons.map((season: any) => (
                      <>
                        {season.teams.map((team: any, teamIndex: number) => {
                          const rowKey = `${season.season}-${team.team_id}`;
                          const isExpanded = expandedRows.has(rowKey);
                          const splits = splitsData[rowKey];

                          return (
                            <>
                              <tr
                                key={rowKey}
                                className="hover:bg-slate-700/50 transition-colors"
                              >
                                {teamIndex === 0 && (
                                  <td
                                    className="py-3 font-medium sticky left-0 bg-slate-800 cursor-pointer"
                                    rowSpan={season.teams.length}
                                    onClick={() => {
                                      setActiveTab('gamelog');
                                      updateSelectedSeason(season.season);
                                      updateSelectedSeasonType(2);
                                    }}
                                  >
                                    <span className="hover:text-orange-400 transition-colors">{season.season}</span>
                                  </td>
                                )}
                                <td className="py-3">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleRow(season.season, team.team_id);
                                      }}
                                      className="text-slate-500 hover:text-slate-300 cursor-pointer"
                                    >
                                      {isExpanded ? '▼' : '▶'}
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/team/${team.team_id}`);
                                      }}
                                      className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                                    >
                                      {team.team_logo && (
                                        <img
                                          src={team.team_logo}
                                          alt={team.team_abbreviation}
                                          className="w-6 h-6 object-contain"
                                          onError={(e) => {
                                            e.currentTarget.style.display = 'none';
                                          }}
                                        />
                                      )}
                                      <span className="text-slate-300">{team.team_abbreviation}</span>
                                    </button>
                                  </div>
                                </td>
                                <td className="py-3 text-center">{team.games_played}</td>
                                <td className="py-3 text-center text-orange-500 font-bold">
                                  {team.avg_points.toFixed(1)}
                                </td>
                                <td className="py-3 text-center text-green-500 font-semibold">
                                  {team.avg_rebounds.toFixed(1)}
                                </td>
                                <td className="py-3 text-center text-blue-500 font-semibold">
                                  {team.avg_assists.toFixed(1)}
                                </td>
                                <td className="py-3 text-center">
                                  {team.avg_steals.toFixed(1)}
                                </td>
                                <td className="py-3 text-center">
                                  {team.avg_blocks.toFixed(1)}
                                </td>
                                <td className="py-3 text-center text-slate-400">
                                  {team.total_points.toLocaleString()}
                                </td>
                                <td className="py-3 text-center text-slate-400">
                                  {team.total_rebounds.toLocaleString()}
                                </td>
                                <td className="py-3 text-center text-slate-400">
                                  {team.total_assists.toLocaleString()}
                                </td>
                              </tr>
                              {isExpanded && splits && (
                                <tr className="bg-slate-900/50">
                                  <td colSpan={11} className="px-6 py-4">
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                      {/* Home/Away Splits */}
                                      <div className="bg-slate-800/50 rounded-lg p-4">
                                        <h4 className="text-sm font-semibold text-slate-300 mb-3">Home vs Away</h4>
                                        <div className="space-y-2 text-xs">
                                          <div className="flex justify-between">
                                            <span className="text-slate-400">Home ({splits.splits.home.games_played}G):</span>
                                            <span className="text-orange-400">{splits.splits.home.avg_points} PPG</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-slate-400">Away ({splits.splits.away.games_played}G):</span>
                                            <span className="text-orange-400">{splits.splits.away.avg_points} PPG</span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Conference Splits */}
                                      <div className="bg-slate-800/50 rounded-lg p-4">
                                        <h4 className="text-sm font-semibold text-slate-300 mb-3">vs Conference</h4>
                                        <div className="space-y-2 text-xs">
                                          <div className="flex justify-between">
                                            <span className="text-slate-400">vs {splits.player_conference} ({splits.splits.vs_conference.games_played}G):</span>
                                            <span className="text-orange-400">{splits.splits.vs_conference.avg_points} PPG</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-slate-400">vs {splits.player_conference === 'Eastern' ? 'Western' : 'Eastern'} ({splits.splits.vs_out_conference.games_played}G):</span>
                                            <span className="text-orange-400">{splits.splits.vs_out_conference.avg_points} PPG</span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Division Splits */}
                                      <div className="bg-slate-800/50 rounded-lg p-4">
                                        <h4 className="text-sm font-semibold text-slate-300 mb-3">vs Division</h4>
                                        <div className="space-y-2 text-xs">
                                          <div className="flex justify-between">
                                            <span className="text-slate-400">vs Division ({splits.splits.vs_division.games_played}G):</span>
                                            <span className="text-orange-400">{splits.splits.vs_division.avg_points} PPG</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-slate-400">vs Out Div ({splits.splits.vs_out_division.games_played}G):</span>
                                            <span className="text-orange-400">{splits.splits.vs_out_division.avg_points} PPG</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                        {season.teams.length > 1 && (
                          <tr className="bg-slate-700/30 font-semibold">
                            <td className="py-2 text-right pr-4" colSpan={2}>
                              Season Total
                            </td>
                            <td className="py-2 text-center">{season.games_played}</td>
                            <td className="py-2 text-center text-orange-400">
                              {season.avg_points.toFixed(1)}
                            </td>
                            <td className="py-2 text-center text-green-400">
                              {season.avg_rebounds.toFixed(1)}
                            </td>
                            <td className="py-2 text-center text-blue-400">
                              {season.avg_assists.toFixed(1)}
                            </td>
                            <td className="py-2 text-center">-</td>
                            <td className="py-2 text-center">-</td>
                            <td className="py-2 text-center text-slate-300">
                              {season.total_points.toLocaleString()}
                            </td>
                            <td className="py-2 text-center text-slate-300">
                              {season.total_rebounds.toLocaleString()}
                            </td>
                            <td className="py-2 text-center text-slate-300">
                              {season.total_assists.toLocaleString()}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Game Log Tab */}
          {activeTab === 'gamelog' && (
            <div>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h3 className="text-xl font-bold">Game Log</h3>
                <div className="flex flex-wrap gap-3">
                  {/* Location Filter */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400 font-semibold">Location</label>
                    <select
                      value={selectedLocation || ''}
                      onChange={(e) => updateSelectedLocation(e.target.value || undefined)}
                      className="bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-orange-500"
                    >
                      <option value="">All Games</option>
                      <option value="home">Home</option>
                      <option value="away">Away</option>
                    </select>
                  </div>

                  {/* Starter Status Filter */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400 font-semibold">Role</label>
                    <select
                      value={selectedStarterStatus || ''}
                      onChange={(e) => updateSelectedStarterStatus(e.target.value || undefined)}
                      className="bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-orange-500"
                    >
                      <option value="">All Games</option>
                      <option value="starter">Started</option>
                      <option value="bench">Bench</option>
                    </select>
                  </div>

                  {/* Season Type Filter */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400 font-semibold">Season Type</label>
                    <select
                      value={selectedSeasonType || ''}
                      onChange={(e) => updateSelectedSeasonType(e.target.value ? Number(e.target.value) : undefined)}
                      className="bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-orange-500"
                    >
                      <option value="">All Types</option>
                      <option value="2">Regular Season</option>
                      <option value="3">Playoffs</option>
                      <option value="1">Preseason</option>
                    </select>
                  </div>

                  {/* Season Filter */}
                  {playerSeasons && playerSeasons.seasons.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-400 font-semibold">Season</label>
                      <select
                        value={selectedSeason || ''}
                        onChange={(e) => updateSelectedSeason(e.target.value || undefined)}
                        className="bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-orange-500"
                      >
                        <option value="">All Seasons</option>
                        {playerSeasons.seasons.map((season) => {
                          const seasonInt = parseInt(season);
                          const displaySeason = `${seasonInt - 1}-${season}`;
                          return (
                            <option key={season} value={season}>
                              {displaySeason}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              {gameLog && gameLog.games.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b-2 border-slate-700">
                      <tr className="text-left">
                        <th className="pb-3 font-semibold sticky left-0 bg-slate-800">Date</th>
                        <th className="pb-3 font-semibold">Matchup</th>
                        <th className="pb-3 font-semibold text-center">Result</th>
                        <th className="pb-3 font-semibold text-center">Score</th>
                        <th className="pb-3 font-semibold text-center">MIN</th>
                        <th className="pb-3 font-semibold text-center">PTS</th>
                        <th className="pb-3 font-semibold text-center">REB</th>
                        <th className="pb-3 font-semibold text-center">AST</th>
                        <th className="pb-3 font-semibold text-center">STL</th>
                        <th className="pb-3 font-semibold text-center">BLK</th>
                        <th className="pb-3 font-semibold text-center">TO</th>
                        <th className="pb-3 font-semibold text-center">+/-</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {gameLog.games.map((game: any) => (
                        <tr
                          key={game.game_id || `${game.game_id_athlete_id}-${game.date}`}
                          className="hover:bg-slate-700/50 transition-colors cursor-pointer"
                          onClick={() => navigate(`/game/${game.game_id}`)}
                        >
                          <td className="py-3 sticky left-0 bg-slate-800 font-medium">
                            <div className="text-sm">{game.game_date || 'N/A'}</div>
                            <div className="text-xs text-slate-400">{game.season}</div>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              {game.player_team_logo && (
                                <img
                                  src={game.player_team_logo}
                                  alt={game.team_name}
                                  className="w-8 h-8 object-contain"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              )}
                              <span className="font-medium text-slate-400">
                                {game.home_away === 'Home' ? 'vs' : '@'}
                              </span>
                              {game.opponent_team_logo && (
                                <img
                                  src={game.opponent_team_logo}
                                  alt={game.opponent_name}
                                  className="w-8 h-8 object-contain"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              )}
                            </div>
                          </td>
                          <td className="py-3 text-center">
                            <span className={`font-bold px-2 py-1 rounded ${
                              game.game_result === 'W'
                                ? 'bg-green-900/30 text-green-400'
                                : 'bg-red-900/30 text-red-400'
                            }`}>
                              {game.game_result || '-'}
                            </span>
                          </td>
                          <td className="py-3 text-center font-medium">
                            {game.team_score && game.opponent_score
                              ? `${game.team_score}-${game.opponent_score}`
                              : '-'}
                          </td>
                          <td className="py-3 text-center">{game.minutes || '-'}</td>
                          <td className="py-3 text-center text-orange-500 font-bold">
                            {game.points || '-'}
                          </td>
                          <td className="py-3 text-center">{game.rebounds || '-'}</td>
                          <td className="py-3 text-center">{game.assists || '-'}</td>
                          <td className="py-3 text-center">{game.steals || '-'}</td>
                          <td className="py-3 text-center">{game.blocks || '-'}</td>
                          <td className="py-3 text-center">{game.turnovers || '-'}</td>
                          <td className={`py-3 text-center font-semibold ${
                            game.plusMinus && parseInt(game.plusMinus) > 0
                              ? 'text-green-500'
                              : game.plusMinus && parseInt(game.plusMinus) < 0
                              ? 'text-red-500'
                              : 'text-slate-400'
                          }`}>
                            {game.plusMinus || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center text-slate-400 py-12">
                  {gameLog ? 'No games found for this filter' : 'Loading game log...'}
                </div>
              )}
            </div>
          )}

          {/* Props Tab */}
          {activeTab === 'props' && (
            <div className="space-y-6">
              {/* Filters */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h3 className="text-xl font-bold">Props Betting Performance</h3>
                <div className="flex gap-3">
                  <select
                    value={selectedPropType}
                    onChange={(e) => updateSelectedPropType(e.target.value)}
                    className="bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-orange-500"
                  >
                    <optgroup label="Single Stats">
                      <option value="Total Points">Points</option>
                      <option value="Total Rebounds">Rebounds</option>
                      <option value="Total Assists">Assists</option>
                      <option value="Total Steals">Steals</option>
                      <option value="Total Blocks">Blocks</option>
                      <option value="Total 3-Point Field Goals">3-Pointers</option>
                    </optgroup>
                    <optgroup label="Combination Props">
                      <option value="Total Points, Rebounds, and Assists">Pts + Reb + Ast</option>
                      <option value="Total Points and Assists">Pts + Ast</option>
                      <option value="Total Points and Rebounds">Pts + Reb</option>
                      <option value="Total Assists and Rebounds">Ast + Reb</option>
                    </optgroup>
                  </select>
                  <select
                    value={propSeason}
                    onChange={(e) => updatePropSeason(e.target.value)}
                    className="bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-orange-500"
                  >
                    <option value="2025">2024-25</option>
                    <option value="2024">2023-24</option>
                    <option value="2023">2022-23</option>
                  </select>
                </div>
              </div>

              {loadingPropHistory ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin h-12 w-12 border-4 border-orange-500 border-t-transparent rounded-full"></div>
                </div>
              ) : propHistory && propHistory.summary ? (
                <>
                  {/* Enhanced Summary Cards with Progress Rings */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Overall Hit Rate */}
                    <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/20 border border-orange-700/50 rounded-lg p-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl"></div>
                      <div className="relative">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm text-orange-300 font-semibold">Overall Hit Rate</div>
                          <div className="text-2xl">🎯</div>
                        </div>
                        <div className="flex items-end gap-3">
                          <div className="text-5xl font-bold text-orange-400">
                            {propHistory.summary.hit_rate !== null ? `${propHistory.summary.hit_rate}%` : 'N/A'}
                          </div>
                          {propHistory.summary.hit_rate !== null && (
                            <div className={`text-sm font-bold mb-2 ${
                              propHistory.summary.hit_rate >= 60 ? 'text-green-400' :
                              propHistory.summary.hit_rate >= 50 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                              {propHistory.summary.hit_rate >= 60 ? '🔥 Hot' :
                               propHistory.summary.hit_rate >= 50 ? '📊 Average' : '❄️ Cold'}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
                          <span>{propHistory.summary.hits}/{propHistory.summary.games_with_props} games</span>
                          {propHistory.summary.hit_rate !== null && (
                            <div className="flex gap-1">
                              {[...Array(5)].map((_, i) => (
                                <div
                                  key={i}
                                  className={`w-1.5 h-3 rounded-full ${
                                    i < Math.floor(propHistory.summary.hit_rate / 20)
                                      ? 'bg-orange-400'
                                      : 'bg-slate-700'
                                  }`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Home Hit Rate */}
                    <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/50 rounded-lg p-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl"></div>
                      <div className="relative">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm text-blue-300 font-semibold">Home Hit Rate</div>
                          <div className="text-2xl">🏠</div>
                        </div>
                        <div className="text-5xl font-bold text-blue-400">
                          {propHistory.summary.home_hit_rate !== null ? `${propHistory.summary.home_hit_rate}%` : 'N/A'}
                        </div>
                        <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
                          <span>{propHistory.summary.home_games} home games</span>
                          {propHistory.summary.home_hit_rate !== null && propHistory.summary.hit_rate !== null && (
                            <span className={`font-bold ${
                              propHistory.summary.home_hit_rate > propHistory.summary.hit_rate
                                ? 'text-green-400'
                                : 'text-red-400'
                            }`}>
                              {propHistory.summary.home_hit_rate > propHistory.summary.hit_rate
                                ? `+${(propHistory.summary.home_hit_rate - propHistory.summary.hit_rate).toFixed(1)}%`
                                : `${(propHistory.summary.home_hit_rate - propHistory.summary.hit_rate).toFixed(1)}%`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Away Hit Rate */}
                    <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-700/50 rounded-lg p-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl"></div>
                      <div className="relative">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm text-purple-300 font-semibold">Away Hit Rate</div>
                          <div className="text-2xl">✈️</div>
                        </div>
                        <div className="text-5xl font-bold text-purple-400">
                          {propHistory.summary.away_hit_rate !== null ? `${propHistory.summary.away_hit_rate}%` : 'N/A'}
                        </div>
                        <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
                          <span>{propHistory.summary.away_games} away games</span>
                          {propHistory.summary.away_hit_rate !== null && propHistory.summary.hit_rate !== null && (
                            <span className={`font-bold ${
                              propHistory.summary.away_hit_rate > propHistory.summary.hit_rate
                                ? 'text-green-400'
                                : 'text-red-400'
                            }`}>
                              {propHistory.summary.away_hit_rate > propHistory.summary.hit_rate
                                ? `+${(propHistory.summary.away_hit_rate - propHistory.summary.hit_rate).toFixed(1)}%`
                                : `${(propHistory.summary.away_hit_rate - propHistory.summary.hit_rate).toFixed(1)}%`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Last 10 Trend */}
                    <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700/50 rounded-lg p-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 rounded-full blur-2xl"></div>
                      <div className="relative">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm text-green-300 font-semibold">Last 10 Games</div>
                          <div className="text-2xl">📈</div>
                        </div>
                        <div className="text-5xl font-bold text-green-400">
                          {propHistory.summary.last_10_hit_rate !== null ? `${propHistory.summary.last_10_hit_rate}%` : 'N/A'}
                        </div>
                        <div className="text-xs text-slate-400 mt-2">
                          {propHistory.summary.last_10_hit_rate !== null && propHistory.summary.hit_rate !== null && (
                            <div className="flex items-center justify-between">
                              <span>Recent trend</span>
                              <span className={`font-bold flex items-center gap-1 ${
                                propHistory.summary.last_10_hit_rate > propHistory.summary.hit_rate
                                  ? 'text-green-400'
                                  : propHistory.summary.last_10_hit_rate < propHistory.summary.hit_rate
                                  ? 'text-red-400'
                                  : 'text-slate-400'
                              }`}>
                                {propHistory.summary.last_10_hit_rate > propHistory.summary.hit_rate ? '↗' :
                                 propHistory.summary.last_10_hit_rate < propHistory.summary.hit_rate ? '↘' : '→'}
                                {propHistory.summary.last_10_hit_rate > propHistory.summary.hit_rate
                                  ? 'Heating Up'
                                  : propHistory.summary.last_10_hit_rate < propHistory.summary.hit_rate
                                  ? 'Cooling Off'
                                  : 'Steady'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Enhanced Averages Comparison with Visual Bar */}
                  <div className="bg-gradient-to-r from-slate-800/80 to-slate-700/80 backdrop-blur-sm rounded-xl p-6 border border-slate-600/50">
                    <h4 className="text-sm font-semibold text-slate-300 mb-4">Performance vs Line</h4>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <div className="text-xs text-slate-400 mb-2">Average {selectedPropType.replace('Total ', '')}</div>
                        <div className="text-4xl font-bold text-white mb-2">
                          {propHistory.summary.average_actual !== null ? propHistory.summary.average_actual.toFixed(1) : 'N/A'}
                        </div>
                        {propHistory.summary.average_actual !== null && propHistory.summary.average_line !== null && (
                          <div className={`text-sm font-semibold flex items-center gap-2 ${
                            propHistory.summary.average_actual > propHistory.summary.average_line
                              ? 'text-green-400'
                              : 'text-red-400'
                          }`}>
                            {propHistory.summary.average_actual > propHistory.summary.average_line ? '↑' : '↓'}
                            {Math.abs(propHistory.summary.average_actual - propHistory.summary.average_line).toFixed(1)} vs line
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 mb-2">Average Line</div>
                        <div className="text-4xl font-bold text-slate-300 mb-2">
                          {propHistory.summary.average_line !== null ? propHistory.summary.average_line.toFixed(1) : 'N/A'}
                        </div>
                        <div className="text-sm text-slate-400">
                          {propHistory.summary.games_with_props} games with lines
                        </div>
                      </div>
                    </div>
                    {/* Visual comparison bar */}
                    {propHistory.summary.average_actual !== null && propHistory.summary.average_line !== null && (
                      <div className="mt-4">
                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                          <span>Performance</span>
                          <div className="flex-1 h-px bg-slate-600"></div>
                        </div>
                        <div className="relative h-8 bg-slate-700/50 rounded-lg overflow-hidden">
                          <div
                            className="absolute h-full bg-gradient-to-r from-orange-500 to-orange-600 transition-all duration-500 flex items-center justify-end px-2"
                            style={{
                              width: `${Math.min(100, (propHistory.summary.average_actual / Math.max(propHistory.summary.average_actual, propHistory.summary.average_line) * 100))}%`
                            }}
                          >
                            <span className="text-xs font-bold text-white">Actual</span>
                          </div>
                          <div
                            className="absolute h-full border-2 border-dashed border-yellow-400"
                            style={{
                              left: `${(propHistory.summary.average_line / Math.max(propHistory.summary.average_actual, propHistory.summary.average_line) * 100)}%`
                            }}
                          >
                            <div className="absolute -top-6 -left-8 text-xs font-bold text-yellow-400 whitespace-nowrap">
                              Line
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Last 10 Games Streak Visualization */}
                  {propHistory.games && propHistory.games.length > 0 && (
                    <div className="bg-slate-800/60 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
                      <h4 className="text-sm font-semibold text-slate-300 mb-4">Last 10 Games Streak</h4>
                      <div className="flex items-center gap-2">
                        {propHistory.games.slice(0, 10).reverse().map((game: any, idx: number) => (
                          <div
                            key={idx}
                            className="group relative flex-1"
                          >
                            <div
                              className={`h-16 rounded-lg transition-all duration-200 ${
                                game.hit_over === true
                                  ? 'bg-gradient-to-t from-green-600 to-green-500 hover:from-green-500 hover:to-green-400'
                                  : game.hit_over === false
                                  ? 'bg-gradient-to-t from-red-600 to-red-500 hover:from-red-500 hover:to-red-400'
                                  : 'bg-slate-700'
                              }`}
                              style={{
                                height: game.actual && game.line
                                  ? `${Math.min(100, Math.max(20, (game.actual / game.line) * 60))}px`
                                  : '40px'
                              }}
                            >
                              {/* Tooltip */}
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl whitespace-nowrap">
                                  <div className="text-xs text-slate-400 mb-1">{game.game_date}</div>
                                  <div className="text-xs text-slate-300">vs {game.opponent}</div>
                                  <div className="text-sm font-bold text-white mt-1">
                                    {game.actual} / {game.line}
                                  </div>
                                  <div className={`text-xs font-bold mt-1 ${
                                    game.hit_over ? 'text-green-400' : 'text-red-400'
                                  }`}>
                                    {game.hit_over ? '✓ Over' : '✗ Under'}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="text-[10px] text-slate-500 text-center mt-1">
                              G{10 - idx}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between mt-4 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded bg-green-500"></div>
                          <span className="text-slate-400">Over</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded bg-red-500"></div>
                          <span className="text-slate-400">Under</span>
                        </div>
                        <div className="text-slate-500">Hover for details</div>
                      </div>
                    </div>
                  )}

                  {/* Betting Insights */}
                  {propHistory.summary && propHistory.summary.hit_rate !== null && (
                    <div className="bg-gradient-to-br from-indigo-900/20 to-purple-900/20 border border-indigo-700/30 rounded-xl p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="text-2xl">💡</div>
                        <h4 className="text-lg font-bold text-indigo-300">Betting Insights</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Home/Away Recommendation */}
                        {propHistory.summary.home_hit_rate !== null && propHistory.summary.away_hit_rate !== null && (
                          <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/50">
                            <div className="text-xs text-slate-400 mb-2">Location Trend</div>
                            <div className="text-sm text-slate-200">
                              {propHistory.summary.home_hit_rate > propHistory.summary.away_hit_rate ? (
                                <>
                                  <span className="font-bold text-blue-400">Better at home</span>
                                  {` by ${(propHistory.summary.home_hit_rate - propHistory.summary.away_hit_rate).toFixed(1)}%`}
                                </>
                              ) : propHistory.summary.away_hit_rate > propHistory.summary.home_hit_rate ? (
                                <>
                                  <span className="font-bold text-purple-400">Better on road</span>
                                  {` by ${(propHistory.summary.away_hit_rate - propHistory.summary.home_hit_rate).toFixed(1)}%`}
                                </>
                              ) : (
                                <span className="text-slate-400">No significant difference</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Recent Form */}
                        {propHistory.summary.last_10_hit_rate !== null && (
                          <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/50">
                            <div className="text-xs text-slate-400 mb-2">Recent Form</div>
                            <div className="text-sm text-slate-200">
                              {propHistory.summary.last_10_hit_rate >= 60 ? (
                                <span className="font-bold text-green-400">🔥 Hot streak - {propHistory.summary.last_10_hit_rate}% last 10</span>
                              ) : propHistory.summary.last_10_hit_rate >= 50 ? (
                                <span className="font-bold text-yellow-400">📊 Consistent - {propHistory.summary.last_10_hit_rate}% last 10</span>
                              ) : (
                                <span className="font-bold text-red-400">❄️ Cold - {propHistory.summary.last_10_hit_rate}% last 10</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Average vs Line */}
                        {propHistory.summary.average_actual !== null && propHistory.summary.average_line !== null && (
                          <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/50">
                            <div className="text-xs text-slate-400 mb-2">Line Value</div>
                            <div className="text-sm text-slate-200">
                              {propHistory.summary.average_actual > propHistory.summary.average_line ? (
                                <>
                                  <span className="font-bold text-green-400">Averaging {Math.abs(propHistory.summary.average_actual - propHistory.summary.average_line).toFixed(1)} over</span>
                                  {` the line`}
                                </>
                              ) : (
                                <>
                                  <span className="font-bold text-red-400">Averaging {Math.abs(propHistory.summary.average_actual - propHistory.summary.average_line).toFixed(1)} under</span>
                                  {` the line`}
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Overall Confidence */}
                        <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/50">
                          <div className="text-xs text-slate-400 mb-2">Confidence Level</div>
                          <div className="text-sm text-slate-200">
                            {propHistory.summary.hit_rate >= 60 ? (
                              <span className="font-bold text-green-400">⭐⭐⭐ High confidence</span>
                            ) : propHistory.summary.hit_rate >= 55 ? (
                              <span className="font-bold text-green-400">⭐⭐ Good confidence</span>
                            ) : propHistory.summary.hit_rate >= 50 ? (
                              <span className="font-bold text-yellow-400">⭐ Moderate confidence</span>
                            ) : (
                              <span className="font-bold text-red-400">⚠️ Low confidence</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Sample Size Warning */}
                      {propHistory.summary.games_with_props < 10 && (
                        <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg">
                          <div className="flex items-center gap-2 text-yellow-400 text-xs">
                            <span>⚠️</span>
                            <span>Limited sample size ({propHistory.summary.games_with_props} games). More data needed for reliable insights.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Game-by-Game Table */}
                  {propHistory.games && propHistory.games.length > 0 ? (
                    <div>
                      <h4 className="text-lg font-bold mb-3">Game-by-Game Performance</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b-2 border-slate-700">
                            <tr className="text-left">
                              <th className="pb-3 font-semibold">Date</th>
                              <th className="pb-3 font-semibold">Opponent</th>
                              <th className="pb-3 font-semibold text-center">Location</th>
                              <th className="pb-3 font-semibold text-center">Actual</th>
                              <th className="pb-3 font-semibold text-center">Line</th>
                              <th className="pb-3 font-semibold text-center">Result</th>
                              <th className="pb-3 font-semibold text-center">Odds</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700">
                            {propHistory.games.map((game: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-700/50 transition-colors">
                                <td className="py-3 font-medium">{game.game_date}</td>
                                <td className="py-3">
                                  <div className="flex items-center gap-2">
                                    {game.opponent_logo && (
                                      <img
                                        src={game.opponent_logo}
                                        alt={game.opponent}
                                        className="w-6 h-6 object-contain"
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                      />
                                    )}
                                    <span>{game.opponent}</span>
                                  </div>
                                </td>
                                <td className="py-3 text-center">
                                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                                    game.location === 'home'
                                      ? 'bg-blue-500/20 text-blue-400'
                                      : 'bg-purple-500/20 text-purple-400'
                                  }`}>
                                    {game.location === 'home' ? '🏠 Home' : '✈️ Away'}
                                  </span>
                                </td>
                                <td className="py-3 text-center text-orange-400 font-bold text-lg">
                                  {game.actual !== null ? game.actual : '-'}
                                </td>
                                <td className="py-3 text-center text-slate-300 font-semibold">
                                  {game.line !== null ? game.line : '-'}
                                </td>
                                <td className="py-3 text-center">
                                  {game.hit_over !== null ? (
                                    <span className={`px-3 py-1 rounded font-bold ${
                                      game.hit_over
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                                        : 'bg-red-500/20 text-red-400 border border-red-500/50'
                                    }`}>
                                      {game.hit_over ? '✓ Over' : '✗ Under'}
                                    </span>
                                  ) : (
                                    <span className="text-slate-600">No Line</span>
                                  )}
                                </td>
                                <td className="py-3 text-center text-xs">
                                  {game.over_odds || game.under_odds ? (
                                    <div className="space-y-0.5">
                                      <div className={game.over_odds ? 'text-green-400 font-semibold' : 'text-slate-600'}>
                                        O: {game.over_odds || '-'}
                                      </div>
                                      <div className={game.under_odds ? 'text-red-400 font-semibold' : 'text-slate-600'}>
                                        U: {game.under_odds || '-'}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-slate-600">-</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-slate-400 py-8">
                      No prop betting data available for this selection
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-slate-400 py-12">
                  No prop betting data available for this player
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
