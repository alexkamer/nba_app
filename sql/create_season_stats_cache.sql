-- Create a pre-computed season stats table for faster queries
-- This eliminates the need for the LLM to calculate averages on every request

DROP TABLE IF EXISTS player_season_stats_cache;

CREATE TABLE player_season_stats_cache AS
SELECT
    pb.athlete_id,
    a.athlete_display_name,
    a.athlete_headshot,
    a.athlete_position,
    a.athlete_jersey,
    be.season,
    be.event_season_type,
    COUNT(*) as games_played,
    ROUND(AVG(CAST(pb.points AS FLOAT)), 1) as avg_points,
    ROUND(AVG(CAST(pb.rebounds AS FLOAT)), 1) as avg_rebounds,
    ROUND(AVG(CAST(pb.assists AS FLOAT)), 1) as avg_assists,
    ROUND(AVG(CAST(pb.minutes AS FLOAT)), 1) as avg_minutes,
    ROUND(AVG(CAST(pb.plusMinus AS FLOAT)), 1) as avg_plus_minus
FROM player_boxscores pb
JOIN basic_events be ON pb.game_id = be.event_id
JOIN athletes a ON pb.athlete_id = a.athlete_id
WHERE pb.athlete_didNotPlay IS NOT 1  -- Exclude DNP games
GROUP BY pb.athlete_id, a.athlete_display_name, a.athlete_headshot,
         a.athlete_position, a.athlete_jersey, be.season, be.event_season_type;

-- Create index for fast lookups
CREATE INDEX idx_season_stats_athlete ON player_season_stats_cache(athlete_id, season, event_season_type);
CREATE INDEX idx_season_stats_name ON player_season_stats_cache(athlete_display_name, season, event_season_type);
