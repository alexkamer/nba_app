import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useState } from 'react';
import PlayerImage from '../components/PlayerImage';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

interface PropPrediction {
  athlete_id: string;
  player_name: string;
  team_name: string;
  stat_type: string;
  prediction: number;
  vegas_line: number | null;
  edge: number | null;
  confidence: string;
  recommendation: string;
}

export default function GamePreview() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();

  // State for filters
  const [selectedTeam, setSelectedTeam] = useState<'all' | 'away' | 'home'>('all');
  const [selectedPlayer, setSelectedPlayer] = useState<string>('all');
  const [selectedPropTypes, setSelectedPropTypes] = useState<string[]>([]);

  // State for selected prop to show chart
  const [selectedProp, setSelectedProp] = useState<any>(null);
  const [gamesLimit, setGamesLimit] = useState<number>(10);
  const [chartLocationFilter, setChartLocationFilter] = useState<'all' | 'home' | 'away'>('all');
  const [chartStarterFilter, setChartStarterFilter] = useState<'all' | 'yes' | 'no'>('all');

  // State for active tab
  const [activeTab, setActiveTab] = useState<'info' | 'props' | 'parlay'>('info');

  // State for parlay builder
  const [generatedParlays, setGeneratedParlays] = useState<any[]>([]);
  const [betAmount, setBetAmount] = useState<number>(10);
  const [isGeneratingParlays, setIsGeneratingParlays] = useState(false);

  // Fetch game data
  const { data: gameData, isLoading: isLoadingGame } = useQuery({
    queryKey: ['game', gameId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/games/${gameId}/live`);
      return data;
    },
  });

  // Fetch team details
  const { data: awayTeamData } = useQuery({
    queryKey: ['team', gameData?.away_team?.team_id],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/teams/live/${gameData.away_team.team_id}`);
      return data;
    },
    enabled: !!gameData?.away_team?.team_id,
  });

  const { data: homeTeamData } = useQuery({
    queryKey: ['team', gameData?.home_team?.team_id],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/teams/live/${gameData.home_team.team_id}`);
      return data;
    },
    enabled: !!gameData?.home_team?.team_id,
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

  // Fetch predictions
  const { data: predictions } = useQuery({
    queryKey: ['predictions', gameId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/predictions/game/${gameId}`);
      return data;
    },
    enabled: !!gameId,
  });

  // Fetch game odds
  const { data: odds } = useQuery({
    queryKey: ['odds', gameId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/games/${gameId}/odds`);
      return data;
    },
    enabled: !!gameId,
  });

  // Map prop type to stat type for API
  const mapPropTypeToStat = (propType: string): string => {
    const mapping: Record<string, string> = {
      'Total Points': 'points',
      'Total Rebounds': 'rebounds',
      'Total Assists': 'assists',
      'Total Steals': 'steals',
      'Total Blocks': 'blocks',
      'Total 3-Point Field Goals': 'three_pointers'
    };
    return mapping[propType] || 'points';
  };

  // Fetch recent games for selected prop
  const { data: recentGames, isLoading: isLoadingGames } = useQuery({
    queryKey: ['recent-games', selectedProp?.player_id, selectedProp?.type, gamesLimit, chartLocationFilter, chartStarterFilter],
    queryFn: async () => {
      const statType = mapPropTypeToStat(selectedProp.type);
      let url = `${API_BASE_URL}/players/${selectedProp.player_id}/recent-games?stat_type=${statType}&limit=${gamesLimit}`;

      if (chartLocationFilter !== 'all') {
        url += `&location=${chartLocationFilter}`;
      }

      if (chartStarterFilter !== 'all') {
        url += `&starter_status=${chartStarterFilter === 'yes' ? 'starter' : 'bench'}`;
      }

      const { data } = await axios.get(url);
      return data;
    },
    enabled: !!selectedProp?.player_id && !!selectedProp?.type,
  });

  // Fetch teammate impact for injured players
  const { data: teammateImpact } = useQuery({
    queryKey: ['teammate-impact', selectedProp?.player_id, selectedProp?.type, gameData?.away_injuries, gameData?.home_injuries],
    queryFn: async () => {
      if (!selectedProp?.player_id || !selectedProp?.type) return null;

      // Get all injured player IDs from the same team as the selected player
      const allInjuries = [...(gameData?.away_injuries || []), ...(gameData?.home_injuries || [])];

      // Filter injuries to only include players from the selected player's team
      const playerTeamId = selectedProp.team === 'away' ? gameData?.away_team?.team_id : gameData?.home_team?.team_id;
      const teamInjuries = allInjuries.filter((injury: any) => {
        // Determine which team this injured player belongs to
        const injuryTeamId = gameData?.away_injuries?.some((i: any) => i.athlete_id === injury.athlete_id)
          ? gameData?.away_team?.team_id
          : gameData?.home_team?.team_id;
        return injuryTeamId === playerTeamId;
      });

      if (teamInjuries.length === 0) return null;

      // Get teammate IDs (limit to first 3 for performance)
      const teammateIds = teamInjuries.slice(0, 3).map((injury: any) => injury.athlete_id).join(',');
      const statType = mapPropTypeToStat(selectedProp.type);

      const { data } = await axios.get(
        `${API_BASE_URL}/players/${selectedProp.player_id}/teammate-impact?teammate_ids=${teammateIds}&stat_type=${statType}&season=2025&limit=50`
      );
      return data;
    },
    enabled: !!selectedProp?.player_id && !!selectedProp?.type && !!gameData,
  });

  // Get unique players and prop types for filters
  const allPlayers = playerProps?.available
    ? Object.values(playerProps.props_by_player).map((p: any) => ({
        id: p.athlete_id,
        name: p.athlete_name
      }))
    : [];

  const allPropTypes = playerProps?.available
    ? Array.from(new Set(
        Object.values(playerProps.props_by_player).flatMap((p: any) =>
          Object.keys(p.props_by_type)
        )
      )).sort()
    : [];

  // Filter all props based on selected filters
  const filteredProps = playerProps?.available
    ? Object.values(playerProps.props_by_player).flatMap((player: any) => {
        // Get team for this player by comparing team_id
        const playerTeam = player.team_id === gameData?.away_team?.team_id ? 'away' : 'home';

        // Apply team filter
        if (selectedTeam !== 'all' && playerTeam !== selectedTeam) {
          return [];
        }

        // Apply player filter
        if (selectedPlayer !== 'all' && player.athlete_id !== selectedPlayer) {
          return [];
        }


        // Get props for this player
        return Object.entries(player.props_by_type).flatMap(([propType, props]: [string, any]) => {
          // Apply prop type filter
          if (selectedPropTypes.length > 0 && !selectedPropTypes.includes(propType)) {
            return [];
          }

          // Filter to only include primary lines (those with both over and under odds)
          // This excludes alternate lines which typically only have one side
          const primaryProps = props.filter((prop: any) => prop.over_odds && prop.under_odds);

          return primaryProps.map((prop: any) => ({
            ...prop,
            player_name: player.athlete_name,
            player_id: player.athlete_id,
            player_headshot: player.athlete_headshot,
            team: playerTeam
          }));
        });
      }).sort((a, b) => {
        // Sort by player name first, then by prop type, then by line value
        if (a.player_name !== b.player_name) {
          return a.player_name.localeCompare(b.player_name);
        }
        if (a.type !== b.type) {
          return a.type.localeCompare(b.type);
        }
        return parseFloat(a.line) - parseFloat(b.line);
      })
    : [];

  const clearFilters = () => {
    setSelectedTeam('all');
    setSelectedPlayer('all');
    setSelectedPropTypes([]);
  };

  const togglePropType = (propType: string) => {
    if (selectedPropTypes.includes(propType)) {
      setSelectedPropTypes(selectedPropTypes.filter(t => t !== propType));
    } else {
      setSelectedPropTypes([...selectedPropTypes, propType]);
    }
  };

  // Calculate correlation score for prop combinations
  const calculateCorrelation = (props: any[]): number => {
    let correlationScore = 0;

    // Check team diversity
    const teams = new Set(props.map(p => {
      const playerTeam = Object.values(playerProps?.props_by_player || {}).find(
        (player: any) => player.athlete_id === p.player_id
      ) as any;
      return playerTeam?.team_id;
    }));

    // Bonus for mixing teams (less correlation)
    if (teams.size > 1) {
      correlationScore += 20;
    }

    // Check stat type diversity
    const statTypes = new Set(props.map(p => p.type.toLowerCase().split(' ')[1])); // "Total Points" -> "points"
    correlationScore += statTypes.size * 10; // More diverse = less correlated

    // Penalize if all same stat type (highly correlated)
    if (statTypes.size === 1) {
      correlationScore -= 30;
    }

    return correlationScore;
  };

  // Enhanced grade calculation with contextual factors
  const calculateEnhancedGrade = (
    prop: any,
    prediction: any,
    edge: number,
    gameData: any,
    odds: any
  ): { grade: number; factors: string[] } => {
    if (!prediction || edge === undefined) {
      return { grade: 0, factors: [] };
    }

    const factors: string[] = [];

    // Base grade from edge and confidence
    const confidence = prediction.confidence || 'Low';
    const confidenceMultiplier = confidence === 'High' ? 1.0 : confidence === 'Medium' ? 0.85 : 0.7;
    const absEdge = Math.abs(edge);
    let baseGrade = Math.min(absEdge / 10, 1.0) * confidenceMultiplier;

    // Factor 1: Injury Impact
    let injuryBoost = 0;
    const playerTeamId = prop.team === 'away' ? gameData?.away_team?.team_id : gameData?.home_team?.team_id;
    const injuries = prop.team === 'away' ? gameData?.away_injuries : gameData?.home_injuries;

    if (injuries && injuries.length > 0) {
      // Check if key teammates are injured (starters or high-usage players)
      const significantInjuries = injuries.filter((inj: any) =>
        inj.status === 'OUT' && inj.position &&
        (inj.position.includes('G') || inj.position.includes('F') || inj.position.includes('C'))
      );

      if (significantInjuries.length > 0) {
        injuryBoost = Math.min(significantInjuries.length * 0.08, 0.20); // Up to +0.20 boost
        factors.push(`+${(injuryBoost * 100).toFixed(0)}% teammate injuries (${significantInjuries.length})`);
      }
    }

    // Factor 2: Home/Away Performance
    let locationBoost = 0;
    const isHome = prop.team === 'home';

    // Slight boost for home players (historically perform better at home)
    if (isHome && edge > 0) {
      locationBoost = 0.05;
      factors.push('+5% home court advantage');
    }

    // Factor 3: Game Pace/Total (affects scoring opportunities)
    let paceBoost = 0;
    if (odds?.over_under) {
      const overUnder = parseFloat(odds.over_under);
      const statType = prop.type.toLowerCase();

      // High totals favor scoring stats
      if (statType.includes('points') || statType.includes('assists')) {
        if (overUnder >= 230) {
          paceBoost = 0.08;
          factors.push('+8% high-pace game (O/U 230+)');
        } else if (overUnder >= 220) {
          paceBoost = 0.05;
          factors.push('+5% above-average pace (O/U 220+)');
        } else if (overUnder < 210) {
          paceBoost = -0.05;
          factors.push('-5% low-pace game (O/U <210)');
        }
      }

      // Low totals can favor rebounds/defensive stats
      if (statType.includes('rebounds') || statType.includes('blocks')) {
        if (overUnder < 210) {
          paceBoost = 0.05;
          factors.push('+5% defensive game (O/U <210)');
        }
      }
    }

    // Factor 4: Spread (competitive vs blowout expectations)
    let competitiveBoost = 0;
    if (odds?.spread) {
      const spread = Math.abs(parseFloat(odds.spread));
      const statType = prop.type.toLowerCase();
      const isPlayerOnFavorite = (spread > 0 && odds.home_favorite && isHome) ||
                                   (spread > 0 && !odds.home_favorite && !isHome);

      // Close games (small spread) = more minutes for starters
      if (spread <= 5) {
        competitiveBoost = 0.06;
        factors.push('+6% close game expected (more minutes)');
      }

      // Big underdogs in blowouts might see reduced minutes
      if (spread > 12 && !isPlayerOnFavorite) {
        competitiveBoost = -0.08;
        factors.push('-8% blowout risk (potential minute reduction)');
      }
    }

    // Factor 5: Recent Performance Trend (if available in prediction)
    let trendBoost = 0;
    if (prediction.recent_trend) {
      if (prediction.recent_trend === 'hot') {
        trendBoost = 0.05;
        factors.push('+5% player trending up');
      } else if (prediction.recent_trend === 'cold') {
        trendBoost = -0.05;
        factors.push('-5% player trending down');
      }
    }

    // Calculate final grade with all factors
    let finalGrade = baseGrade + injuryBoost + locationBoost + paceBoost + competitiveBoost + trendBoost;

    // Clamp to 0-1 range
    finalGrade = Math.max(0, Math.min(1, finalGrade));

    return { grade: finalGrade, factors };
  };

  // AI Parlay Generation Logic
  const generateOptimalParlays = async () => {
    if (!playerProps?.available || !predictions) return [];

    setIsGeneratingParlays(true);

    // Analyze each prop with predictions
    const analyzedProps: any[] = [];

    for (const [playerId, playerData] of Object.entries(playerProps.props_by_player)) {
      const player: any = playerData;

      // Find predictions for this player
      const playerPredictions = predictions.filter((p: any) => p.athlete_id === playerId);

      for (const [propType, props] of Object.entries(player.props_by_type)) {
        const propsList: any = props;

        for (const prop of propsList) {
          // Find matching prediction
          const prediction = playerPredictions.find((p: any) => {
            const predStatType = p.stat_type.toLowerCase();
            const propStatType = propType.toLowerCase();
            return propStatType.includes(predStatType) || predStatType.includes(propStatType.split(' ')[1]);
          });

          if (prediction && prop.over_odds && prop.under_odds) {
            const line = parseFloat(prop.line);
            const predictedValue = prediction.prediction;
            const edge = prediction.edge || 0;
            const confidence = prediction.confidence || 'Low';

            // Calculate hit probability (simplified)
            const overHitProb = predictedValue > line ? 0.55 + (Math.min(edge, 10) * 0.02) : 0.45 - (Math.min(Math.abs(edge), 10) * 0.02);
            const underHitProb = 1 - overHitProb;

            analyzedProps.push({
              player_id: playerId,
              player_name: player.athlete_name,
              player_headshot: player.athlete_headshot,
              type: propType,
              line: prop.line,
              over_odds: prop.over_odds,
              under_odds: prop.under_odds,
              predicted_value: predictedValue,
              edge: edge,
              confidence: confidence,
              over_hit_prob: overHitProb,
              under_hit_prob: underHitProb,
              recommended_pick: predictedValue > line ? 'over' : 'under',
              recommended_odds: predictedValue > line ? prop.over_odds : prop.under_odds,
              strength: Math.abs(edge)
            });
          }
        }
      }
    }

    // Sort by strength (edge) with correlation bonus
    analyzedProps.sort((a, b) => b.strength - a.strength);

    // Helper function to select unique legs (no duplicate player-stat combinations)
    // Tries to minimize correlation by mixing teams and stat types
    const selectUniqueLegs = (props: any[], count: number, optimizeForDiversity: boolean = true): any[] => {
      if (!optimizeForDiversity) {
        // Simple selection for value plays
        const selected: any[] = [];
        const usedPlayerStats = new Set<string>();

        for (const prop of props) {
          const key = `${prop.player_id}-${prop.type}`;
          if (!usedPlayerStats.has(key) && selected.length < count) {
            selected.push(prop);
            usedPlayerStats.add(key);
          }
        }
        return selected;
      }

      // Try multiple combinations and pick the one with best diversity
      const attempts: any[][] = [];

      for (let attempt = 0; attempt < Math.min(5, props.length); attempt++) {
        const selected: any[] = [];
        const usedPlayerStats = new Set<string>();
        const startIdx = attempt;

        // Start from different positions to get variety
        for (let i = startIdx; i < props.length && selected.length < count; i++) {
          const prop = props[i];
          const key = `${prop.player_id}-${prop.type}`;

          if (!usedPlayerStats.has(key)) {
            selected.push(prop);
            usedPlayerStats.add(key);
          }
        }

        // If we didn't get enough, fill from beginning
        if (selected.length < count) {
          for (let i = 0; i < startIdx && selected.length < count; i++) {
            const prop = props[i];
            const key = `${prop.player_id}-${prop.type}`;

            if (!usedPlayerStats.has(key)) {
              selected.push(prop);
              usedPlayerStats.add(key);
            }
          }
        }

        if (selected.length >= count) {
          attempts.push(selected.slice(0, count));
        }
      }

      // Score each attempt by diversity
      let bestAttempt = attempts[0] || [];
      let bestScore = -1000;

      for (const attempt of attempts) {
        const correlation = calculateCorrelation(attempt);
        const avgStrength = attempt.reduce((sum, p) => sum + p.strength, 0) / attempt.length;
        const score = avgStrength * 0.7 + correlation * 0.3; // 70% strength, 30% diversity

        if (score > bestScore) {
          bestScore = score;
          bestAttempt = attempt;
        }
      }

      return bestAttempt;
    };

    // Helper to generate reasoning for parlay
    const generateParlayReasoning = (legs: any[]): string => {
      const avgEdge = (legs.reduce((sum, leg) => sum + leg.edge, 0) / legs.length).toFixed(1);
      const correlation = calculateCorrelation(legs);
      const teams = new Set(legs.map(l => {
        const playerTeam = Object.values(playerProps.props_by_player).find(
          (player: any) => player.athlete_id === l.player_id
        ) as any;
        return playerTeam?.team_display_name || playerTeam?.athlete_name;
      }));
      const statTypes = new Set(legs.map(l => l.type.toLowerCase().split(' ')[1]));

      let reasoning = `This parlay has an average edge of ${avgEdge} points over Vegas lines. `;

      if (teams.size > 1) {
        reasoning += `Props are spread across ${teams.size} teams, reducing correlation risk. `;
      } else {
        reasoning += `All props from same team - higher correlation risk. `;
      }

      if (statTypes.size >= legs.length - 1) {
        reasoning += `Diverse stat types provide good independence. `;
      } else if (statTypes.size === 1) {
        reasoning += `All same stat type - outcomes are correlated. `;
      }

      const highConfidenceLegs = legs.filter(l => l.confidence === 'High').length;
      if (highConfidenceLegs === legs.length) {
        reasoning += `All legs have high confidence ratings.`;
      } else if (highConfidenceLegs > 0) {
        reasoning += `${highConfidenceLegs} of ${legs.length} legs have high confidence.`;
      }

      return reasoning;
    };

    // Generate parlay combinations
    const parlays = [];

    // 2-leg parlay (safest bets)
    const top2 = selectUniqueLegs(analyzedProps, 2);
    if (top2.length >= 2) {
      parlays.push({
        id: '2leg-safe',
        name: 'Safe 2-Leg Parlay',
        description: 'Most confident picks',
        legs: top2,
        risk: 'Low',
        confidence: 'High',
        reasoning: generateParlayReasoning(top2)
      });
    }

    // 3-leg balanced parlay
    const top3 = selectUniqueLegs(analyzedProps, 3);
    if (top3.length >= 3) {
      parlays.push({
        id: '3leg-balanced',
        name: 'Balanced 3-Leg Parlay',
        description: 'Good balance of odds and safety',
        legs: top3,
        risk: 'Medium',
        confidence: 'Medium-High',
        reasoning: generateParlayReasoning(top3)
      });
    }

    // 4-leg high risk/reward
    const top4 = selectUniqueLegs(analyzedProps, 4);
    if (top4.length >= 4) {
      parlays.push({
        id: '4leg-aggro',
        name: 'Aggressive 4-Leg Parlay',
        description: 'Higher payout, more risk',
        legs: top4,
        risk: 'High',
        confidence: 'Medium',
        reasoning: generateParlayReasoning(top4)
      });
    }

    // Value play - mix of high edge props
    const valueProps = analyzedProps.filter(p => p.edge > 2);
    const valueLegs = selectUniqueLegs(valueProps, 3);
    if (valueLegs.length >= 2) {
      parlays.push({
        id: 'value-play',
        name: 'Value Play',
        description: 'Best edges vs Vegas lines',
        legs: valueLegs,
        risk: 'Medium',
        confidence: 'High',
        reasoning: generateParlayReasoning(valueLegs)
      });
    }

    setIsGeneratingParlays(false);
    return parlays;
  };

  // Convert American odds to decimal
  const americanToDecimal = (americanOdds: string): number => {
    if (!americanOdds) return 1;
    const odds = parseFloat(americanOdds);
    if (odds > 0) {
      return (odds / 100) + 1;
    } else {
      return (100 / Math.abs(odds)) + 1;
    }
  };

  // Calculate parlay odds for a set of legs with SGP correlation discount
  const calculateParlayOdds = (legs: any[]) => {
    if (!legs || legs.length === 0) return { decimal: 1, american: '+0', payout: 0, profit: 0 };

    // Calculate base odds (independent multiplication)
    const baseDecimalOdds = legs.reduce((acc, leg) => {
      return acc * americanToDecimal(leg.recommended_odds);
    }, 1);

    // Calculate correlation score
    const correlation = calculateCorrelation(legs);

    // Apply SGP discount based on correlation
    // Lower correlation score = more correlated = higher discount
    // Discount range: 15-35% depending on correlation
    // Correlation score ranges: -30 (highly correlated) to +50 (diverse)
    // Map to discount factor: 0.65 (high discount) to 0.95 (low discount)
    const normalizedCorrelation = Math.max(-30, Math.min(50, correlation));
    const discountFactor = 0.65 + ((normalizedCorrelation + 30) / 80) * 0.30; // Range: 0.65 to 0.95

    // Apply discount to the profit portion only (keep stake at 1.0)
    const adjustedDecimalOdds = 1 + ((baseDecimalOdds - 1) * discountFactor);

    // Convert back to American odds
    let americanOdds: string;
    if (adjustedDecimalOdds >= 2) {
      americanOdds = '+' + Math.round((adjustedDecimalOdds - 1) * 100);
    } else {
      americanOdds = '-' + Math.round(100 / (adjustedDecimalOdds - 1));
    }

    const payout = betAmount * adjustedDecimalOdds;
    const profit = payout - betAmount;

    return {
      decimal: adjustedDecimalOdds,
      american: americanOdds,
      payout,
      profit,
      baseDecimal: baseDecimalOdds,
      discountApplied: (1 - discountFactor) * 100
    };
  };

  // Calculate combined hit probability
  const calculateCombinedProbability = (legs: any[]) => {
    if (!legs || legs.length === 0) return 0;
    return legs.reduce((acc, leg) => {
      const hitProb = leg.recommended_pick === 'over' ? leg.over_hit_prob : leg.under_hit_prob;
      return acc * hitProb;
    }, 1) * 100;
  };

  if (isLoadingGame) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-12 w-12 border-4 border-orange-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!gameData) {
    return (
      <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-6 text-center">
        <p className="text-red-400">Game not found</p>
      </div>
    );
  }

  const awayTeam = gameData.away_team;
  const homeTeam = gameData.home_team;

  // Helper function to get confidence badge color
  const getConfidenceBadge = (confidence: string) => {
    const colors = {
      High: 'bg-green-500/20 border-green-500/50 text-green-400',
      Medium: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400',
      Low: 'bg-gray-500/20 border-gray-500/50 text-gray-400',
    };
    return colors[confidence as keyof typeof colors] || colors.Low;
  };


  // Group predictions by team and player
  const predictionsByTeam: {
    away: { [playerId: string]: PropPrediction[] },
    home: { [playerId: string]: PropPrediction[] }
  } = { away: {}, home: {} };

  if (predictions && Array.isArray(predictions)) {
    predictions.forEach((pred: PropPrediction) => {
      // Match team by name since API doesn't return team_id
      const teamKey = pred.team_name === awayTeam?.team_name ? 'away' : 'home';
      if (!predictionsByTeam[teamKey][pred.athlete_id]) {
        predictionsByTeam[teamKey][pred.athlete_id] = [];
      }
      predictionsByTeam[teamKey][pred.athlete_id].push(pred);
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">Game Preview</h1>
          <p className="text-slate-400">Pre-game analysis and predictions</p>
        </div>
        <button
          onClick={() => navigate('/schedule')}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-white transition-colors"
        >
          ← Back to Schedule
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl">
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 px-6 py-4 font-semibold transition-all ${
              activeTab === 'info'
                ? 'bg-slate-700 text-orange-500 border-b-2 border-orange-500'
                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
            }`}
          >
            Game Info
          </button>
          <button
            onClick={() => setActiveTab('props')}
            className={`flex-1 px-6 py-4 font-semibold transition-all ${
              activeTab === 'props'
                ? 'bg-slate-700 text-orange-500 border-b-2 border-orange-500'
                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
            }`}
          >
            Player Props
          </button>
          <button
            onClick={() => setActiveTab('parlay')}
            className={`flex-1 px-6 py-4 font-semibold transition-all ${
              activeTab === 'parlay'
                ? 'bg-slate-700 text-orange-500 border-b-2 border-orange-500'
                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
            }`}
          >
            Parlay Creator
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Game Info Tab */}
          {activeTab === 'info' && (
            <div className="space-y-6">
              {/* Team Matchup */}
      <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 shadow-xl">
        <div className="flex items-center justify-between gap-8">
          {/* Away Team */}
          <div className="flex-1 flex flex-col items-center">
            {awayTeam?.team_logo && (
              <img
                src={awayTeam.team_logo}
                alt={awayTeam.team_name}
                className="w-32 h-32 object-contain mb-4"
              />
            )}
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-1">{awayTeam?.team_name}</h2>
              <p className="text-slate-400">
                {awayTeamData?.record?.summary || awayTeamData?.record || 'N/A'}
              </p>
            </div>
          </div>

          {/* VS */}
          <div className="text-4xl font-bold text-slate-600">@</div>

          {/* Home Team */}
          <div className="flex-1 flex flex-col items-center">
            {homeTeam?.team_logo && (
              <img
                src={homeTeam.team_logo}
                alt={homeTeam.team_name}
                className="w-32 h-32 object-contain mb-4"
              />
            )}
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-1">{homeTeam?.team_name}</h2>
              <p className="text-slate-400">
                {homeTeamData?.record?.summary || homeTeamData?.record || 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* Game Info */}
        <div className="mt-6 pt-6 border-t border-slate-700 text-center space-y-2">
          {gameData.date && (
            <div className="text-lg font-semibold text-orange-500">
              {new Date(gameData.date).toLocaleString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZoneName: 'short',
              })}
            </div>
          )}
          {gameData.venue?.name && (
            <div className="text-sm text-slate-400">
              {gameData.venue.name}
              {gameData.venue.city && ` • ${gameData.venue.city}, ${gameData.venue.state}`}
            </div>
          )}
          {gameData.broadcast && gameData.broadcast.length > 0 && (
            <div className="text-sm text-slate-400">
              📺 {gameData.broadcast.flat().join(', ')}
            </div>
          )}
        </div>
      </div>

      {/* Betting Odds */}
      {odds && odds.available && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
          <h3 className="text-xl font-bold mb-4 text-center">Betting Odds</h3>
          <div className="text-xs text-slate-500 mb-4 text-center">
            {odds.provider || 'Provider not specified'}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Spread */}
            <div className="bg-slate-700/30 rounded-lg p-4 text-center">
              <div className="text-sm text-slate-500 mb-2">Spread</div>
              <div className="text-2xl font-bold text-orange-400">{odds.spread_details}</div>
            </div>
            {/* Over/Under */}
            <div className="bg-slate-700/30 rounded-lg p-4 text-center">
              <div className="text-sm text-slate-500 mb-2">Over/Under</div>
              <div className="text-2xl font-bold text-orange-400">{odds.over_under}</div>
            </div>
            {/* Moneyline */}
            <div className="bg-slate-700/30 rounded-lg p-4 text-center">
              <div className="text-sm text-slate-500 mb-2">Moneyline</div>
              <div className="space-y-1">
                <div className="text-sm">
                  <span className="text-slate-400">{awayTeam?.team_abbreviation}: </span>
                  <span className="font-bold text-orange-400">
                    {odds.away_moneyline > 0 ? '+' : ''}{odds.away_moneyline}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-slate-400">{homeTeam?.team_abbreviation}: </span>
                  <span className="font-bold text-orange-400">
                    {odds.home_moneyline > 0 ? '+' : ''}{odds.home_moneyline}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Injury Reports */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
        <h3 className="text-xl font-bold mb-4 text-center">Injury Report</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Away Team Injuries */}
          <div>
            <div className="text-center mb-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                {awayTeam?.team_logo && (
                  <img src={awayTeam.team_logo} alt={awayTeam.team_name} className="w-6 h-6 object-contain" />
                )}
                <h4 className="font-bold">{awayTeam?.team_name}</h4>
              </div>
            </div>
            {gameData?.away_injuries && gameData.away_injuries.length > 0 ? (
              <div className="space-y-3">
                {gameData.away_injuries.map((injury: any) => (
                  <div key={injury.athlete_id} className="bg-slate-700/30 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      {injury.athlete_headshot && (
                        <img
                          src={injury.athlete_headshot}
                          alt={injury.athlete_name}
                          className="w-12 h-12 rounded-full bg-slate-700 object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                      <div className="flex-1">
                        <div className="font-bold text-sm">{injury.athlete_name}</div>
                        <div className="text-xs text-slate-500">{injury.position}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-red-400">{injury.status}</div>
                        <div className="text-xs text-slate-500">{injury.type}</div>
                      </div>
                    </div>
                    {injury.details && (
                      <div className="mt-2 text-xs text-slate-400 italic">{injury.details}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-slate-500 py-4">
                ✅ No injuries reported
              </div>
            )}
          </div>

          {/* Home Team Injuries */}
          <div>
            <div className="text-center mb-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                {homeTeam?.team_logo && (
                  <img src={homeTeam.team_logo} alt={homeTeam.team_name} className="w-6 h-6 object-contain" />
                )}
                <h4 className="font-bold">{homeTeam?.team_name}</h4>
              </div>
            </div>
            {gameData?.home_injuries && gameData.home_injuries.length > 0 ? (
              <div className="space-y-3">
                {gameData.home_injuries.map((injury: any) => (
                  <div key={injury.athlete_id} className="bg-slate-700/30 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      {injury.athlete_headshot && (
                        <img
                          src={injury.athlete_headshot}
                          alt={injury.athlete_name}
                          className="w-12 h-12 rounded-full bg-slate-700 object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                      <div className="flex-1">
                        <div className="font-bold text-sm">{injury.athlete_name}</div>
                        <div className="text-xs text-slate-500">{injury.position}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-red-400">{injury.status}</div>
                        <div className="text-xs text-slate-500">{injury.type}</div>
                      </div>
                    </div>
                    {injury.details && (
                      <div className="mt-2 text-xs text-slate-400 italic">{injury.details}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-slate-500 py-4">
                ✅ No injuries reported
              </div>
            )}
          </div>
        </div>
      </div>
            </div>
          )}

          {/* Player Props Tab */}
          {activeTab === 'props' && (
            <div className="space-y-6">
      {/* Props Table with Filters */}
      {playerProps?.available && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
          {/* Header */}
          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">Player Props</h3>
            <p className="text-xs text-slate-500 mb-2">
              {playerProps.provider} • Showing {filteredProps.length} primary lines (alternates excluded)
            </p>
            <div className="text-xs text-slate-400 bg-slate-700/30 rounded-lg p-3 border border-slate-600">
              <span className="font-semibold text-slate-300">📊 Grade Explanation:</span> Pick quality score (0-1 scale) based on <span className="text-blue-400 font-semibold">edge size</span>, <span className="text-purple-400 font-semibold">confidence level</span>, and contextual factors including <span className="text-orange-400 font-semibold">injuries</span>, <span className="text-green-400 font-semibold">home/away</span>, <span className="text-yellow-400 font-semibold">game pace</span>, and <span className="text-red-400 font-semibold">spread</span>. Hover over grade to see breakdown.
              <div className="mt-1 flex gap-4">
                <span className="text-green-400">0.70-1.00 = Excellent</span>
                <span className="text-yellow-400">0.50-0.69 = Good</span>
                <span className="text-orange-400">0.30-0.49 = Fair</span>
                <span className="text-slate-400">0.00-0.29 = Weak</span>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="mb-6 space-y-4">
            {/* Team Filter */}
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">Team</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedTeam('all')}
                  className={`px-4 py-2 rounded-lg border transition-all ${
                    selectedTeam === 'all'
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : 'bg-slate-700/50 border-slate-600 hover:border-slate-500'
                  }`}
                >
                  All Teams
                </button>
                <button
                  onClick={() => setSelectedTeam('away')}
                  className={`px-4 py-2 rounded-lg border transition-all flex items-center gap-2 ${
                    selectedTeam === 'away'
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : 'bg-slate-700/50 border-slate-600 hover:border-slate-500'
                  }`}
                >
                  {awayTeam?.team_logo && <img src={awayTeam.team_logo} alt="" className="w-5 h-5" />}
                  {awayTeam?.team_name}
                </button>
                <button
                  onClick={() => setSelectedTeam('home')}
                  className={`px-4 py-2 rounded-lg border transition-all flex items-center gap-2 ${
                    selectedTeam === 'home'
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : 'bg-slate-700/50 border-slate-600 hover:border-slate-500'
                  }`}
                >
                  {homeTeam?.team_logo && <img src={homeTeam.team_logo} alt="" className="w-5 h-5" />}
                  {homeTeam?.team_name}
                </button>
              </div>
            </div>

            {/* Player Select */}
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">Select Player</label>
              <select
                value={selectedPlayer}
                onChange={(e) => setSelectedPlayer(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500 text-white"
              >
                <option value="all">All Players</option>
                {allPlayers.map((player: any) => (
                  <option key={player.id} value={player.id}>{player.name}</option>
                ))}
              </select>
            </div>

            {/* Prop Type Filter */}
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">
                Prop Types {selectedPropTypes.length > 0 && `(${selectedPropTypes.length} selected)`}
              </label>
              <div className="flex flex-wrap gap-2">
                {allPropTypes.map((propType: string) => (
                  <button
                    key={propType}
                    onClick={() => togglePropType(propType)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                      selectedPropTypes.includes(propType)
                        ? 'bg-orange-500 border-orange-500 text-white'
                        : 'bg-slate-700/50 border-slate-600 hover:border-slate-500'
                    }`}
                  >
                    {propType.replace('Total ', '')}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear Filters */}
            {(selectedTeam !== 'all' || selectedPlayer !== 'all' || selectedPropTypes.length > 0) && (
              <div className="flex justify-end">
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-sm transition-colors"
                >
                  Clear All Filters
                </button>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-600">
                  <th className="text-left py-3 px-4 font-semibold">Player</th>
                  <th className="text-left py-3 px-4 font-semibold">Prop Type</th>
                  <th className="text-center py-3 px-4 font-semibold">Line</th>
                  <th className="text-center py-3 px-4 font-semibold">Prediction</th>
                  <th className="text-center py-3 px-4 font-semibold">Pick</th>
                  <th className="text-center py-3 px-4 font-semibold">Grade</th>
                  <th className="text-center py-3 px-4 font-semibold">Over</th>
                  <th className="text-center py-3 px-4 font-semibold">Under</th>
                </tr>
              </thead>
              <tbody>
                {filteredProps.length > 0 ? (
                  filteredProps.map((prop: any, idx: number) => {
                    // Find matching prediction for this prop
                    const prediction = predictions?.find((p: any) => {
                      if (p.athlete_id !== prop.player_id) return false;
                      const predStatType = p.stat_type.toLowerCase();
                      const propStatType = prop.type.toLowerCase();
                      return propStatType.includes(predStatType) || predStatType.includes(propStatType.split(' ')[1]);
                    });

                    const line = parseFloat(prop.line);
                    const predictedValue = prediction?.prediction;
                    const edge = prediction?.edge || 0;

                    // Determine pick
                    let pick = '--';
                    let pickColor = 'text-slate-500';
                    if (predictedValue !== undefined) {
                      if (predictedValue > line) {
                        pick = 'OVER';
                        pickColor = 'text-green-400 font-bold';
                      } else if (predictedValue < line) {
                        pick = 'UNDER';
                        pickColor = 'text-red-400 font-bold';
                      } else {
                        pick = 'PUSH';
                        pickColor = 'text-yellow-400';
                      }
                    }

                    // Calculate enhanced grade with contextual factors
                    let grade = '--';
                    let gradeColor = 'text-slate-500';
                    let gradeFactors: string[] = [];

                    if (predictedValue !== undefined && edge !== undefined) {
                      const { grade: enhancedGrade, factors } = calculateEnhancedGrade(
                        prop,
                        prediction,
                        edge,
                        gameData,
                        odds
                      );

                      grade = enhancedGrade.toFixed(2);
                      gradeFactors = factors;

                      // Color code the grade
                      if (enhancedGrade >= 0.7) {
                        gradeColor = 'text-green-400 font-bold';
                      } else if (enhancedGrade >= 0.5) {
                        gradeColor = 'text-yellow-400 font-semibold';
                      } else if (enhancedGrade >= 0.3) {
                        gradeColor = 'text-orange-400';
                      } else {
                        gradeColor = 'text-slate-400';
                      }
                    }

                    return (
                      <tr
                        key={`${prop.player_id}-${prop.type}-${prop.line}-${idx}`}
                        onClick={() => {
                          // All props are clickable for chart - we only need the line value
                          setSelectedProp({...prop});
                        }}
                        className={`border-b border-slate-700/50 transition-colors hover:bg-slate-700/30 cursor-pointer ${selectedProp?.player_id === prop.player_id && selectedProp?.type === prop.type && selectedProp?.line === prop.line ? 'bg-orange-500/20 border-orange-500/50' : ''}`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <PlayerImage
                              src={prop.player_headshot}
                              alt={prop.player_name}
                              className="w-8 h-8 rounded-full bg-slate-700 object-cover"
                              fallbackInitial={prop.player_name?.charAt(0) || '?'}
                            />
                            <span className="font-medium">{prop.player_name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{prop.type}</td>
                        <td className="py-3 px-4 text-center font-bold text-orange-400">{prop.line}</td>
                        <td className="py-3 px-4 text-center">
                          {predictedValue !== undefined ? (
                            <div>
                              <div className="font-bold text-blue-400">{predictedValue.toFixed(1)}</div>
                              {edge !== 0 && (
                                <div className={`text-xs ${edge > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {edge > 0 ? '+' : ''}{edge.toFixed(1)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500">--</span>
                          )}
                        </td>
                        <td className={`py-3 px-4 text-center ${pickColor}`}>{pick}</td>
                        <td className={`py-3 px-4 text-center ${gradeColor}`}>
                          <div className="group relative inline-block">
                            {grade}
                            {gradeFactors.length > 0 && (
                              <div className="invisible group-hover:visible absolute z-10 w-64 p-3 bg-slate-900 border border-slate-600 rounded-lg shadow-xl bottom-full left-1/2 transform -translate-x-1/2 mb-2 text-left">
                                <div className="text-xs font-semibold text-slate-300 mb-2">Grade Factors:</div>
                                <ul className="text-xs text-slate-400 space-y-1">
                                  {gradeFactors.map((factor, idx) => (
                                    <li key={idx}>• {factor}</li>
                                  ))}
                                </ul>
                                <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                                  <div className="border-8 border-transparent border-t-slate-900"></div>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center text-green-400 font-semibold">{prop.over_odds || '--'}</td>
                        <td className="py-3 px-4 text-center text-red-400 font-semibold">{prop.under_odds || '--'}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      No props match the selected filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No Data Available */}
      {!playerProps?.available && (
        <div className="bg-slate-800 rounded-xl p-12 border border-slate-700 text-center">
          <div className="text-slate-400 text-lg">
            No props available for this game yet
          </div>
          <div className="text-slate-500 text-sm mt-2">
            Check back closer to game time for updated data
          </div>
        </div>
      )}

      {/* Chart Section - Last 10 Games */}
      {selectedProp && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <PlayerImage
                key={`${selectedProp.player_id}-${selectedProp.player_headshot}`}
                src={selectedProp.player_headshot}
                alt={selectedProp.player_name}
                className="w-12 h-12 rounded-full bg-slate-700 object-cover"
                fallbackInitial={selectedProp.player_name?.charAt(0) || '?'}
              />
              <div>
                <h3 className="text-xl font-bold">{selectedProp.player_name}</h3>
                <p className="text-sm text-slate-400">
                  {selectedProp.type} - Last {gamesLimit} Games (Line: {selectedProp.line})
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={gamesLimit}
                onChange={(e) => setGamesLimit(Number(e.target.value))}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500"
              >
                <option value={5}>Last 5 Games</option>
                <option value={10}>Last 10 Games</option>
                <option value={15}>Last 15 Games</option>
                <option value={20}>Last 20 Games</option>
                <option value={30}>Last 30 Games</option>
              </select>
              <button
                onClick={() => setSelectedProp(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>

          {/* Chart Filters */}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Location:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setChartLocationFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                    chartLocationFilter === 'all'
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setChartLocationFilter('home')}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                    chartLocationFilter === 'home'
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Home
                </button>
                <button
                  onClick={() => setChartLocationFilter('away')}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                    chartLocationFilter === 'away'
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Away
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Started:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setChartStarterFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                    chartStarterFilter === 'all'
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setChartStarterFilter('yes')}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                    chartStarterFilter === 'yes'
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Yes
                </button>
                <button
                  onClick={() => setChartStarterFilter('no')}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                    chartStarterFilter === 'no'
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  No
                </button>
              </div>
            </div>

            {(chartLocationFilter !== 'all' || chartStarterFilter !== 'all') && (
              <button
                onClick={() => {
                  setChartLocationFilter('all');
                  setChartStarterFilter('all');
                }}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-xs text-slate-300 transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Loading State */}
          {isLoadingGames && (
            <div className="h-96 flex items-center justify-center">
              <div className="animate-spin h-12 w-12 border-4 border-orange-500 border-t-transparent rounded-full"></div>
            </div>
          )}

          {/* Summary Stats */}
          {!isLoadingGames && recentGames?.games && recentGames.games.length > 0 && (() => {
            const line = parseFloat(selectedProp.line);
            const games = recentGames.games;
            const totalGames = games.length;

            // Calculate hit rate
            const hitsOver = games.filter((g: any) => g.stat_value > line).length;
            const hitRate = (hitsOver / totalGames * 100).toFixed(0);

            // Calculate average
            const average = (games.reduce((sum: number, g: any) => sum + g.stat_value, 0) / totalGames).toFixed(1);
            const avgDiff = (parseFloat(average) - line).toFixed(1);

            // Calculate home/away splits
            const homeGames = games.filter((g: any) => g.location === 'Home');
            const awayGames = games.filter((g: any) => g.location === 'Away');
            const homeHits = homeGames.filter((g: any) => g.stat_value > line).length;
            const awayHits = awayGames.filter((g: any) => g.stat_value > line).length;
            const homeHitRate = homeGames.length > 0 ? (homeHits / homeGames.length * 100).toFixed(0) : 'N/A';
            const awayHitRate = awayGames.length > 0 ? (awayHits / awayGames.length * 100).toFixed(0) : 'N/A';

            // Calculate last 3 games trend
            const last3 = games.slice(0, 3);
            const last3Hits = last3.filter((g: any) => g.stat_value > line).length;
            const last3HitRate = (last3Hits / last3.length * 100).toFixed(0);

            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {/* Hit Rate */}
                  <div className="bg-slate-700/30 rounded-lg p-4">
                    <div className="text-xs text-slate-400 mb-1">Overall Hit Rate</div>
                    <div className="text-2xl font-bold text-white">{hitsOver}/{totalGames}</div>
                    <div className={`text-sm font-semibold ${parseFloat(hitRate) >= 60 ? 'text-green-400' : parseFloat(hitRate) <= 40 ? 'text-red-400' : 'text-yellow-400'}`}>
                      {hitRate}% OVER
                    </div>
                  </div>

                  {/* Average */}
                  <div className="bg-slate-700/30 rounded-lg p-4">
                    <div className="text-xs text-slate-400 mb-1">Average</div>
                    <div className="text-2xl font-bold text-white">{average}</div>
                    <div className={`text-sm font-semibold ${parseFloat(avgDiff) > 0 ? 'text-green-400' : parseFloat(avgDiff) < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                      {parseFloat(avgDiff) > 0 ? '+' : ''}{avgDiff} vs line
                    </div>
                  </div>

                  {/* Home Split */}
                  <div className="bg-slate-700/30 rounded-lg p-4">
                    <div className="text-xs text-slate-400 mb-1">Home Split</div>
                    <div className="text-2xl font-bold text-white">{homeHits}/{homeGames.length}</div>
                    <div className={`text-sm font-semibold ${homeGames.length > 0 && parseFloat(homeHitRate as string) >= 60 ? 'text-green-400' : homeGames.length > 0 && parseFloat(homeHitRate as string) <= 40 ? 'text-red-400' : 'text-yellow-400'}`}>
                      {homeHitRate}{homeGames.length > 0 ? '% OVER' : ''}
                    </div>
                  </div>

                  {/* Away Split */}
                  <div className="bg-slate-700/30 rounded-lg p-4">
                    <div className="text-xs text-slate-400 mb-1">Away Split</div>
                    <div className="text-2xl font-bold text-white">{awayHits}/{awayGames.length}</div>
                    <div className={`text-sm font-semibold ${awayGames.length > 0 && parseFloat(awayHitRate as string) >= 60 ? 'text-green-400' : awayGames.length > 0 && parseFloat(awayHitRate as string) <= 40 ? 'text-red-400' : 'text-yellow-400'}`}>
                      {awayHitRate}{awayGames.length > 0 ? '% OVER' : ''}
                    </div>
                  </div>
                </div>

                {/* Recent Trend Indicator */}
                <div className="mb-4 flex items-center gap-2 text-sm">
                  <span className="text-slate-400">Recent Trend (Last 3):</span>
                  <span className="font-bold text-white">{last3Hits}/3 ({last3HitRate}%)</span>
                  {parseFloat(last3HitRate) > parseFloat(hitRate) ? (
                    <span className="text-green-400 font-bold">↑ Trending Up</span>
                  ) : parseFloat(last3HitRate) < parseFloat(hitRate) ? (
                    <span className="text-red-400 font-bold">↓ Trending Down</span>
                  ) : (
                    <span className="text-slate-400">→ Steady</span>
                  )}
                </div>

                {/* Game Context Insights */}
                {(() => {
                  const line = parseFloat(selectedProp.line);
                  const overUnder = odds?.over_under ? parseFloat(odds.over_under) : null;

                  // Calculate game context stats
                  const highScoringGames = games.filter((g: any) =>
                    (g.team_score + g.opponent_score) > 220
                  );
                  const lowScoringGames = games.filter((g: any) =>
                    (g.team_score + g.opponent_score) < 210
                  );

                  const blowoutGames = games.filter((g: any) =>
                    Math.abs(g.team_score - g.opponent_score) > 10
                  );
                  const closeGames = games.filter((g: any) =>
                    Math.abs(g.team_score - g.opponent_score) <= 5
                  );

                  const winGames = games.filter((g: any) => g.result === 'W');
                  const lossGames = games.filter((g: any) => g.result === 'L');

                  const calcAvg = (gameList: any[]) => {
                    if (gameList.length === 0) return null;
                    return (gameList.reduce((sum, g) => sum + g.stat_value, 0) / gameList.length).toFixed(1);
                  };

                  const calcHitRate = (gameList: any[]) => {
                    if (gameList.length === 0) return null;
                    const hits = gameList.filter(g => g.stat_value > line).length;
                    return ((hits / gameList.length) * 100).toFixed(0);
                  };

                  const highScoreAvg = calcAvg(highScoringGames);
                  const lowScoreAvg = calcAvg(lowScoringGames);
                  const highScoreHitRate = calcHitRate(highScoringGames);
                  const lowScoreHitRate = calcHitRate(lowScoringGames);

                  const blowoutAvg = calcAvg(blowoutGames);
                  const closeAvg = calcAvg(closeGames);
                  const blowoutHitRate = calcHitRate(blowoutGames);
                  const closeHitRate = calcHitRate(closeGames);

                  const winAvg = calcAvg(winGames);
                  const lossAvg = calcAvg(lossGames);
                  const winHitRate = calcHitRate(winGames);
                  const lossHitRate = calcHitRate(lossGames);

                  // Determine expected context for current game
                  const expectedHighScoring = overUnder && overUnder >= 220;
                  const expectedLowScoring = overUnder && overUnder < 210;
                  const spreadValue = odds.spread ? Math.abs(parseFloat(odds.spread)) : null;
                  const expectedCompetitive = spreadValue && spreadValue <= 6;
                  const expectedBlowout = spreadValue && spreadValue > 10;

                  return (
                    <div className="mb-6 bg-slate-700/30 rounded-xl p-4 border border-slate-600">
                      <h4 className="text-sm font-bold text-orange-400 mb-3">🎯 Game Context Insights</h4>
                      {odds?.available && (
                        <div className="text-xs text-slate-500 mb-3">
                          Today's Game: {odds.spread_details} • O/U {odds.over_under}
                        </div>
                      )}

                      <div className="space-y-2 text-sm">
                        {/* Pace/Scoring Context */}
                        {highScoringGames.length > 0 && lowScoringGames.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-slate-400 min-w-[120px]">Pace Context:</span>
                            <div className="flex-1">
                              <div className={`${expectedHighScoring ? 'text-green-400 font-semibold' : 'text-slate-300'}`}>
                                High-scoring (220+): {highScoreAvg} avg, {highScoreHitRate}% hit rate ({highScoringGames.length} games)
                                {expectedHighScoring && ' ✓ Expected tonight'}
                              </div>
                              <div className={`${expectedLowScoring ? 'text-green-400 font-semibold' : 'text-slate-400'}`}>
                                Low-scoring (&lt;210): {lowScoreAvg} avg, {lowScoreHitRate}% hit rate ({lowScoringGames.length} games)
                                {expectedLowScoring && ' ✓ Expected tonight'}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Competitive Context */}
                        {blowoutGames.length > 0 && closeGames.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-slate-400 min-w-[120px]">Game Flow:</span>
                            <div className="flex-1">
                              <div className={`${expectedCompetitive ? 'text-green-400 font-semibold' : 'text-slate-300'}`}>
                                Close games (≤5 pts): {closeAvg} avg, {closeHitRate}% hit rate ({closeGames.length} games)
                                {expectedCompetitive && ' ✓ Expected tonight'}
                              </div>
                              <div className={`${expectedBlowout ? 'text-green-400 font-semibold' : 'text-slate-400'}`}>
                                Blowouts (&gt;10 pts): {blowoutAvg} avg, {blowoutHitRate}% hit rate ({blowoutGames.length} games)
                                {expectedBlowout && ' ✓ Possible tonight'}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Win/Loss Context */}
                        {winGames.length > 0 && lossGames.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-slate-400 min-w-[120px]">Team Result:</span>
                            <div className="flex-1">
                              <div className="text-slate-300">
                                In wins: {winAvg} avg, {winHitRate}% hit rate ({winGames.length} games)
                              </div>
                              <div className="text-slate-400">
                                In losses: {lossAvg} avg, {lossHitRate}% hit rate ({lossGames.length} games)
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Teammate Impact (Injury Analysis) */}
                        {teammateImpact && teammateImpact.teammates && teammateImpact.teammates.length > 0 && (
                          <div className="flex items-start gap-2 pt-2 mt-2 border-t border-slate-600">
                            <span className="text-slate-400 min-w-[120px]">🏥 Injury Impact:</span>
                            <div className="flex-1 space-y-1">
                              {teammateImpact.teammates.map((teammate: any) => {
                                if (teammate.games_without === 0) return null;
                                const diff = teammate.difference;
                                const isPositive = diff && diff > 0;

                                return (
                                  <div key={teammate.teammate_id} className={isPositive ? 'text-green-400 font-semibold' : 'text-slate-300'}>
                                    Without {teammate.teammate_name}: {teammate.avg_without} avg
                                    {diff !== null && (
                                      <span className={isPositive ? 'text-green-400' : 'text-red-400'}>
                                        {' '}({diff > 0 ? '+' : ''}{diff} vs with)
                                      </span>
                                    )}
                                    {' '}({teammate.games_without} games)
                                    {isPositive && diff && diff > 1.5 && ' ✓ Significant boost expected'}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </>
            );
          })()}

          {/* Bar Chart */}
          {!isLoadingGames && recentGames?.games && recentGames.games.length > 0 && (() => {
            const line = parseFloat(selectedProp.line);
            const games = recentGames.games;
            const average = games.reduce((sum: number, g: any) => sum + g.stat_value, 0) / games.length;

            return (
              <div className="h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[...games].reverse().map((game: any) => {
                      const date = new Date(game.game_date);
                      const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
                      return {
                        ...game,
                        displayLabel: `${dateStr} ${game.location === 'Home' ? 'vs' : '@'} ${game.opponent}`,
                        barColor: game.stat_value > line ? '#22c55e' : game.stat_value < line ? '#ef4444' : '#64748b',
                        hitStatus: game.stat_value > line ? 'OVER' : game.stat_value < line ? 'UNDER' : 'PUSH'
                      };
                    })}
                    margin={{ top: 20, right: 30, left: 20, bottom: 100 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="displayLabel"
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      angle={-45}
                      textAnchor="end"
                      height={100}
                    />
                    <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        color: '#fff'
                      }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const diff = (data.stat_value - line).toFixed(1);
                          return (
                            <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl">
                              <div className="font-bold text-orange-400 mb-2">{data.displayLabel}</div>
                              <div className="text-sm space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-white font-bold text-lg">{data.stat_value}</span>
                                  <span className="text-slate-400">{recentGames.stat_type}</span>
                                </div>
                                <div className={`font-semibold ${data.stat_value > line ? 'text-green-400' : 'text-red-400'}`}>
                                  Line: {line} → {diff > 0 ? '+' : ''}{diff} {data.hitStatus}
                                </div>
                                <div className="text-slate-400 text-xs pt-1 border-t border-slate-700">
                                  {data.result} {data.team_score}-{data.opponent_score}
                                </div>
                                <div className="text-slate-400 text-xs">
                                  {new Date(data.game_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine
                      y={line}
                      stroke="#f97316"
                      strokeDasharray="3 3"
                      strokeWidth={2}
                      label={{
                        value: `Line: ${selectedProp.line}`,
                        position: 'right',
                        fill: '#f97316',
                        fontSize: 14,
                        fontWeight: 'bold'
                      }}
                    />
                    <ReferenceLine
                      y={average}
                      stroke="#3b82f6"
                      strokeDasharray="5 5"
                      strokeWidth={2}
                      label={{
                        value: `Avg: ${average.toFixed(1)}`,
                        position: 'left',
                        fill: '#3b82f6',
                        fontSize: 14,
                        fontWeight: 'bold'
                      }}
                    />
                    <Bar
                      dataKey="stat_value"
                      radius={[8, 8, 0, 0]}
                    >
                      {[...games].reverse().map((entry: any, index: number) => {
                        const color = entry.stat_value > line ? '#22c55e' : entry.stat_value < line ? '#ef4444' : '#64748b';
                        return <Cell key={`cell-${index}`} fill={color} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

          {/* No Data State */}
          {!isLoadingGames && (!recentGames?.games || recentGames.games.length === 0) && (
            <div className="h-96 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-lg mb-2">No recent games data available</p>
                <p className="text-sm text-slate-500">This player may not have recent game history in the database</p>
              </div>
            </div>
          )}
        </div>
      )}
            </div>
          )}

          {/* Parlay Creator Tab */}
          {activeTab === 'parlay' && (
            <div className="space-y-6">
              {/* Header with Generate Button */}
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-2xl font-bold">AI-Powered Parlay Recommendations</h3>
                    <p className="text-sm text-slate-400 mt-1">
                      Based on predictions, historical data, and game context analysis
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      ℹ️ Same Game Parlay odds are adjusted for correlation (15-35% discount applied)
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      const parlays = await generateOptimalParlays();
                      setGeneratedParlays(parlays);
                    }}
                    disabled={isGeneratingParlays || !playerProps?.available || !predictions}
                    className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-all shadow-lg flex items-center gap-2"
                  >
                    {isGeneratingParlays ? (
                      <>
                        <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                        Analyzing...
                      </>
                    ) : (
                      <>
                        🤖 Generate Parlays
                      </>
                    )}
                  </button>
                </div>

                {/* Bet Amount Input */}
                <div className="mt-4">
                  <label className="block text-sm font-medium mb-2 text-slate-300">
                    Bet Amount ($)
                  </label>
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(Math.max(1, parseFloat(e.target.value) || 10))}
                    className="w-48 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500 text-white"
                    min="1"
                    step="5"
                  />
                </div>
              </div>

              {/* Parlays Display */}
              {generatedParlays.length > 0 ? (
                <div className="space-y-4">
                  {generatedParlays.map((parlay: any) => {
                    const odds = calculateParlayOdds(parlay.legs);
                    const hitProb = calculateCombinedProbability(parlay.legs);

                      const getRiskColor = (risk: string) => {
                        if (risk === 'Low') return 'text-green-400 border-green-500/50 bg-green-500/10';
                        if (risk === 'Medium') return 'text-yellow-400 border-yellow-500/50 bg-yellow-500/10';
                        return 'text-red-400 border-red-500/50 bg-red-500/10';
                      };

                      return (
                        <div key={parlay.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                          {/* Header */}
                          <div className="p-6 border-b border-slate-700">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h4 className="text-xl font-bold">{parlay.name}</h4>
                                <p className="text-sm text-slate-400 mt-1">{parlay.description}</p>
                              </div>
                              <div className="flex gap-2">
                                <span className={`px-3 py-1 rounded-lg text-xs font-semibold border ${getRiskColor(parlay.risk)}`}>
                                  {parlay.risk} Risk
                                </span>
                                <span className="px-3 py-1 rounded-lg text-xs font-semibold border border-blue-500/50 bg-blue-500/10 text-blue-400">
                                  {parlay.confidence} Confidence
                                </span>
                              </div>
                            </div>

                            {/* Reasoning */}
                            {parlay.reasoning && (
                              <div className="mt-3 p-3 bg-slate-700/30 rounded-lg border border-slate-600">
                                <div className="text-xs font-semibold text-slate-400 mb-1">🧠 AI Reasoning:</div>
                                <p className="text-sm text-slate-300">{parlay.reasoning}</p>
                              </div>
                            )}

                            {/* Quick Stats */}
                            <div className="grid grid-cols-5 gap-4 mt-4">
                              <div className="text-center">
                                <div className="text-xs text-slate-500">Legs</div>
                                <div className="text-lg font-bold">{parlay.legs.length}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-slate-500">Odds</div>
                                <div className="text-lg font-bold text-orange-400">{odds.american}</div>
                                {odds.discountApplied > 0 && (
                                  <div className="text-xs text-slate-500 mt-1">
                                    -{odds.discountApplied.toFixed(0)}% SGP
                                  </div>
                                )}
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-slate-500">Hit Probability</div>
                                <div className="text-lg font-bold text-blue-400">{hitProb.toFixed(1)}%</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-slate-500">Potential Win</div>
                                <div className="text-lg font-bold text-green-400">${odds.profit.toFixed(2)}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-slate-500">Correlation</div>
                                <div className={`text-lg font-bold ${calculateCorrelation(parlay.legs) > 20 ? 'text-green-400' : calculateCorrelation(parlay.legs) > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                                  {calculateCorrelation(parlay.legs) > 20 ? 'Low' : calculateCorrelation(parlay.legs) > 0 ? 'Med' : 'High'}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Legs */}
                          <div className="p-6">
                            <h5 className="text-sm font-bold text-slate-400 mb-3">Parlay Legs</h5>
                            <div className="space-y-3">
                              {parlay.legs.map((leg: any, idx: number) => (
                                <div key={`${leg.player_id}-${idx}`} className="bg-slate-700/30 rounded-lg p-4 border border-slate-600">
                                  <div className="flex items-start gap-3">
                                    <div className="flex items-center gap-2 flex-1">
                                      <PlayerImage
                                        src={leg.player_headshot}
                                        alt={leg.player_name}
                                        className="w-10 h-10 rounded-full bg-slate-700 object-cover"
                                        fallbackInitial={leg.player_name?.charAt(0) || '?'}
                                      />
                                      <div className="flex-1">
                                        <div className="font-semibold text-sm">{leg.player_name}</div>
                                        <div className="text-xs text-slate-400">{leg.type}</div>
                                        <div className="text-xs mt-1">
                                          <span className={leg.recommended_pick === 'over' ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                                            {leg.recommended_pick.toUpperCase()} {leg.line}
                                          </span>
                                          <span className="text-slate-500"> ({leg.recommended_odds})</span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-xs text-slate-500 mb-1">Prediction</div>
                                      <div className="text-lg font-bold text-orange-400">{leg.predicted_value.toFixed(1)}</div>
                                      <div className="text-xs">
                                        <span className={leg.edge > 0 ? 'text-green-400' : 'text-red-400'}>
                                          {leg.edge > 0 ? '+' : ''}{leg.edge.toFixed(1)} edge
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="p-6 bg-slate-700/30 border-t border-slate-700">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-xs text-slate-500">Bet ${betAmount.toFixed(2)} to win</div>
                                <div className="text-2xl font-bold text-green-400">${odds.profit.toFixed(2)}</div>
                                <div className="text-xs text-slate-500">Total payout: ${odds.payout.toFixed(2)}</div>
                              </div>
                              <button
                                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 rounded-lg font-bold text-white transition-all shadow-lg"
                                onClick={() => {
                                  // Copy to clipboard
                                  const text = `${parlay.name}\n` + parlay.legs.map((leg: any, i: number) =>
                                    `${i + 1}. ${leg.player_name} - ${leg.type} ${leg.recommended_pick.toUpperCase()} ${leg.line} (${leg.recommended_odds})`
                                  ).join('\n') + `\nOdds: ${odds.american} | To Win: $${odds.profit.toFixed(2)}`;
                                  navigator.clipboard.writeText(text);
                                }}
                              >
                                Copy Parlay
                              </button>
                            </div>
                          </div>
                        </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-slate-800 rounded-xl p-12 border border-slate-700 text-center">
                  <div className="text-6xl mb-4">🎲</div>
                  <h4 className="text-xl font-bold mb-2">Ready to Find the Best Parlays?</h4>
                  <p className="text-slate-400 mb-6">
                    Click "Generate Parlays" to analyze all available props and create optimal parlay combinations
                  </p>
                  <div className="max-w-md mx-auto text-left text-sm text-slate-400 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Analyzes prediction models and Vegas lines</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Considers historical performance and game context</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Generates multiple parlay options (safe, balanced, aggressive)</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Shows expected hit probability and reasoning</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
