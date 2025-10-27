"""
Database optimization script - adds indexes and creates aggregate tables
Run this after initial data load to dramatically improve query performance
"""

from sqlalchemy import create_engine, text
import time

def add_indexes(engine):
    """Add indexes to speed up common queries"""

    indexes = [
        # Player boxscore indexes
        "CREATE INDEX IF NOT EXISTS idx_player_boxscore_athlete ON player_boxscores(athlete_id)",
        "CREATE INDEX IF NOT EXISTS idx_player_boxscore_game ON player_boxscores(game_id)",
        "CREATE INDEX IF NOT EXISTS idx_player_boxscore_season ON player_boxscores(season)",
        "CREATE INDEX IF NOT EXISTS idx_player_boxscore_team ON player_boxscores(team_id)",

        # Team boxscore indexes
        "CREATE INDEX IF NOT EXISTS idx_team_boxscore_season ON team_boxscores(season)",
        "CREATE INDEX IF NOT EXISTS idx_team_boxscore_home ON team_boxscores(home_team_id)",
        "CREATE INDEX IF NOT EXISTS idx_team_boxscore_away ON team_boxscores(away_team_id)",

        # Play-by-play indexes
        "CREATE INDEX IF NOT EXISTS idx_play_game ON play_by_play(game_id)",
        "CREATE INDEX IF NOT EXISTS idx_play_season ON play_by_play(season)",
        "CREATE INDEX IF NOT EXISTS idx_play_participant1 ON play_by_play(participant_1_id)",
        "CREATE INDEX IF NOT EXISTS idx_play_team ON play_by_play(team_id)",
        "CREATE INDEX IF NOT EXISTS idx_play_type ON play_by_play(playType_id)",

        # Other indexes
        "CREATE INDEX IF NOT EXISTS idx_team_season ON teams(season)",
        "CREATE INDEX IF NOT EXISTS idx_roster_athlete ON rosters(athlete_id)",
        "CREATE INDEX IF NOT EXISTS idx_roster_team ON rosters(team_id)",
    ]

    print("Adding indexes...")
    with engine.connect() as conn:
        for idx_sql in indexes:
            start = time.time()
            conn.execute(text(idx_sql))
            elapsed = time.time() - start
            print(f"  ✓ {idx_sql.split('idx_')[1].split(' ')[0]} ({elapsed:.2f}s)")
        conn.commit()

    print("\nIndexes created successfully!")


def create_aggregate_tables(engine):
    """Create pre-computed aggregate tables for fast queries"""

    print("\nCreating aggregate tables...")

    with engine.connect() as conn:
        # Player season aggregates
        print("  Creating player_season_stats...")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS player_season_stats AS
            SELECT
                athlete_id,
                season,
                COUNT(DISTINCT game_id) as games_played,
                SUM(CAST(points AS REAL)) as total_points,
                AVG(CAST(points AS REAL)) as avg_points,
                SUM(CAST(rebounds AS REAL)) as total_rebounds,
                AVG(CAST(rebounds AS REAL)) as avg_rebounds,
                SUM(CAST(assists AS REAL)) as total_assists,
                AVG(CAST(assists AS REAL)) as avg_assists,
                SUM(CAST(steals AS REAL)) as total_steals,
                AVG(CAST(steals AS REAL)) as avg_steals,
                SUM(CAST(blocks AS REAL)) as total_blocks,
                AVG(CAST(blocks AS REAL)) as avg_blocks,
                SUM(CAST(turnovers AS REAL)) as total_turnovers,
                AVG(CAST(turnovers AS REAL)) as avg_turnovers
            FROM player_boxscores
            WHERE points IS NOT NULL
                AND points != ''
            GROUP BY athlete_id, season
        """))

        # Add index on player_season_stats
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_player_season_stats_athlete
            ON player_season_stats(athlete_id)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_player_season_stats_season
            ON player_season_stats(season)
        """))

        print("  Creating team_season_stats...")
        # Team season aggregates
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS team_season_stats AS
            SELECT
                season,
                home_team_id as team_id,
                COUNT(*) as games_played,
                SUM(CASE WHEN CAST(SUBSTR(away_fieldGoalsMade_fieldGoalsAttempted, 1, INSTR(away_fieldGoalsMade_fieldGoalsAttempted, '-')-1) AS INTEGER) >
                             CAST(SUBSTR(home_fieldGoalsMade_fieldGoalsAttempted, 1, INSTR(home_fieldGoalsMade_fieldGoalsAttempted, '-')-1) AS INTEGER)
                    THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN CAST(SUBSTR(away_fieldGoalsMade_fieldGoalsAttempted, 1, INSTR(away_fieldGoalsMade_fieldGoalsAttempted, '-')-1) AS INTEGER) <
                             CAST(SUBSTR(home_fieldGoalsMade_fieldGoalsAttempted, 1, INSTR(home_fieldGoalsMade_fieldGoalsAttempted, '-')-1) AS INTEGER)
                    THEN 1 ELSE 0 END) as losses
            FROM team_boxscores
            GROUP BY season, home_team_id
        """))

        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_team_season_stats_team
            ON team_season_stats(team_id)
        """))

        conn.commit()

    print("\nAggregate tables created successfully!")


def analyze_database(engine):
    """Run ANALYZE to update query planner statistics"""
    print("\nAnalyzing database...")
    with engine.connect() as conn:
        conn.execute(text("ANALYZE"))
        conn.commit()
    print("  ✓ Database analyzed")


def main():
    print("="*60)
    print("NBA Database Optimization Script")
    print("="*60)

    # Connect to database
    engine = create_engine('sqlite:///../../data/nba.db')

    start_time = time.time()

    # Run optimizations
    add_indexes(engine)
    create_aggregate_tables(engine)
    analyze_database(engine)

    elapsed = time.time() - start_time

    print("\n" + "="*60)
    print(f"Optimization complete! Total time: {elapsed:.2f}s")
    print("="*60)
    print("\nYour database is now optimized for fast queries!")
    print("Next step: Build the FastAPI backend")


if __name__ == "__main__":
    main()
