import axios from 'axios';
import type { Player, PlayerSeasonStats, ShotChartData, StatLeader, Team } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add response interceptor for global error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Player API
export const playersAPI = {
  search: async (query: string): Promise<Player[]> => {
    const { data } = await api.get(`/players/search`, { params: { q: query } });
    return data;
  },

  getPlayer: async (athleteId: string): Promise<Player> => {
    const { data } = await api.get(`/players/${athleteId}`);
    return data;
  },

  getPlayerStats: async (athleteId: string, season?: string): Promise<{ athlete_id: string; seasons: PlayerSeasonStats[] }> => {
    const { data } = await api.get(`/players/${athleteId}/stats`, {
      params: season ? { season } : {},
    });
    return data;
  },

  getShotChart: async (athleteId: string, season?: string, gameId?: string): Promise<ShotChartData> => {
    const { data} = await api.get(`/players/${athleteId}/shot-chart`, {
      params: { season, game_id: gameId },
    });
    return data;
  },

  getCareerSummary: async (athleteId: string) => {
    const { data } = await api.get(`/players/${athleteId}/career-summary`);
    return data;
  },

  getCareerHighs: async (athleteId: string) => {
    const { data } = await api.get(`/players/${athleteId}/career-highs`);
    return data;
  },

  getPlayerGames: async (athleteId: string, season?: string, seasonType?: number, starterStatus?: string, location?: string, limit: number = 82) => {
    const { data } = await api.get(`/players/${athleteId}/gamelog`, {
      params: { season, seasonType, starter_status: starterStatus, location, limit },
    });
    return data;
  },

  getPlayerSeasons: async (athleteId: string): Promise<{ athlete_id: string; seasons: string[] }> => {
    const { data } = await api.get(`/players/${athleteId}/seasons`);
    return data;
  },

  getPlayerSplits: async (athleteId: string, season: string, teamId: string) => {
    const { data } = await api.get(`/players/${athleteId}/splits/${season}/${teamId}`);
    return data;
  },

  getPropHistory: async (athleteId: string, season: string = '2025', propType: string = 'Total Points', limit: number = 50) => {
    const { data } = await api.get(`/players/${athleteId}/prop-history`, {
      params: { season, prop_type: propType, limit },
    });
    return data;
  },
};

// Stats API
export const statsAPI = {
  getLeaders: async (stat: string = 'avg_points', season?: string, limit: number = 10): Promise<{ stat: string; season: string; leaders: StatLeader[] }> => {
    const { data } = await api.get(`/stats/leaders`, {
      params: { stat, season, limit },
    });
    return data;
  },

  compare: async (playerIds: string[], season?: string) => {
    const { data } = await api.get(`/stats/compare`, {
      params: { player_ids: playerIds.join(','), season },
    });
    return data;
  },
};

// Teams API
export const teamsAPI = {
  list: async (season?: string): Promise<Team[]> => {
    const { data } = await api.get(`/teams`, { params: { season } });
    return data;
  },
};

// Schedule API
export const scheduleAPI = {
  getSchedule: async (date: string) => {
    const { data } = await api.get(`/schedule`, {
      params: { date },
    });
    return data;
  },

  getTodaySchedule: async () => {
    const today = new Date();
    const dateStr = today.getFullYear() +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0');
    return scheduleAPI.getSchedule(dateStr);
  },
};

// Predictions API
export const predictionsAPI = {
  getSample: async (season: string = '2024', limit: number = 10) => {
    const { data } = await api.get(`/predictions/sample`, {
      params: { season, limit },
    });
    return data;
  },

  getPlayerGamePredictions: async (athleteId: string, gameId: string, statTypes: string = 'points,rebounds,assists') => {
    const { data } = await api.get(`/predictions/player/${athleteId}/game/${gameId}`, {
      params: { stat_types: statTypes },
    });
    return data;
  },

  getGamePredictions: async (gameId: string, statTypes: string = 'points', minVegasLine?: number, confidence?: string) => {
    const { data } = await api.get(`/predictions/game/${gameId}`, {
      params: { stat_types: statTypes, min_vegas_line: minVegasLine, confidence },
    });
    return data;
  },

  getBiggestEdges: async (season: string = '2024', statType: string = 'points', minEdge: number = 2.0, limit: number = 20) => {
    const { data } = await api.get(`/predictions/edges`, {
      params: { season, stat_type: statType, min_edge: minEdge, limit },
    });
    return data;
  },

  generatePrediction: async (athleteId: string, gameId: string, statType: string) => {
    const { data } = await api.post(`/predictions/generate`, {
      athlete_id: athleteId,
      game_id: gameId,
      stat_type: statType,
    });
    return data;
  },
};

export default api;
