import { useQuery } from '@tanstack/react-query';
import { predictionsAPI, scheduleAPI } from '../lib/api';
import { useState } from 'react';
import { Link } from 'react-router-dom';

interface Prediction {
  athlete_id: string;
  player_name: string;
  team_name?: string;
  game_id: string;
  stat_type: string;
  prediction: number;
  vegas_line?: number;
  edge?: number;
  confidence: string;
  recommendation?: string;
  model_type: string;
  factors: string[];
}

interface Game {
  game_id: string;
  name: string;
  short_name: string;
  date: string;
  home_team: {
    id: string;
    name: string;
    abbreviation: string;
    logo: string;
    record: string;
  };
  away_team: {
    id: string;
    name: string;
    abbreviation: string;
    logo: string;
    record: string;
  };
  status: {
    state: string;
    detail: string;
    short_detail: string;
  };
  odds?: {
    provider: string;
    details: string;
    over_under: number;
    spread: number;
  };
}

export default function Predictions() {
  const [statType, setStatType] = useState<'all' | 'points' | 'rebounds' | 'assists'>('all');
  const [viewMode, setViewMode] = useState<'today' | 'sample' | 'edges'>('today');

  // Fetch today's games
  const { data: todaySchedule, isLoading: loadingSchedule } = useQuery({
    queryKey: ['schedule-today'],
    queryFn: () => scheduleAPI.getTodaySchedule(),
    enabled: viewMode === 'today',
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  // Fetch predictions for today's games
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  const { data: todayPredictions, isLoading: loadingTodayPredictions } = useQuery({
    queryKey: ['predictions-today', selectedGameId, statType],
    queryFn: async () => {
      if (!selectedGameId) return null;
      // Fetch all stat types to show all available props
      return predictionsAPI.getGamePredictions(selectedGameId, 'points,rebounds,assists');
    },
    enabled: viewMode === 'today' && !!selectedGameId,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const { data: samplePredictions, isLoading: loadingSample } = useQuery({
    queryKey: ['predictions-sample', statType],
    queryFn: () => predictionsAPI.getSample('2024', 10),
    enabled: viewMode === 'sample',
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    retry: 1,
  });

  const { data: edgePredictions, isLoading: loadingEdges } = useQuery({
    queryKey: ['predictions-edges', statType],
    queryFn: () => predictionsAPI.getBiggestEdges('2024', statType, 2.0, 20),
    enabled: viewMode === 'edges',
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    retry: 1,
  });

  // Filter predictions by stat type on the frontend
  let predictions = viewMode === 'today' ? todayPredictions : viewMode === 'sample' ? samplePredictions : edgePredictions;

  // Apply stat type filter for today's view (since we fetch all types)
  if (viewMode === 'today' && predictions && statType !== 'all') {
    predictions = predictions.filter((p: Prediction) => p.stat_type === statType);
  }

  // For today's view, only show Over/Under recommendations (filter out Pass)
  if (viewMode === 'today' && predictions) {
    predictions = predictions.filter((p: Prediction) =>
      p.recommendation === 'Over' || p.recommendation === 'Under'
    );
  }

  const isLoading = viewMode === 'today' ? (loadingSchedule || loadingTodayPredictions) : viewMode === 'sample' ? loadingSample : loadingEdges;

  const getConfidenceBadge = (confidence: string) => {
    const colors = {
      High: 'bg-green-500/20 text-green-400 border-green-500/30',
      Medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      Low: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return colors[confidence as keyof typeof colors] || colors.Low;
  };

  const getRecommendationBadge = (recommendation: string, edge?: number) => {
    if (recommendation === 'Over') {
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    } else if (recommendation === 'Under') {
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    } else if (recommendation === 'Pass') {
      return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
    return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };

  const getStatColor = (type?: string) => {
    const colors = {
      points: 'text-orange-500',
      rebounds: 'text-green-500',
      assists: 'text-blue-500',
    };
    // If type is provided, use it; otherwise use the selected statType
    const statToUse = type || (statType === 'all' ? 'points' : statType);
    return colors[statToUse as keyof typeof colors] || colors.points;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold mb-2">
          Player Prop Predictions
        </h1>
        <p className="text-slate-400">
          Vegas+ Hybrid Model: Combining Vegas lines with statistical analysis
        </p>
      </div>

      {/* Controls */}
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          {/* Stat Type Selector */}
          <div>
            <label className="text-sm text-slate-400 mb-2 block">Stat Type</label>
            <div className="flex gap-2">
              {(['all', 'points', 'rebounds', 'assists'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setStatType(type)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    statType === type
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {type === 'all' ? 'All Props' : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* View Mode Selector */}
          <div>
            <label className="text-sm text-slate-400 mb-2 block">View</label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setViewMode('today');
                  setSelectedGameId(null);
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  viewMode === 'today'
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Today's Games
              </button>
              <button
                onClick={() => setViewMode('edges')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  viewMode === 'edges'
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Biggest Edges
              </button>
              <button
                onClick={() => setViewMode('sample')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  viewMode === 'sample'
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Recent Predictions
              </button>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-4 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
          <div className="flex items-start gap-3">
            <div className="text-2xl">ℹ️</div>
            <div className="text-sm">
              <p className="text-slate-300 font-medium mb-1">How it works:</p>
              <p className="text-slate-400">
                Our Vegas+ model combines 65% Vegas line + 35% statistical analysis.
                {viewMode === 'today' && (
                  <span> We only show props where we recommend <strong className="text-green-400">Over</strong> or <strong className="text-blue-400">Under</strong> - these are the best betting opportunities where our model has found an edge.</span>
                )}
                {viewMode !== 'today' && (
                  <span> We highlight "edges" where our model disagrees with Vegas - these represent potential betting opportunities when our statistical analysis catches trends Vegas may have missed.</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Games Selector */}
      {viewMode === 'today' && todaySchedule && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Select a Game</h2>
          {todaySchedule.games && todaySchedule.games.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {todaySchedule.games.map((game: Game) => (
                <button
                  key={game.game_id}
                  onClick={() => setSelectedGameId(game.game_id)}
                  className={`bg-slate-800 rounded-lg p-6 border transition-all hover:scale-[1.02] text-left ${
                    selectedGameId === game.game_id
                      ? 'border-orange-500 shadow-lg shadow-orange-500/20'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {/* Game Info */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm text-slate-400">{game.status.short_detail}</div>
                    {game.odds && (
                      <div className="text-xs text-slate-500">
                        O/U: {game.odds.over_under}
                      </div>
                    )}
                  </div>

                  {/* Teams */}
                  <div className="space-y-3">
                    {/* Away Team */}
                    <div className="flex items-center gap-3">
                      <img
                        src={game.away_team.logo}
                        alt={game.away_team.name}
                        className="w-10 h-10"
                      />
                      <div className="flex-1">
                        <div className="font-bold text-white">{game.away_team.name}</div>
                        <div className="text-sm text-slate-400">{game.away_team.record}</div>
                      </div>
                    </div>

                    <div className="text-center text-slate-500 font-bold">@</div>

                    {/* Home Team */}
                    <div className="flex items-center gap-3">
                      <img
                        src={game.home_team.logo}
                        alt={game.home_team.name}
                        className="w-10 h-10"
                      />
                      <div className="flex-1">
                        <div className="font-bold text-white">{game.home_team.name}</div>
                        <div className="text-sm text-slate-400">{game.home_team.record}</div>
                      </div>
                    </div>
                  </div>

                  {game.odds && (
                    <div className="mt-4 pt-4 border-t border-slate-700 text-sm text-slate-400">
                      {game.odds.details} • {game.odds.provider}
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-slate-800 rounded-lg p-12 border border-slate-700 text-center">
              <div className="text-4xl mb-4">📅</div>
              <p className="text-slate-400 mb-2">No games scheduled for today</p>
            </div>
          )}
        </div>
      )}

      {/* Predictions List */}
      {viewMode === 'today' && selectedGameId && todaySchedule && (
        <div className="mb-4">
          <h2 className="text-2xl font-bold">
            {todaySchedule.games.find((g: Game) => g.game_id === selectedGameId)?.short_name} - Predictions
          </h2>
        </div>
      )}

      {viewMode === 'today' && !selectedGameId ? (
        <div className="bg-slate-800 rounded-lg p-12 border border-slate-700 text-center">
          <div className="text-4xl mb-4">👆</div>
          <p className="text-slate-400 mb-2">Select a game to view predictions</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="bg-slate-800 rounded-lg p-6 border border-slate-700 animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="h-6 bg-slate-700 rounded w-48 mb-3"></div>
                  <div className="h-4 bg-slate-700 rounded w-32"></div>
                </div>
                <div className="h-16 w-16 bg-slate-700 rounded-lg"></div>
              </div>
            </div>
          ))}
        </div>
      ) : predictions && predictions.length > 0 ? (
        <div className="space-y-4">
          {predictions.map((pred: Prediction, idx: number) => (
            <div
              key={`${pred.athlete_id}-${pred.game_id}-${pred.stat_type}-${idx}`}
              className="bg-slate-800 rounded-lg p-6 border border-slate-700 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-6">
                {/* Player Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <Link
                      to={`/player/${pred.athlete_id}`}
                      className="text-xl font-bold hover:text-orange-500 transition-colors"
                    >
                      {pred.player_name}
                    </Link>
                    {pred.team_name && (
                      <span className="text-sm text-slate-400">
                        {pred.team_name}
                      </span>
                    )}
                  </div>

                  {/* Stat Type Badge */}
                  <div className="mb-3">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatColor(pred.stat_type)} bg-slate-700/50`}>
                      {pred.stat_type.charAt(0).toUpperCase() + pred.stat_type.slice(1)}
                    </span>
                  </div>

                  {/* Prediction vs Vegas */}
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <div className="text-sm text-slate-400 mb-1">Our Prediction</div>
                      <div className={`text-2xl font-bold ${getStatColor(pred.stat_type)}`}>
                        {pred.prediction}
                      </div>
                    </div>
                    {pred.vegas_line && (
                      <>
                        <div>
                          <div className="text-sm text-slate-400 mb-1">Vegas Line</div>
                          <div className="text-2xl font-bold text-slate-300">
                            {pred.vegas_line}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-slate-400 mb-1">Edge</div>
                          <div
                            className={`text-2xl font-bold ${
                              pred.edge && pred.edge > 0
                                ? 'text-green-400'
                                : 'text-blue-400'
                            }`}
                          >
                            {pred.edge && pred.edge > 0 ? '+' : ''}
                            {pred.edge?.toFixed(1)}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${getConfidenceBadge(
                        pred.confidence
                      )}`}
                    >
                      {pred.confidence} Confidence
                    </span>
                    {pred.recommendation && pred.recommendation !== 'No Line Available' && (
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${getRecommendationBadge(
                          pred.recommendation,
                          pred.edge
                        )}`}
                      >
                        Recommend: {pred.recommendation}
                      </span>
                    )}
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-700 text-slate-300">
                      {pred.model_type}
                    </span>
                  </div>

                  {/* Factors */}
                  {pred.factors && pred.factors.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-slate-400 hover:text-slate-300">
                        View prediction factors
                      </summary>
                      <ul className="mt-2 space-y-1 text-slate-400 ml-4">
                        {pred.factors.map((factor, i) => (
                          <li key={i} className="list-disc">
                            {factor}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>

                {/* Visual Indicator */}
                {pred.edge && Math.abs(pred.edge) >= 2.0 && (
                  <div className="flex flex-col items-center justify-center">
                    <div
                      className={`text-4xl mb-2 ${
                        pred.edge > 0 ? 'text-green-400' : 'text-blue-400'
                      }`}
                    >
                      {pred.edge > 0 ? '↗️' : '↘️'}
                    </div>
                    <div className="text-xs text-slate-400 text-center">
                      {Math.abs(pred.edge).toFixed(1)}
                      <br />
                      edge
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg p-12 border border-slate-700 text-center">
          <div className="text-4xl mb-4">✅</div>
          <p className="text-slate-400 mb-2">
            {viewMode === 'today' ? 'No actionable bets found for this game' : 'No predictions available'}
          </p>
          <p className="text-sm text-slate-500">
            {viewMode === 'today'
              ? 'We only show props where we recommend Over or Under. Try selecting a different stat type or another game.'
              : 'Try selecting a different stat type or view mode'}
          </p>
        </div>
      )}

      {/* Footer Info */}
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h3 className="font-bold mb-3 text-lg">About Our Predictions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-400">
          <div>
            <p className="font-medium text-slate-300 mb-1">Model Accuracy</p>
            <p>Points: ~57% within ±5</p>
            <p>Rebounds: ~95% within ±5</p>
            <p>Assists: ~98% within ±5</p>
          </div>
          <div>
            <p className="font-medium text-slate-300 mb-1">What to look for</p>
            <p>• High confidence + Large edge = Strong signal</p>
            <p>• Recent form trending up/down</p>
            <p>• Our model catching momentum shifts</p>
          </div>
        </div>
      </div>
    </div>
  );
}
