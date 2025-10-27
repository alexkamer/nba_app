import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useState } from 'react';
import PlayerImage from '../components/PlayerImage';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

export default function LiveGame() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [selectedQuarter, setSelectedQuarter] = useState<string>('all');
  const [scoringOnly, setScoringOnly] = useState(false);
  const [awaySortColumn, setAwaySortColumn] = useState<string | null>(null);
  const [awaySortDirection, setAwaySortDirection] = useState<'asc' | 'desc'>('desc');
  const [homeSortColumn, setHomeSortColumn] = useState<string | null>(null);
  const [homeSortDirection, setHomeSortDirection] = useState<'asc' | 'desc'>('desc');

  // Fetch live boxscore data
  const { data: liveData, isLoading } = useQuery({
    queryKey: ['live-game', gameId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/games/${gameId}/live`);
      return data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch play-by-play data from live endpoint
  const { data: playByPlay, isLoading: isLoadingPlays } = useQuery({
    queryKey: ['live-plays', gameId, selectedQuarter, scoringOnly],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedQuarter !== 'all') {
        params.append('quarter', selectedQuarter);
      }
      if (scoringOnly) {
        params.append('scoring_only', 'true');
      }
      const { data } = await axios.get(`${API_BASE_URL}/games/${gameId}/live-plays?${params.toString()}`);
      return data;
    },
    enabled: !!gameId,
    refetchInterval: 30000, // Refresh every 30 seconds like the live data
  });

  if (isLoading || !liveData) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-16 w-16 border-4 border-green-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const awayTeam = liveData.away_team;
  const homeTeam = liveData.home_team;
  const status = liveData.status;

  // Helper to sort players by column
  const sortPlayers = (players: any[], sortColumn: string | null, sortDirection: 'asc' | 'desc') => {
    if (!sortColumn) return players;

    return [...players].sort((a, b) => {
      let aVal = a.stats?.[sortColumn] || '0';
      let bVal = b.stats?.[sortColumn] || '0';

      // Handle shooting stats (e.g., "5-10" format)
      if (typeof aVal === 'string' && aVal.includes('-')) {
        aVal = parseInt(aVal.split('-')[0]);
        bVal = parseInt(bVal.split('-')[0]);
      } else {
        aVal = parseFloat(aVal);
        bVal = parseFloat(bVal);
      }

      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
  };

  // Helper to handle column header click
  const handleSort = (column: string, team: 'away' | 'home') => {
    if (team === 'away') {
      if (awaySortColumn === column) {
        setAwaySortDirection(awaySortDirection === 'desc' ? 'asc' : 'desc');
      } else {
        setAwaySortColumn(column);
        setAwaySortDirection('desc');
      }
    } else {
      if (homeSortColumn === column) {
        setHomeSortDirection(homeSortDirection === 'desc' ? 'asc' : 'desc');
      } else {
        setHomeSortColumn(column);
        setHomeSortDirection('desc');
      }
    }
  };

  // Separate starters and bench players
  let awayStarters = liveData.away_players?.filter((p: any) => p.starter) || [];
  let awayBench = liveData.away_players?.filter((p: any) => !p.starter) || [];
  let homeStarters = liveData.home_players?.filter((p: any) => p.starter) || [];
  let homeBench = liveData.home_players?.filter((p: any) => !p.starter) || [];

  // Apply sorting
  awayStarters = sortPlayers(awayStarters, awaySortColumn, awaySortDirection);
  awayBench = sortPlayers(awayBench, awaySortColumn, awaySortDirection);
  homeStarters = sortPlayers(homeStarters, homeSortColumn, homeSortDirection);
  homeBench = sortPlayers(homeBench, homeSortColumn, homeSortDirection);

  // Helper to get stat value
  const getStat = (team: any, statName: string) => {
    return team?.stats?.[statName] || '--';
  };

  // Helper to calculate total score from linescores
  const getTotalScore = (linescores: any[]) => {
    if (!linescores || linescores.length === 0) return 0;
    return linescores.reduce((sum, score) => sum + parseInt(score.displayValue || '0'), 0);
  };

  // Helper to render player rows
  const renderPlayerRow = (player: any) => (
    <tr
      key={player.athlete_id}
      className="hover:bg-slate-700/50 transition-colors"
    >
      <td className="py-3">
        <div className="flex items-center gap-2">
          <PlayerImage
            src={player.athlete_headshot}
            alt={player.athlete_name}
            className="w-8 h-8 rounded-full bg-slate-700 object-cover"
            fallbackInitial={player.athlete_name.charAt(0)}
          />
          <div>
            <div
              className="font-semibold text-sm text-orange-400 hover:text-orange-300 cursor-pointer transition-colors"
              onClick={() => navigate(`/player/${player.athlete_id}`)}
            >
              {player.athlete_name}
            </div>
            <div className="text-xs text-slate-500">{player.position}</div>
          </div>
        </div>
      </td>
      <td className="py-3 text-center font-medium">{player.stats?.MIN || '0'}</td>
      <td className="py-3 text-center font-black text-orange-400">{player.stats?.PTS || '0'}</td>
      <td className="py-3 text-center font-medium">{player.stats?.REB || '0'}</td>
      <td className="py-3 text-center font-medium">{player.stats?.AST || '0'}</td>
      <td className="py-3 text-center font-medium text-xs">{player.stats?.FG || '0-0'}</td>
      <td className="py-3 text-center font-medium text-xs">{player.stats?.['3PT'] || '0-0'}</td>
      <td className="py-3 text-center font-medium">{player.stats?.STL || '0'}</td>
      <td className="py-3 text-center font-medium">{player.stats?.BLK || '0'}</td>
      <td className="py-3 text-center font-medium">{player.stats?.PF || '0'}</td>
      <td className="py-3 text-center font-medium">{player.stats?.['+/-'] || '0'}</td>
    </tr>
  );

  // Helper to create progress bar
  const getProgressBar = (awayValue: number, homeValue: number, awayLabel: string, homeLabel: string, label: string) => {
    const total = awayValue + homeValue;
    const awayPct = total > 0 ? (awayValue / total) * 100 : 50;
    const homePct = total > 0 ? (homeValue / total) * 100 : 50;

    return (
      <div className="mb-3">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span className="font-semibold">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-16 text-right font-bold">{awayLabel}</div>
          <div className="flex-1 h-6 bg-slate-700 rounded-full overflow-hidden flex">
            <div
              className="bg-orange-500 flex items-center justify-start pl-2 text-xs font-bold text-white"
              style={{ width: `${awayPct}%` }}
            >
              {awayPct > 15 && awayLabel}
            </div>
            <div
              className="bg-blue-500 flex items-center justify-end pr-2 text-xs font-bold text-white"
              style={{ width: `${homePct}%` }}
            >
              {homePct > 15 && homeLabel}
            </div>
          </div>
          <div className="w-16 font-bold">{homeLabel}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/schedule')}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-white transition-colors"
        >
          ← Back to Schedule
        </button>

        {status.state === 'in' && (
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/20 border border-green-500/50 rounded-full text-green-400 text-sm font-bold tracking-wider animate-pulse">
            <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            LIVE - {status.clock}
            {status.period && ` • Q${status.period}`}
          </span>
        )}
      </div>

      {/* Score Section */}
      <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 shadow-xl">
        {/* Score Differential */}
        {liveData.away_linescores && liveData.home_linescores && (
          <div className="text-center mb-4">
            {(() => {
              const awayScore = getTotalScore(liveData.away_linescores);
              const homeScore = getTotalScore(liveData.home_linescores);
              const diff = Math.abs(awayScore - homeScore);

              if (diff === 0) {
                return <div className="text-lg font-bold text-slate-400">Tied</div>;
              }

              const leader = awayScore > homeScore ? awayTeam : homeTeam;
              return (
                <div className="text-lg font-bold text-green-400">
                  {leader?.team_abbreviation} leads by {diff}
                </div>
              );
            })()}
          </div>
        )}

        <div className="flex items-center justify-between gap-8">
          {/* Away Team */}
          <div className="flex-1 flex flex-col items-center">
            {awayTeam?.team_logo && (
              <img
                src={awayTeam.team_logo}
                alt={awayTeam.team_name}
                className="w-24 h-24 object-contain mb-3"
              />
            )}
            <div className="text-center">
              <div className="font-bold text-xl">{awayTeam?.team_abbreviation}</div>
              <div className="text-sm text-slate-500 mt-1">{awayTeam?.team_name}</div>
            </div>
            <div className="text-6xl font-black mt-3 text-white">
              {getTotalScore(liveData.away_linescores)}
            </div>
          </div>

          {/* VS */}
          <div className="text-slate-600 text-2xl font-bold">VS</div>

          {/* Home Team */}
          <div className="flex-1 flex flex-col items-center">
            {homeTeam?.team_logo && (
              <img
                src={homeTeam.team_logo}
                alt={homeTeam.team_name}
                className="w-24 h-24 object-contain mb-3"
              />
            )}
            <div className="text-center">
              <div className="font-bold text-xl">{homeTeam?.team_abbreviation}</div>
              <div className="text-sm text-slate-500 mt-1">{homeTeam?.team_name}</div>
            </div>
            <div className="text-6xl font-black mt-3 text-white">
              {getTotalScore(liveData.home_linescores)}
            </div>
          </div>
        </div>
      </div>

      {/* Game Leaders */}
      {liveData.away_players && liveData.home_players && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold mb-6">Game Leaders</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Points Leader */}
            {(() => {
              const allPlayers = [...(liveData.away_players || []), ...(liveData.home_players || [])];
              const topScorer = allPlayers.reduce((max, player) =>
                (parseInt(player.stats?.PTS || '0') > parseInt(max.stats?.PTS || '0')) ? player : max
              , allPlayers[0]);

              return (
                <div className="bg-slate-700/30 rounded-lg p-4 flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <PlayerImage
                      src={topScorer?.athlete_headshot}
                      alt={topScorer?.athlete_name}
                      className="w-16 h-16 rounded-full bg-slate-700 object-cover ring-2 ring-orange-500"
                      fallbackInitial={topScorer?.athlete_name?.charAt(0) || '?'}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-slate-500 uppercase font-bold mb-1">Points</div>
                    <div
                      className="font-bold text-orange-400 hover:text-orange-300 cursor-pointer transition-colors"
                      onClick={() => navigate(`/player/${topScorer?.athlete_id}`)}
                    >
                      {topScorer?.athlete_name}
                    </div>
                    <div className="text-xs text-slate-500">{topScorer?.position}</div>
                  </div>
                  <div className="text-3xl font-black text-orange-400">
                    {topScorer?.stats?.PTS || '0'}
                  </div>
                </div>
              );
            })()}

            {/* Rebounds Leader */}
            {(() => {
              const allPlayers = [...(liveData.away_players || []), ...(liveData.home_players || [])];
              const topRebounder = allPlayers.reduce((max, player) =>
                (parseInt(player.stats?.REB || '0') > parseInt(max.stats?.REB || '0')) ? player : max
              , allPlayers[0]);

              return (
                <div className="bg-slate-700/30 rounded-lg p-4 flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <PlayerImage
                      src={topRebounder?.athlete_headshot}
                      alt={topRebounder?.athlete_name}
                      className="w-16 h-16 rounded-full bg-slate-700 object-cover ring-2 ring-blue-500"
                      fallbackInitial={topRebounder?.athlete_name?.charAt(0) || '?'}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-slate-500 uppercase font-bold mb-1">Rebounds</div>
                    <div
                      className="font-bold text-orange-400 hover:text-orange-300 cursor-pointer transition-colors"
                      onClick={() => navigate(`/player/${topRebounder?.athlete_id}`)}
                    >
                      {topRebounder?.athlete_name}
                    </div>
                    <div className="text-xs text-slate-500">{topRebounder?.position}</div>
                  </div>
                  <div className="text-3xl font-black text-blue-400">
                    {topRebounder?.stats?.REB || '0'}
                  </div>
                </div>
              );
            })()}

            {/* Assists Leader */}
            {(() => {
              const allPlayers = [...(liveData.away_players || []), ...(liveData.home_players || [])];
              const topAssister = allPlayers.reduce((max, player) =>
                (parseInt(player.stats?.AST || '0') > parseInt(max.stats?.AST || '0')) ? player : max
              , allPlayers[0]);

              return (
                <div className="bg-slate-700/30 rounded-lg p-4 flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <PlayerImage
                      src={topAssister?.athlete_headshot}
                      alt={topAssister?.athlete_name}
                      className="w-16 h-16 rounded-full bg-slate-700 object-cover ring-2 ring-green-500"
                      fallbackInitial={topAssister?.athlete_name?.charAt(0) || '?'}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-slate-500 uppercase font-bold mb-1">Assists</div>
                    <div
                      className="font-bold text-orange-400 hover:text-orange-300 cursor-pointer transition-colors"
                      onClick={() => navigate(`/player/${topAssister?.athlete_id}`)}
                    >
                      {topAssister?.athlete_name}
                    </div>
                    <div className="text-xs text-slate-500">{topAssister?.position}</div>
                  </div>
                  <div className="text-3xl font-black text-green-400">
                    {topAssister?.stats?.AST || '0'}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Quarter by Quarter Linescore */}
      {liveData.away_linescores && liveData.home_linescores && liveData.away_linescores.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold mb-4">Scoring by Quarter</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-center">
              <thead className="border-b-2 border-slate-700">
                <tr>
                  <th className="pb-3 text-left text-slate-400 font-bold uppercase text-sm">Team</th>
                  {liveData.away_linescores.map((score: any, idx: number) => (
                    <th key={idx} className="pb-3 text-slate-400 font-bold uppercase text-sm px-4">
                      Q{idx + 1}
                    </th>
                  ))}
                  <th className="pb-3 text-slate-400 font-bold uppercase text-sm px-4">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-700">
                  <td className="py-4 text-left">
                    <div className="flex items-center gap-2">
                      {awayTeam?.team_logo && (
                        <img src={awayTeam.team_logo} alt={awayTeam.team_abbreviation} className="w-6 h-6 object-contain" />
                      )}
                      <span className="font-semibold">{awayTeam?.team_abbreviation}</span>
                    </div>
                  </td>
                  {liveData.away_linescores.map((score: any, idx: number) => (
                    <td key={idx} className="py-4 font-bold text-lg px-4">{score.displayValue}</td>
                  ))}
                  <td className="py-4 font-black text-xl text-orange-400 px-4">
                    {getTotalScore(liveData.away_linescores)}
                  </td>
                </tr>
                <tr>
                  <td className="py-4 text-left">
                    <div className="flex items-center gap-2">
                      {homeTeam?.team_logo && (
                        <img src={homeTeam.team_logo} alt={homeTeam.team_abbreviation} className="w-6 h-6 object-contain" />
                      )}
                      <span className="font-semibold">{homeTeam?.team_abbreviation}</span>
                    </div>
                  </td>
                  {liveData.home_linescores.map((score: any, idx: number) => (
                    <td key={idx} className="py-4 font-bold text-lg px-4">{score.displayValue}</td>
                  ))}
                  <td className="py-4 font-black text-xl text-orange-400 px-4">
                    {getTotalScore(liveData.home_linescores)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Team Stats Comparison */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
        <h2 className="text-xl font-bold mb-4">Team Statistics</h2>

        {getProgressBar(
          parseFloat(getStat(awayTeam, 'fieldGoalPct')),
          parseFloat(getStat(homeTeam, 'fieldGoalPct')),
          `${getStat(awayTeam, 'fieldGoalPct')}%`,
          `${getStat(homeTeam, 'fieldGoalPct')}%`,
          'Field Goal %'
        )}

        {getProgressBar(
          parseFloat(getStat(awayTeam, 'threePointFieldGoalPct')),
          parseFloat(getStat(homeTeam, 'threePointFieldGoalPct')),
          `${getStat(awayTeam, 'threePointFieldGoalPct')}%`,
          `${getStat(homeTeam, 'threePointFieldGoalPct')}%`,
          '3-Point %'
        )}

        {getProgressBar(
          parseFloat(getStat(awayTeam, 'freeThrowPct')),
          parseFloat(getStat(homeTeam, 'freeThrowPct')),
          `${getStat(awayTeam, 'freeThrowPct')}%`,
          `${getStat(homeTeam, 'freeThrowPct')}%`,
          'Free Throw %'
        )}

        {getProgressBar(
          parseInt(getStat(awayTeam, 'totalRebounds')),
          parseInt(getStat(homeTeam, 'totalRebounds')),
          getStat(awayTeam, 'totalRebounds'),
          getStat(homeTeam, 'totalRebounds'),
          'Rebounds'
        )}

        {getProgressBar(
          parseInt(getStat(awayTeam, 'assists')),
          parseInt(getStat(homeTeam, 'assists')),
          getStat(awayTeam, 'assists'),
          getStat(homeTeam, 'assists'),
          'Assists'
        )}

        {getProgressBar(
          parseInt(getStat(awayTeam, 'turnovers')),
          parseInt(getStat(homeTeam, 'turnovers')),
          getStat(awayTeam, 'turnovers'),
          getStat(homeTeam, 'turnovers'),
          'Turnovers'
        )}

        {getProgressBar(
          parseInt(getStat(awayTeam, 'steals')),
          parseInt(getStat(homeTeam, 'steals')),
          getStat(awayTeam, 'steals'),
          getStat(homeTeam, 'steals'),
          'Steals'
        )}

        {getProgressBar(
          parseInt(getStat(awayTeam, 'blocks')),
          parseInt(getStat(homeTeam, 'blocks')),
          getStat(awayTeam, 'blocks'),
          getStat(homeTeam, 'blocks'),
          'Blocks'
        )}

        {getProgressBar(
          parseInt(getStat(awayTeam, 'fouls')),
          parseInt(getStat(homeTeam, 'fouls')),
          getStat(awayTeam, 'fouls'),
          getStat(homeTeam, 'fouls'),
          'Fouls'
        )}
      </div>

      {/* Player Box Scores */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
        <h2 className="text-xl font-bold mb-6">Box Score</h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Away Team Box Score */}
          <div>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              {awayTeam?.team_logo && (
                <img src={awayTeam.team_logo} alt="" className="w-6 h-6" />
              )}
              {awayTeam?.team_name}
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b-2 border-slate-700">
                  <tr className="text-left">
                    <th className="pb-2 font-bold text-slate-400 uppercase">Player</th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('MIN', 'away')}
                    >
                      MIN {awaySortColumn === 'MIN' && (awaySortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('PTS', 'away')}
                    >
                      PTS {awaySortColumn === 'PTS' && (awaySortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('REB', 'away')}
                    >
                      REB {awaySortColumn === 'REB' && (awaySortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('AST', 'away')}
                    >
                      AST {awaySortColumn === 'AST' && (awaySortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('FG', 'away')}
                    >
                      FG {awaySortColumn === 'FG' && (awaySortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('3PT', 'away')}
                    >
                      3PT {awaySortColumn === '3PT' && (awaySortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('STL', 'away')}
                    >
                      STL {awaySortColumn === 'STL' && (awaySortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('BLK', 'away')}
                    >
                      BLK {awaySortColumn === 'BLK' && (awaySortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('PF', 'away')}
                    >
                      PF {awaySortColumn === 'PF' && (awaySortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('+/-', 'away')}
                    >
                      +/- {awaySortColumn === '+/-' && (awaySortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Starters */}
                  {awayStarters.length > 0 && (
                    <>
                      <tr className="bg-slate-700/30">
                        <td colSpan={11} className="py-2 px-3 text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Starters
                        </td>
                      </tr>
                      {awayStarters.map(renderPlayerRow)}
                    </>
                  )}

                  {/* Bench */}
                  {awayBench.length > 0 && (
                    <>
                      <tr className="bg-slate-700/30">
                        <td colSpan={11} className="py-2 px-3 text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Bench
                        </td>
                      </tr>
                      {awayBench.map(renderPlayerRow)}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Home Team Box Score */}
          <div>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              {homeTeam?.team_logo && (
                <img src={homeTeam.team_logo} alt="" className="w-6 h-6" />
              )}
              {homeTeam?.team_name}
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b-2 border-slate-700">
                  <tr className="text-left">
                    <th className="pb-2 font-bold text-slate-400 uppercase">Player</th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('MIN', 'home')}
                    >
                      MIN {homeSortColumn === 'MIN' && (homeSortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('PTS', 'home')}
                    >
                      PTS {homeSortColumn === 'PTS' && (homeSortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('REB', 'home')}
                    >
                      REB {homeSortColumn === 'REB' && (homeSortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('AST', 'home')}
                    >
                      AST {homeSortColumn === 'AST' && (homeSortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('FG', 'home')}
                    >
                      FG {homeSortColumn === 'FG' && (homeSortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('3PT', 'home')}
                    >
                      3PT {homeSortColumn === '3PT' && (homeSortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('STL', 'home')}
                    >
                      STL {homeSortColumn === 'STL' && (homeSortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('BLK', 'home')}
                    >
                      BLK {homeSortColumn === 'BLK' && (homeSortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('PF', 'home')}
                    >
                      PF {homeSortColumn === 'PF' && (homeSortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      className="pb-2 font-bold text-center text-slate-400 uppercase cursor-pointer hover:text-orange-400 transition-colors"
                      onClick={() => handleSort('+/-', 'home')}
                    >
                      +/- {homeSortColumn === '+/-' && (homeSortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Starters */}
                  {homeStarters.length > 0 && (
                    <>
                      <tr className="bg-slate-700/30">
                        <td colSpan={11} className="py-2 px-3 text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Starters
                        </td>
                      </tr>
                      {homeStarters.map(renderPlayerRow)}
                    </>
                  )}

                  {/* Bench */}
                  {homeBench.length > 0 && (
                    <>
                      <tr className="bg-slate-700/30">
                        <td colSpan={11} className="py-2 px-3 text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Bench
                        </td>
                      </tr>
                      {homeBench.map(renderPlayerRow)}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Injury Report */}
      {(liveData.away_injuries?.length > 0 || liveData.home_injuries?.length > 0) && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold mb-6">Injury Report</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Away Team Injuries */}
            <div>
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                {awayTeam?.team_logo && (
                  <img src={awayTeam.team_logo} alt="" className="w-6 h-6" />
                )}
                {awayTeam?.team_name}
              </h3>

              {liveData.away_injuries?.length > 0 ? (
                <div className="space-y-3">
                  {liveData.away_injuries.map((injury: any) => (
                    <div
                      key={injury.athlete_id}
                      className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg"
                    >
                      <PlayerImage
                        src={injury.athlete_headshot}
                        alt={injury.athlete_name}
                        className="w-12 h-12 rounded-full bg-slate-700 object-cover"
                        fallbackInitial={injury.athlete_name.charAt(0)}
                      />
                      <div className="flex-1">
                        <div
                          className="font-semibold text-sm text-orange-400 hover:text-orange-300 cursor-pointer transition-colors"
                          onClick={() => navigate(`/player/${injury.athlete_id}`)}
                        >
                          {injury.athlete_name}
                        </div>
                        <div className="text-xs text-slate-500">{injury.position}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xs font-bold uppercase px-2 py-1 rounded ${
                          injury.status === 'Out'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {injury.status}
                        </div>
                        {injury.type && (
                          <div className="text-xs text-slate-400 mt-1">{injury.type}</div>
                        )}
                        {injury.details && (
                          <div className="text-xs text-slate-500">{injury.details}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-slate-500 py-4">No injuries reported</div>
              )}
            </div>

            {/* Home Team Injuries */}
            <div>
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                {homeTeam?.team_logo && (
                  <img src={homeTeam.team_logo} alt="" className="w-6 h-6" />
                )}
                {homeTeam?.team_name}
              </h3>

              {liveData.home_injuries?.length > 0 ? (
                <div className="space-y-3">
                  {liveData.home_injuries.map((injury: any) => (
                    <div
                      key={injury.athlete_id}
                      className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg"
                    >
                      <PlayerImage
                        src={injury.athlete_headshot}
                        alt={injury.athlete_name}
                        className="w-12 h-12 rounded-full bg-slate-700 object-cover"
                        fallbackInitial={injury.athlete_name.charAt(0)}
                      />
                      <div className="flex-1">
                        <div
                          className="font-semibold text-sm text-orange-400 hover:text-orange-300 cursor-pointer transition-colors"
                          onClick={() => navigate(`/player/${injury.athlete_id}`)}
                        >
                          {injury.athlete_name}
                        </div>
                        <div className="text-xs text-slate-500">{injury.position}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xs font-bold uppercase px-2 py-1 rounded ${
                          injury.status === 'Out'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {injury.status}
                        </div>
                        {injury.type && (
                          <div className="text-xs text-slate-400 mt-1">{injury.type}</div>
                        )}
                        {injury.details && (
                          <div className="text-xs text-slate-500">{injury.details}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-slate-500 py-4">No injuries reported</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Play-by-Play */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
          <span className="text-green-400">📋</span>
          Play-by-Play
        </h2>

        {/* Filters */}
        <div className="flex gap-4 mb-6 flex-wrap items-center">
          <div className="flex gap-2">
            <span className="text-slate-400 font-semibold text-sm">Quarter:</span>
            {['all', '1', '2', '3', '4'].map((q) => (
              <button
                key={q}
                onClick={() => setSelectedQuarter(q)}
                className={`px-3 py-1 rounded-lg text-sm font-semibold transition-all ${
                  selectedQuarter === q
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {q === 'all' ? 'All' : `Q${q}`}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={scoringOnly}
              onChange={(e) => setScoringOnly(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-slate-300">Scoring plays only</span>
          </label>
        </div>

        {/* Plays List */}
        {isLoadingPlays ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-12 w-12 border-4 border-green-500 border-t-transparent rounded-full"></div>
          </div>
        ) : playByPlay && playByPlay.plays && playByPlay.plays.length > 0 ? (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {[...playByPlay.plays].reverse().map((play: any) => {
              const isScoring = play.scoring_play === '1';
              const isMade = play.text && (play.text.includes('makes') || play.text.includes('made'));

              return (
                <div
                  key={play.play_id}
                  className={`flex items-center gap-4 p-3 rounded-lg ${
                    isScoring
                      ? 'bg-green-500/10 border-l-4 border-green-500'
                      : 'bg-slate-700/30'
                  }`}
                >
                  <div className="flex flex-col items-center min-w-[70px]">
                    <div className="text-xs text-slate-500 font-bold">{play.quarter_display_value?.replace(' Quarter', '')}</div>
                    <div className="text-sm font-mono font-semibold">{play.clock_display_value}</div>
                  </div>

                  {isScoring && play.participant_1_headshot && (
                    <img
                      src={play.participant_1_headshot}
                      alt={play.participant_1_name}
                      className="w-10 h-10 rounded-full bg-slate-700 object-cover ring-2 ring-green-500/50"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}

                  <div className="flex-1">
                    <div className={`text-sm ${isScoring && isMade ? 'font-semibold text-white' : 'text-slate-300'}`}>
                      {play.text}
                    </div>
                    <div className="text-xs text-slate-500">{play.playType_text}</div>
                  </div>

                  <div className="min-w-[60px] text-right">
                    {isScoring ? (
                      <div className="font-black text-green-400">
                        {play.awayScore}-{play.homeScore}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-600">
                        {play.awayScore}-{play.homeScore}
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
          <div className="text-center text-sm text-slate-500 mt-4">
            Showing {playByPlay.plays.length} of {playByPlay.total_plays} plays
          </div>
        )}
      </div>

      {/* Auto-refresh indicator */}
      {status.state === 'in' && (
        <div className="text-center text-xs text-slate-500 pb-4">
          <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2"></span>
          Auto-updating every 30 seconds
        </div>
      )}
    </div>
  );
}
