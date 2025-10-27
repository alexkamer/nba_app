-- Add indexes to speed up common queries

-- Indexes for player_boxscores
CREATE INDEX IF NOT EXISTS idx_pb_athlete_date ON player_boxscores(athlete_id, game_id);
CREATE INDEX IF NOT EXISTS idx_pb_game ON player_boxscores(game_id);
CREATE INDEX IF NOT EXISTS idx_pb_dnp ON player_boxscores(athlete_didNotPlay);

-- Indexes for basic_events
CREATE INDEX IF NOT EXISTS idx_be_date ON basic_events(date DESC);
CREATE INDEX IF NOT EXISTS idx_be_season_type ON basic_events(season, event_season_type);

-- Indexes for team_boxscores
CREATE INDEX IF NOT EXISTS idx_tb_game ON team_boxscores(game_id);

-- Indexes for athletes
CREATE INDEX IF NOT EXISTS idx_athletes_name ON athletes(athlete_display_name);

-- Indexes for teams
CREATE INDEX IF NOT EXISTS idx_teams_season ON teams(team_id, season);

-- Indexes for rosters
CREATE INDEX IF NOT EXISTS idx_rosters_athlete ON rosters(athlete_id);

ANALYZE;
