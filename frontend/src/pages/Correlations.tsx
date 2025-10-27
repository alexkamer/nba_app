import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

const STAT_OPTIONS = [
  { value: 'points', label: 'Points' },
  { value: 'rebounds', label: 'Rebounds' },
  { value: 'assists', label: 'Assists' },
  { value: 'steals', label: 'Steals' },
  { value: 'blocks', label: 'Blocks' },
  { value: 'turnovers', label: 'Turnovers' },
];

export default function Correlations() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [selectedPlayer1, setSelectedPlayer1] = useState<any>(null);
  const [selectedPlayer2, setSelectedPlayer2] = useState<any>(null);
  const [player1Stat, setPlayer1Stat] = useState('points');
  const [player2Stat, setPlayer2Stat] = useState('assists');
  const [season, setSeason] = useState('2025');
  const [showResults, setShowResults] = useState(false);
  const [homeAwayFilter, setHomeAwayFilter] = useState<'all' | 'home' | 'away'>('all');
  const [isRestoringState, setIsRestoringState] = useState(true);

  const queryClient = useQueryClient();

  // Fetch standings to get team list
  const { data: standings } = useQuery({
    queryKey: ['standings'],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/teams/live/standings`);
      return data;
    },
  });

  // Restore state from URL on mount
  useEffect(() => {
    if (!standings) return;

    const teamId = searchParams.get('team');
    const p1Id = searchParams.get('p1');
    const p2Id = searchParams.get('p2');
    const p1Stat = searchParams.get('p1stat');
    const p2Stat = searchParams.get('p2stat');
    const analyzed = searchParams.get('analyzed') === 'true';

    if (teamId) {
      // Find team in standings
      const allTeams = [
        ...(standings.eastern_conference || []),
        ...(standings.western_conference || [])
      ];
      const team = allTeams.find((t: any) => t.team_id === teamId);
      if (team) {
        setSelectedTeam(team);
      }
    }

    if (p1Stat) setPlayer1Stat(p1Stat);
    if (p2Stat) setPlayer2Stat(p2Stat);
    if (analyzed) setShowResults(true);

    setIsRestoringState(false);
  }, [standings, searchParams]);

  // Fetch team roster when team is selected
  const { data: roster, isLoading: isLoadingRoster } = useQuery({
    queryKey: ['team-roster', selectedTeam?.team_id],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/teams/live/${selectedTeam.team_id}/roster`);
      return data;
    },
    enabled: !!selectedTeam,
  });

  // Restore players from URL after roster loads
  useEffect(() => {
    if (!roster || isRestoringState) return;

    const p1Id = searchParams.get('p1');
    const p2Id = searchParams.get('p2');

    if (p1Id && !selectedPlayer1) {
      const player = roster.roster?.find((p: any) => p.athlete_id === p1Id);
      if (player) setSelectedPlayer1(player);
    }

    if (p2Id && !selectedPlayer2) {
      const player = roster.roster?.find((p: any) => p.athlete_id === p2Id);
      if (player) setSelectedPlayer2(player);
    }
  }, [roster, searchParams, isRestoringState, selectedPlayer1, selectedPlayer2]);

  // Correlation analysis
  const { data: correlation, isLoading: isLoadingCorrelation, refetch: analyzeCorrelation } = useQuery({
    queryKey: ['correlation', selectedPlayer1?.athlete_id, player1Stat, selectedPlayer2?.athlete_id, player2Stat, season],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/stats/correlation`, {
        params: {
          player1_id: selectedPlayer1.athlete_id,
          player1_stat: player1Stat,
          player2_id: selectedPlayer2.athlete_id,
          player2_stat: player2Stat,
          season: season,
          min_games: 3  // Minimum of 3 games from last 10 regular season games
        }
      });
      return data;
    },
    enabled: false, // Manual trigger
  });

  // Teammate correlations
  const { data: teammateCorrelations, isLoading: isLoadingTeammates, refetch: findTeammates } = useQuery({
    queryKey: ['teammate-correlations', selectedPlayer1?.athlete_id, player1Stat, season, selectedTeam?.team_id],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/stats/correlation/teammates`, {
        params: {
          player_id: selectedPlayer1.athlete_id,
          player_stat: player1Stat,
          season: season,
          team_id: selectedTeam.team_id,
          min_correlation: 0.3
        }
      });
      return data;
    },
    enabled: false,
  });

  // Team-wide best correlation search
  const { data: bestTeamCorr, isLoading: isLoadingBestTeam, refetch: findBestTeamCorr } = useQuery({
    queryKey: ['best-team-correlation', selectedTeam?.team_id, season],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/stats/correlation/team/best`, {
        params: {
          team_id: selectedTeam.team_id,
          season: season,
          min_games: 10
        }
      });
      return data;
    },
    enabled: false,
  });

  // Update URL params whenever state changes
  const updateURLParams = () => {
    const params = new URLSearchParams();

    if (selectedTeam) params.set('team', selectedTeam.team_id);
    if (selectedPlayer1) params.set('p1', selectedPlayer1.athlete_id);
    if (selectedPlayer2) params.set('p2', selectedPlayer2.athlete_id);
    if (player1Stat) params.set('p1stat', player1Stat);
    if (player2Stat) params.set('p2stat', player2Stat);
    if (showResults) params.set('analyzed', 'true');

    setSearchParams(params, { replace: true });
  };

  // Trigger URL update when relevant state changes
  useEffect(() => {
    if (!isRestoringState) {
      updateURLParams();
    }
  }, [selectedTeam, selectedPlayer1, selectedPlayer2, player1Stat, player2Stat, showResults, isRestoringState]);

  const handleAnalyze = () => {
    if (selectedPlayer1 && selectedPlayer2) {
      setShowResults(true);
      // Use setTimeout to ensure state updates before API call
      setTimeout(() => {
        analyzeCorrelation();
      }, 0);
    }
  };

  const handleFindTeammates = () => {
    if (selectedPlayer1) {
      findTeammates();
    }
  };

  const handleTeamChange = (team: any) => {
    setSelectedTeam(team);
    setSelectedPlayer1(null);
    setSelectedPlayer2(null);
    setShowResults(false);
  };

  // Handle best team correlation result
  useEffect(() => {
    if (bestTeamCorr?.best_correlation && roster) {
      const corr = bestTeamCorr.best_correlation;

      // Find both players in the roster
      const player1 = roster.roster?.find((p: any) => p.athlete_id === corr.player1_id);
      const player2 = roster.roster?.find((p: any) => p.athlete_id === corr.player2_id);

      if (player1 && player2) {
        setSelectedPlayer1(player1);
        setPlayer1Stat(corr.player1_stat);
        setSelectedPlayer2(player2);
        setPlayer2Stat(corr.player2_stat);

        // Auto-trigger analysis after state updates
        setTimeout(() => {
          setShowResults(true);
          analyzeCorrelation();
        }, 100);
      }
    }
  }, [bestTeamCorr, roster]);

  const getCorrelationColor = (coefficient: number) => {
    const abs = Math.abs(coefficient);
    if (abs >= 0.7) return 'text-purple-400';
    if (abs >= 0.4) return 'text-blue-400';
    if (abs >= 0.2) return 'text-yellow-400';
    return 'text-slate-400';
  };

  const getCorrelationBg = (coefficient: number) => {
    const abs = Math.abs(coefficient);
    if (abs >= 0.7) return 'bg-purple-500/20 border-purple-500';
    if (abs >= 0.4) return 'bg-blue-500/20 border-blue-500';
    if (abs >= 0.2) return 'bg-yellow-500/20 border-yellow-500';
    return 'bg-slate-500/20 border-slate-500';
  };

  // Get all teams from standings
  const allTeams = standings ? [
    ...(standings.eastern_conference || []),
    ...(standings.western_conference || [])
  ].sort((a, b) => a.team_name.localeCompare(b.team_name)) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h1 className="text-3xl font-black mb-2">🔗 Player Stat Correlations</h1>
        <p className="text-slate-400">
          Select a team, then analyze statistical correlations between teammates to find betting opportunities.
        </p>
      </div>

      {/* Team Selection */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-bold mb-4">1. Select Team</h2>

        {selectedTeam ? (
          <div className="flex items-center gap-4 p-4 bg-orange-500/20 border-2 border-orange-500 rounded-lg">
            <div
              className="flex items-center gap-4 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => navigate(`/team/${selectedTeam.team_id}`)}
              title="View team page"
            >
              {selectedTeam.team_logo && (
                <img src={selectedTeam.team_logo} alt={selectedTeam.team_name} className="w-12 h-12 object-contain" />
              )}
              <div className="flex-1">
                <div className="font-bold text-orange-400 text-lg hover:underline">{selectedTeam.team_name}</div>
                <div className="text-sm text-slate-400">{selectedTeam.wins}-{selectedTeam.losses}</div>
              </div>
            </div>
            <button
              onClick={() => findBestTeamCorr()}
              disabled={isLoadingBestTeam}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-lg transition-colors"
            >
              {isLoadingBestTeam ? 'Finding...' : '🎯 Find Best Correlation'}
            </button>
            <button
              onClick={() => setSelectedTeam(null)}
              className="text-xs text-slate-400 hover:text-white px-3 py-2 bg-slate-700 rounded-lg"
            >
              Change team
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {allTeams.map((team) => (
              <div
                key={team.team_id}
                onClick={() => handleTeamChange(team)}
                className="flex items-center gap-3 p-3 bg-slate-700/30 hover:bg-slate-700 border border-slate-600 hover:border-orange-500 rounded-lg cursor-pointer transition-all hover:scale-105"
              >
                {team.team_logo && (
                  <img src={team.team_logo} alt={team.team_name} className="w-8 h-8 object-contain" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white text-sm truncate">{team.team_abbreviation}</div>
                  <div className="text-xs text-slate-500">{team.wins}-{team.losses}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Player Selection - Only show if team is selected */}
      {selectedTeam && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h2 className="text-xl font-bold mb-4">2. Select Players & Stats</h2>

          {isLoadingRoster ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin h-10 w-10 border-4 border-orange-500 border-t-transparent rounded-full"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Player 1 */}
              <div className="space-y-3">
                <label className="block text-sm font-bold text-slate-400">PLAYER 1</label>

                {selectedPlayer1 ? (
                  <div className="bg-orange-500/20 border-2 border-orange-500 rounded-lg p-3">
                    <div
                      className="flex items-center gap-3 mb-2 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => navigate(`/player/${selectedPlayer1.athlete_id}`)}
                      title="View player profile"
                    >
                      <img
                        src={selectedPlayer1.athlete_headshot}
                        alt={selectedPlayer1.athlete_name}
                        className="w-10 h-10 rounded-full bg-slate-700 object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                      <div>
                        <div className="font-bold text-orange-400 hover:underline">{selectedPlayer1.athlete_name}</div>
                        <div className="text-xs text-slate-400">{selectedPlayer1.position_abbr} • #{selectedPlayer1.jersey}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedPlayer1(null);
                        setShowResults(false);
                        queryClient.removeQueries(['teammate-correlations']);
                      }}
                      className="text-xs text-slate-400 hover:text-white px-3 py-1 bg-slate-700 rounded hover:bg-slate-600 transition-colors"
                    >
                      ✕ Clear
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto bg-slate-700/30 rounded-lg border border-slate-600">
                    {roster?.roster?.map((player: any) => (
                      <div
                        key={player.athlete_id}
                        onClick={() => setSelectedPlayer1(player)}
                        className="flex items-center gap-3 p-3 hover:bg-slate-600 cursor-pointer transition-colors border-b border-slate-600 last:border-b-0"
                      >
                        <img
                          src={player.athlete_headshot}
                          alt={player.athlete_name}
                          className="w-10 h-10 rounded-full bg-slate-700 object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        <div>
                          <div className="font-semibold text-white">{player.athlete_name}</div>
                          <div className="text-xs text-slate-400">{player.position_abbr} • #{player.jersey}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <select
                  value={player1Stat}
                  onChange={(e) => setPlayer1Stat(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {STAT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Player 2 */}
              <div className="space-y-3">
                <label className="block text-sm font-bold text-slate-400">PLAYER 2</label>

                {selectedPlayer2 ? (
                  <div className="bg-orange-500/20 border-2 border-orange-500 rounded-lg p-3">
                    <div
                      className="flex items-center gap-3 mb-2 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => navigate(`/player/${selectedPlayer2.athlete_id}`)}
                      title="View player profile"
                    >
                      <img
                        src={selectedPlayer2.athlete_headshot}
                        alt={selectedPlayer2.athlete_name}
                        className="w-10 h-10 rounded-full bg-slate-700 object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                      <div>
                        <div className="font-bold text-orange-400 hover:underline">{selectedPlayer2.athlete_name}</div>
                        <div className="text-xs text-slate-400">{selectedPlayer2.position_abbr} • #{selectedPlayer2.jersey}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedPlayer2(null);
                        setShowResults(false);
                        queryClient.removeQueries(['teammate-correlations']);
                      }}
                      className="text-xs text-slate-400 hover:text-white px-3 py-1 bg-slate-700 rounded hover:bg-slate-600 transition-colors"
                    >
                      ✕ Clear
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto bg-slate-700/30 rounded-lg border border-slate-600">
                    {roster?.roster?.map((player: any) => (
                      <div
                        key={player.athlete_id}
                        onClick={() => setSelectedPlayer2(player)}
                        className="flex items-center gap-3 p-3 hover:bg-slate-600 cursor-pointer transition-colors border-b border-slate-600 last:border-b-0"
                      >
                        <img
                          src={player.athlete_headshot}
                          alt={player.athlete_name}
                          className="w-10 h-10 rounded-full bg-slate-700 object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        <div>
                          <div className="font-semibold text-white">{player.athlete_name}</div>
                          <div className="text-xs text-slate-400">{player.position_abbr} • #{player.jersey}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <select
                  value={player2Stat}
                  onChange={(e) => setPlayer2Stat(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {STAT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleAnalyze}
              disabled={!selectedPlayer1 || !selectedPlayer2 || isLoadingCorrelation}
              className="px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-lg transition-colors"
            >
              {isLoadingCorrelation ? 'Analyzing...' : '🔍 Analyze Correlation'}
            </button>

            {selectedPlayer1 && !selectedPlayer2 && (
              <button
                onClick={handleFindTeammates}
                disabled={isLoadingTeammates}
                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-lg transition-colors"
              >
                {isLoadingTeammates ? 'Finding...' : '👥 Find Teammate Correlations'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Correlation Results */}
      {showResults && correlation && !correlation.error && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="p-6 border-b border-slate-700 bg-slate-700/30">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Correlation Analysis</h2>

              {/* Home/Away Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 uppercase font-bold">Filter:</span>
                <button
                  onClick={() => setHomeAwayFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    homeAwayFilter === 'all'
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  All Games
                </button>
                <button
                  onClick={() => setHomeAwayFilter('home')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    homeAwayFilter === 'home'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  🏠 Home
                </button>
                <button
                  onClick={() => setHomeAwayFilter('away')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    homeAwayFilter === 'away'
                      ? 'bg-purple-500 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  ✈️ Away
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Main Correlation Display */}
            <div className={`rounded-xl p-6 border-2 ${getCorrelationBg(correlation.correlation.coefficient)}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex-1">
                  <div className="text-sm text-slate-400 mb-1">CORRELATION COEFFICIENT</div>
                  <div className={`text-5xl font-black ${getCorrelationColor(correlation.correlation.coefficient)}`}>
                    {correlation.correlation.coefficient > 0 ? '+' : ''}{correlation.correlation.coefficient}
                  </div>

                  {/* Visual Correlation Strength Bar */}
                  <div className="mt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-slate-400 uppercase font-bold">Strength</span>
                      <div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            Math.abs(correlation.correlation.coefficient) >= 0.7 ? 'bg-purple-500' :
                            Math.abs(correlation.correlation.coefficient) >= 0.4 ? 'bg-blue-500' :
                            Math.abs(correlation.correlation.coefficient) >= 0.2 ? 'bg-yellow-500' :
                            'bg-slate-500'
                          }`}
                          style={{ width: `${Math.abs(correlation.correlation.coefficient) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-300 font-bold min-w-[40px] text-right">
                        {Math.abs(correlation.correlation.coefficient * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right ml-6">
                  <div className={`px-4 py-2 rounded-full text-sm font-bold ${
                    correlation.correlation.strength === 'Strong' ? 'bg-purple-500 text-white' :
                    correlation.correlation.strength === 'Moderate' ? 'bg-blue-500 text-white' :
                    correlation.correlation.strength === 'Weak' ? 'bg-yellow-500 text-black' :
                    'bg-slate-600 text-white'
                  }`}>
                    {correlation.correlation.strength} {correlation.correlation.direction}
                  </div>
                  <div className="text-xs text-slate-400 mt-2">
                    {correlation.correlation.is_significant ? '✓ Statistically Significant' : '✗ Not Significant'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    p-value: {correlation.correlation.p_value}
                  </div>
                  <div className="text-xs text-slate-500">
                    R² = {correlation.correlation.r_squared}
                  </div>
                </div>
              </div>

              <div className="text-slate-300 mb-3">
                {correlation.betting_insight.summary}
              </div>

              <div className={`p-4 rounded-lg ${
                correlation.betting_insight.actionable
                  ? 'bg-green-500/20 border-2 border-green-500'
                  : 'bg-slate-700/50 border border-slate-600'
              }`}>
                <div className="text-sm font-bold text-slate-400 mb-2">
                  {correlation.betting_insight.actionable ? '💡 BETTING INSIGHT' : 'ℹ️ ANALYSIS'}
                </div>
                <div className={correlation.betting_insight.actionable ? 'text-green-400 font-semibold' : 'text-slate-300'}>
                  {correlation.betting_insight.recommendation}
                </div>
              </div>

              {/* Prop Hit Rates */}
              {(() => {
                const player1HitCount = correlation.data.data_points.filter((p: any) => p.player1_hit_over === true).length;
                const player1PropCount = correlation.data.data_points.filter((p: any) => p.player1_line !== null).length;
                const player2HitCount = correlation.data.data_points.filter((p: any) => p.player2_hit_over === true).length;
                const player2PropCount = correlation.data.data_points.filter((p: any) => p.player2_line !== null).length;

                if (player1PropCount === 0 && player2PropCount === 0) return null;

                return (
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    {player1PropCount > 0 && (
                      <div className="bg-slate-700/30 rounded-lg p-4">
                        <div className="text-xs text-slate-400 uppercase font-bold mb-2">
                          {correlation.player1.name} - Prop Hit Rate
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-3xl font-black text-orange-400">
                            {player1PropCount > 0 ? ((player1HitCount / player1PropCount) * 100).toFixed(0) : 0}%
                          </div>
                          <div className="flex-1">
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-orange-500 to-green-500 transition-all"
                                style={{ width: `${player1PropCount > 0 ? (player1HitCount / player1PropCount) * 100 : 0}%` }}
                              />
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {player1HitCount}/{player1PropCount} overs hit
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {player2PropCount > 0 && (
                      <div className="bg-slate-700/30 rounded-lg p-4">
                        <div className="text-xs text-slate-400 uppercase font-bold mb-2">
                          {correlation.player2.name} - Prop Hit Rate
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-3xl font-black text-blue-400">
                            {player2PropCount > 0 ? ((player2HitCount / player2PropCount) * 100).toFixed(0) : 0}%
                          </div>
                          <div className="flex-1">
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all"
                                style={{ width: `${player2PropCount > 0 ? (player2HitCount / player2PropCount) * 100 : 0}%` }}
                              />
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {player2HitCount}/{player2PropCount} overs hit
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Simple Scatter Plot Visualization */}
            {(() => {
              const filteredDataPoints = correlation.data.data_points.filter((p: any) => {
                if (homeAwayFilter === 'all') return true;
                return p.home_away === homeAwayFilter;
              });

              if (filteredDataPoints.length === 0) return null;

              const maxX = Math.max(...filteredDataPoints.map((p: any) => p.player1_value));
              const maxY = Math.max(...filteredDataPoints.map((p: any) => p.player2_value));

              return (
                <div className="bg-slate-700/30 rounded-xl p-6">
                  <div className="text-lg font-bold text-slate-300 mb-4">
                    Scatter Plot: {correlation.player1.name} vs {correlation.player2.name}
                  </div>
                  <div className="relative bg-slate-800/50 rounded-lg p-8 border border-slate-700" style={{ height: '300px' }}>
                    {/* Y-axis label */}
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-slate-400 font-bold uppercase">
                      {correlation.player2.name} - {correlation.player2.stat}
                    </div>

                    {/* X-axis label */}
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs text-slate-400 font-bold uppercase">
                      {correlation.player1.name} - {correlation.player1.stat}
                    </div>

                    {/* Plot area */}
                    <div className="relative w-full h-full pl-8 pb-8">
                      {filteredDataPoints.map((point: any, idx: number) => {
                        const x = (point.player1_value / maxX) * 100;
                        const y = 100 - (point.player2_value / maxY) * 100;

                        return (
                          <div
                            key={idx}
                            className="absolute w-3 h-3 rounded-full bg-orange-500 hover:bg-orange-400 hover:scale-150 transition-all cursor-pointer border-2 border-slate-900"
                            style={{
                              left: `${x}%`,
                              top: `${y}%`,
                              transform: 'translate(-50%, -50%)',
                            }}
                            title={`${correlation.player1.name}: ${point.player1_value} | ${correlation.player2.name}: ${point.player2_value}`}
                          />
                        );
                      })}

                      {/* Trend line (simplified) */}
                      {correlation.correlation.coefficient !== 0 && (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ marginLeft: '32px', marginBottom: '32px' }}>
                          <line
                            x1="0%"
                            y1={correlation.correlation.coefficient > 0 ? '100%' : '0%'}
                            x2="100%"
                            y2={correlation.correlation.coefficient > 0 ? '0%' : '100%'}
                            stroke="#f97316"
                            strokeWidth="2"
                            strokeDasharray="4 4"
                            opacity="0.5"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 mt-2 text-center">
                    {filteredDataPoints.length} games shown • Hover over points for details
                  </div>
                </div>
              );
            })()}

            {/* Player Stats Comparison */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-700/30 rounded-lg p-4">
                <div
                  className="font-bold text-orange-400 mb-3 hover:underline cursor-pointer"
                  onClick={() => navigate(`/player/${correlation.player1.id}`)}
                >
                  {correlation.player1.name}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Stat:</span>
                    <span className="font-semibold text-white capitalize">{correlation.player1.stat}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Average:</span>
                    <span className="font-semibold text-white">{correlation.player1.avg}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Range:</span>
                    <span className="font-semibold text-white">{correlation.player1.min} - {correlation.player1.max}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Std Dev:</span>
                    <span className="font-semibold text-white">{correlation.player1.std}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-700/30 rounded-lg p-4">
                <div
                  className="font-bold text-orange-400 mb-3 hover:underline cursor-pointer"
                  onClick={() => navigate(`/player/${correlation.player2.id}`)}
                >
                  {correlation.player2.name}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Stat:</span>
                    <span className="font-semibold text-white capitalize">{correlation.player2.stat}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Average:</span>
                    <span className="font-semibold text-white">{correlation.player2.avg}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Range:</span>
                    <span className="font-semibold text-white">{correlation.player2.min} - {correlation.player2.max}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Std Dev:</span>
                    <span className="font-semibold text-white">{correlation.player2.std}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Regression Info */}
            <div className="bg-slate-700/30 rounded-lg p-4">
              <div className="text-sm font-bold text-slate-400 mb-2">LINEAR REGRESSION</div>
              <div className="font-mono text-orange-400 mb-2">{correlation.regression.equation}</div>
              <div className="text-sm text-slate-300">{correlation.regression.interpretation}</div>
              <div className="text-xs text-slate-500 mt-2">
                R² = {correlation.correlation.r_squared} • Games: {correlation.data.games_analyzed} • Season: {correlation.data.season}
              </div>
            </div>

            {/* Game by Game Data */}
            {correlation.data.data_points && correlation.data.data_points.length > 0 && (() => {
              const filteredGames = correlation.data.data_points.filter((p: any) => {
                if (homeAwayFilter === 'all') return true;
                return p.home_away === homeAwayFilter;
              });

              if (filteredGames.length === 0) {
                return (
                  <div className="bg-slate-700/30 rounded-lg p-8 text-center">
                    <div className="text-slate-400">
                      No {homeAwayFilter} games found in the last 10 regular season games.
                    </div>
                  </div>
                );
              }

              return (
                <div className="bg-slate-700/30 rounded-lg p-4">
                  <div className="text-sm font-bold text-slate-400 mb-3">
                    GAME-BY-GAME BREAKDOWN ({filteredGames.length} {homeAwayFilter === 'all' ? 'games' : `${homeAwayFilter} games`})
                  </div>
                  <div className="space-y-2">
                    {filteredGames.map((point: any, idx: number) => {
                    const gameDate = new Date(point.game_date);
                    const formattedDate = gameDate.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    });

                    return (
                      <div
                        key={idx}
                        className="bg-slate-800/50 rounded-lg p-4 border border-slate-600 hover:border-orange-500 transition-all cursor-pointer group"
                        onClick={() => navigate(`/game/${point.game_id}`)}
                        title="View game details"
                      >
                        {/* Game Header */}
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700 group-hover:border-slate-600">
                          <div className="flex items-center gap-3">
                            <span className="text-slate-500 text-xs font-bold">
                              {formattedDate}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              point.home_away === 'home'
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-purple-500/20 text-purple-400'
                            }`}>
                              {point.home_away === 'home' ? '🏠 vs' : '✈️ @'} {point.opponent_abbreviation}
                            </span>
                          </div>
                        </div>

                        {/* Player Stats */}
                        <div className="grid grid-cols-2 gap-4">
                          {/* Player 1 */}
                          <div className="space-y-2">
                            <div
                              className="text-xs text-slate-400 uppercase font-bold hover:text-orange-400 transition-colors cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/player/${correlation.player1.id}`);
                              }}
                            >
                              {correlation.player1.name}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-orange-400 font-black text-2xl">{point.player1_value}</span>
                              <span className="text-slate-500 text-xs uppercase">{correlation.player1.stat}</span>
                            </div>
                            {point.player1_line !== null && point.player1_line !== undefined ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500">Line: {point.player1_line}</span>
                                  {point.player1_hit_over !== null && (
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                      point.player1_hit_over
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                                        : 'bg-red-500/20 text-red-400 border border-red-500/50'
                                    }`}>
                                      {point.player1_hit_over ? '✓ Hit' : '✗ Miss'}
                                    </span>
                                  )}
                                </div>
                                {(point.player1_over_odds || point.player1_under_odds) && (
                                  <div className="text-xs text-slate-400">
                                    {point.player1_over_odds && <span>O: {point.player1_over_odds}</span>}
                                    {point.player1_over_odds && point.player1_under_odds && <span className="mx-1">•</span>}
                                    {point.player1_under_odds && <span>U: {point.player1_under_odds}</span>}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-600 italic">No prop available</span>
                            )}
                          </div>

                          {/* Player 2 */}
                          <div className="space-y-2 border-l border-slate-700 pl-4">
                            <div
                              className="text-xs text-slate-400 uppercase font-bold hover:text-blue-400 transition-colors cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/player/${correlation.player2.id}`);
                              }}
                            >
                              {correlation.player2.name}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-blue-400 font-black text-2xl">{point.player2_value}</span>
                              <span className="text-slate-500 text-xs uppercase">{correlation.player2.stat}</span>
                            </div>
                            {point.player2_line !== null && point.player2_line !== undefined ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500">Line: {point.player2_line}</span>
                                  {point.player2_hit_over !== null && (
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                      point.player2_hit_over
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                                        : 'bg-red-500/20 text-red-400 border border-red-500/50'
                                    }`}>
                                      {point.player2_hit_over ? '✓ Hit' : '✗ Miss'}
                                    </span>
                                  )}
                                </div>
                                {(point.player2_over_odds || point.player2_under_odds) && (
                                  <div className="text-xs text-slate-400">
                                    {point.player2_over_odds && <span>O: {point.player2_over_odds}</span>}
                                    {point.player2_over_odds && point.player2_under_odds && <span className="mx-1">•</span>}
                                    {point.player2_under_odds && <span>U: {point.player2_under_odds}</span>}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-600 italic">No prop available</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
            })()}
          </div>
        </div>
      )}

      {/* Error Message */}
      {showResults && correlation && correlation.error && (
        <div className="bg-red-500/20 border-2 border-red-500 rounded-xl p-6">
          <div className="text-red-400 font-bold mb-2">⚠️ Analysis Error</div>
          <div className="text-slate-300">{correlation.error}</div>
        </div>
      )}

      {/* Teammate Correlations - Only show when NOT analyzing a specific correlation */}
      {!showResults && teammateCorrelations && teammateCorrelations.top_correlations && teammateCorrelations.top_correlations.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="p-6 border-b border-slate-700 bg-slate-700/30">
            <h2 className="text-2xl font-bold">Teammate Correlations</h2>
            <p className="text-slate-400 text-sm mt-1">
              Found {teammateCorrelations.correlations_found} correlations for {selectedPlayer1?.athlete_name}'s {player1Stat}
            </p>
          </div>

          <div className="p-6">
            {/* Best Correlation Recommendation */}
            {teammateCorrelations.best_correlation && (
              <div className="mb-6">
                <div
                  className="relative bg-gradient-to-br from-yellow-500/10 via-orange-500/10 to-green-500/10 border-2 border-yellow-500 rounded-xl p-6 hover:scale-[1.02] transition-all cursor-pointer shadow-lg shadow-yellow-500/20"
                  onClick={() => {
                    const corr = teammateCorrelations.best_correlation;
                    const player = roster?.roster?.find((p: any) => p.athlete_id === corr.teammate_id);
                    if (player) {
                      setSelectedPlayer2(player);
                      setPlayer2Stat(corr.teammate_stat);
                      setTimeout(() => {
                        setShowResults(true);
                        analyzeCorrelation();
                      }, 100);
                    }
                  }}
                >
                  {/* Trophy Badge */}
                  <div className="absolute -top-3 -right-3 bg-yellow-500 text-slate-900 rounded-full w-12 h-12 flex items-center justify-center font-black text-2xl shadow-lg">
                    🎯
                  </div>

                  {/* Header */}
                  <div className="mb-4">
                    <div className="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-2">
                      ⭐ Best Correlation Found
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-2xl font-black text-white mb-1">
                          {teammateCorrelations.best_correlation.teammate_name}
                        </div>
                        <div className="text-sm text-slate-300 capitalize">
                          {teammateCorrelations.best_correlation.teammate_stat}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-5xl font-black ${getCorrelationColor(teammateCorrelations.best_correlation.correlation)}`}>
                          {teammateCorrelations.best_correlation.correlation > 0 ? '+' : ''}{teammateCorrelations.best_correlation.correlation.toFixed(3)}
                        </div>
                        <div className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold ${
                          teammateCorrelations.best_correlation.strength === 'Strong' ? 'bg-purple-500 text-white' :
                          teammateCorrelations.best_correlation.strength === 'Moderate' ? 'bg-blue-500 text-white' :
                          'bg-yellow-500 text-black'
                        }`}>
                          {teammateCorrelations.best_correlation.strength}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Reasoning */}
                  <div className="bg-slate-800/50 rounded-lg p-4 border border-yellow-500/30 mb-4">
                    <div className="text-xs font-bold text-yellow-400 uppercase mb-2">Why This is Best:</div>
                    <div className="text-slate-200 text-sm leading-relaxed">
                      {teammateCorrelations.best_correlation.reasoning}
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span>
                        {teammateCorrelations.best_correlation.games_together} games analyzed
                      </span>
                      <span className={teammateCorrelations.best_correlation.is_significant ? 'text-green-400' : 'text-slate-500'}>
                        {teammateCorrelations.best_correlation.is_significant ? '✓ Significant' : '✗ Not significant'}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-yellow-400 uppercase tracking-wider">
                      Click to analyze →
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="mt-6 mb-4 flex items-center gap-3">
                  <div className="h-px bg-slate-700 flex-1"></div>
                  <span className="text-xs text-slate-500 uppercase font-bold">All Correlations</span>
                  <div className="h-px bg-slate-700 flex-1"></div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {teammateCorrelations.top_correlations.map((corr: any, idx: number) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border-2 ${getCorrelationBg(corr.correlation)} hover:scale-[1.02] transition-transform cursor-pointer`}
                  onClick={() => {
                    // Find the player in the roster
                    const player = roster?.roster?.find((p: any) => p.athlete_id === corr.teammate_id);
                    if (player) {
                      setSelectedPlayer2(player);
                      setPlayer2Stat(corr.teammate_stat);
                      // Auto-trigger analysis after state updates
                      setTimeout(() => {
                        setShowResults(true);
                        analyzeCorrelation();
                      }, 100);
                    }
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-bold text-white">{corr.teammate_name}</div>
                      <div className="text-sm text-slate-400 capitalize">{corr.teammate_stat}</div>
                    </div>
                    <div className={`text-2xl font-black ${getCorrelationColor(corr.correlation)}`}>
                      {corr.correlation > 0 ? '+' : ''}{corr.correlation.toFixed(3)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className={`text-xs px-2 py-1 rounded ${
                      corr.strength === 'Strong' ? 'bg-purple-500/50 text-white' :
                      corr.strength === 'Moderate' ? 'bg-blue-500/50 text-white' :
                      'bg-yellow-500/50 text-black'
                    }`}>
                      {corr.strength}
                    </div>
                    <div className="text-xs text-slate-400">
                      {corr.games_together} games • {corr.is_significant ? 'Significant' : 'Not significant'}
                    </div>
                  </div>
                  <div className="text-xs text-slate-300 mt-2">{corr.recommendation}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
