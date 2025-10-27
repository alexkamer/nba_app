export interface Player {
  athlete_id: string;
  athlete_display_name: string;
  athlete_position?: string;
  athlete_position_abbreviation?: string;
  athlete_headshot?: string;
  athlete_first_name?: string;
  athlete_last_name?: string;
  athlete_height?: string;
  athlete_display_height?: string;
  athlete_weight?: string;
  athlete_display_weight?: string;
  athlete_birth_date?: string;
  athlete_age?: number;
  athlete_jersey?: string;
  athlete_birth_place_city?: string;
  athlete_birth_place_state?: string;
  athlete_birth_place_country?: string;
  debut_year?: number;
  experience_years?: number;
  draft_info?: string;
  draft_year?: number;
  draft_round?: number;
  draft_pick?: number;
  salary?: number;
  team_id?: string;
  team_colors?: {
    primary?: string;
    secondary?: string;
  };
  team_name?: string;
  team_abbreviation?: string;
  team_logo?: string;
}

export interface PlayerSeasonStats {
  athlete_id: string;
  season: string;
  games_played: number;
  avg_points: number;
  avg_rebounds: number;
  avg_assists: number;
  avg_steals: number;
  avg_blocks: number;
  total_points: number;
  total_rebounds: number;
  total_assists: number;
}

export interface ShotPoint {
  play_id: string;
  x_coordinate: string;
  y_coordinate: string;
  text: string;
  playType_text?: string;
  made: boolean;
  quarter_number?: string;
  clock_display_value?: string;
}

export interface ShotChartData {
  athlete_id: string;
  athlete_name: string;
  season?: string;
  total_shots: number;
  made_shots: number;
  missed_shots: number;
  shooting_percentage: number;
  shots: ShotPoint[];
}

export interface StatLeader {
  athlete_id: string;
  athlete_name: string;
  season: string;
  stat_value: number;
  games_played: number;
}

export interface Team {
  team_id: string;
  season: string;
  team_display_name: string;
  team_abbreviation?: string;
  team_logo?: string;
}
