"""Statistics and analytics endpoints"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List
from database.session import get_db
from api.cache import cache_response
import numpy as np
from scipy import stats as scipy_stats

router = APIRouter()


@router.get("/first-basket")
@cache_response(ttl_seconds=3600)  # Cache for 1 hour
def get_first_basket(
    date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get the first basket scorers for all games on a specific date (Central Time)"""

    # If no date provided, get the most recent game date with play-by-play data
    if not date:
        date_query = text("""
            SELECT date(datetime(e.date, '-6 hours')) as local_date
            FROM basic_events e
            WHERE EXISTS (
                SELECT 1 FROM play_by_play pbp
                WHERE pbp.game_id = e.event_id
                AND pbp.scoring_play = '1'
            )
            AND e.date IS NOT NULL
            AND e.date < datetime('now')
            ORDER BY e.date DESC
            LIMIT 1
        """)
        date_result = db.execute(date_query).fetchone()
        if date_result:
            date = date_result[0]
        else:
            raise HTTPException(status_code=404, detail="No games found")

    # Query to get first basket for each game and team (excluding free throws)
    query = text("""
        WITH game_first_baskets AS (
            SELECT
                pbp.game_id,
                pbp.team_id,
                pbp.participant_1_id as athlete_id,
                pbp.text as play_description,
                pbp.awayScore,
                pbp.homeScore,
                pbp.sequenceNumber,
                ROW_NUMBER() OVER (PARTITION BY pbp.game_id ORDER BY CAST(pbp.sequenceNumber AS INTEGER)) as game_rank,
                ROW_NUMBER() OVER (PARTITION BY pbp.game_id, pbp.team_id ORDER BY CAST(pbp.sequenceNumber AS INTEGER)) as team_rank
            FROM play_by_play pbp
            JOIN basic_events e ON pbp.game_id = e.event_id
            WHERE date(datetime(e.date, '-6 hours')) = :date
                AND pbp.scoring_play = '1'
                AND pbp.participant_1_id IS NOT NULL
                AND pbp.participant_1_id != ''
                AND pbp.playType_text NOT LIKE 'Free Throw%'
        )
        SELECT
            gfb.game_id,
            e.event_name,
            e.date as game_date,
            tb.away_team_id,
            tb.away_team_name,
            tb.home_team_id,
            tb.home_team_name,
            at_away.team_logo as away_team_logo,
            at_away.team_color as away_team_color,
            at_home.team_logo as home_team_logo,
            at_home.team_color as home_team_color,
            gfb.athlete_id as first_basket_athlete_id,
            a_first.athlete_display_name as first_basket_player_name,
            a_first.athlete_headshot as first_basket_player_headshot,
            gfb.team_id as first_basket_team_id,
            gfb.play_description as first_basket_description,
            gfb_away.athlete_id as away_first_athlete_id,
            a_away.athlete_display_name as away_first_player_name,
            a_away.athlete_headshot as away_first_player_headshot,
            gfb_away.play_description as away_first_description,
            gfb_home.athlete_id as home_first_athlete_id,
            a_home.athlete_display_name as home_first_player_name,
            a_home.athlete_headshot as home_first_player_headshot,
            gfb_home.play_description as home_first_description
        FROM game_first_baskets gfb
        JOIN basic_events e ON gfb.game_id = e.event_id
        JOIN team_boxscores tb ON gfb.game_id = tb.game_id
        LEFT JOIN athletes a_first ON gfb.athlete_id = a_first.athlete_id
        LEFT JOIN teams at_away ON tb.away_team_id = at_away.team_id AND e.season = at_away.season
        LEFT JOIN teams at_home ON tb.home_team_id = at_home.team_id AND e.season = at_home.season
        LEFT JOIN game_first_baskets gfb_away ON gfb.game_id = gfb_away.game_id
            AND tb.away_team_id = gfb_away.team_id
            AND gfb_away.team_rank = 1
        LEFT JOIN athletes a_away ON gfb_away.athlete_id = a_away.athlete_id
        LEFT JOIN game_first_baskets gfb_home ON gfb.game_id = gfb_home.game_id
            AND tb.home_team_id = gfb_home.team_id
            AND gfb_home.team_rank = 1
        LEFT JOIN athletes a_home ON gfb_home.athlete_id = a_home.athlete_id
        WHERE gfb.game_rank = 1
        ORDER BY e.date
    """)

    result = db.execute(query, {"date": date}).fetchall()

    if not result:
        raise HTTPException(status_code=404, detail=f"No games found for date {date}")

    games = [dict(row._mapping) for row in result]

    return {
        "date": date,
        "games": games
    }


@router.get("/king-of-the-court/month/summary")
@cache_response(ttl_seconds=3600)  # Cache for 1 hour
def get_king_of_the_court_month_summary(
    year: int = Query(..., description="Year (e.g., 2025)"),
    month: int = Query(..., description="Month (1-12)"),
    db: Session = Depends(get_db)
):
    """Get summary statistics for King of the Court for a specific month"""

    # Validate month
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12")

    month_str = f"{month:02d}"

    # Get monthly MVP (player with most wins)
    monthly_mvp_query = text("""
        WITH daily_kings AS (
            SELECT
                pb.athlete_id,
                a.athlete_display_name as player_name,
                a.athlete_headshot as player_headshot,
                date(datetime(e.date, '-6 hours')) as game_date,
                (pb.points + pb.rebounds + pb.assists) as total_score,
                ROW_NUMBER() OVER (PARTITION BY date(datetime(e.date, '-6 hours')) ORDER BY (pb.points + pb.rebounds + pb.assists) DESC) as daily_rank
            FROM basic_events e
            JOIN player_boxscores pb ON e.event_id = pb.game_id
            JOIN athletes a ON pb.athlete_id = a.athlete_id
            WHERE strftime('%Y', datetime(e.date, '-6 hours')) = :year
                AND strftime('%m', datetime(e.date, '-6 hours')) = :month
                AND pb.athlete_didNotPlay = '0'
                AND pb.points IS NOT NULL
                AND pb.rebounds IS NOT NULL
                AND pb.assists IS NOT NULL
        )
        SELECT
            athlete_id,
            player_name,
            player_headshot,
            COUNT(*) as win_count
        FROM daily_kings
        WHERE daily_rank = 1
        GROUP BY athlete_id, player_name, player_headshot
        ORDER BY win_count DESC
        LIMIT 1
    """)

    mvp_result = db.execute(monthly_mvp_query, {"year": str(year), "month": month_str}).fetchone()

    # Get highest single day score
    highest_score_query = text("""
        SELECT
            pb.athlete_id,
            a.athlete_display_name as player_name,
            a.athlete_headshot as player_headshot,
            date(datetime(e.date, '-6 hours')) as game_date,
            pb.points,
            pb.rebounds,
            pb.assists,
            (pb.points + pb.rebounds + pb.assists) as total_score
        FROM basic_events e
        JOIN player_boxscores pb ON e.event_id = pb.game_id
        JOIN athletes a ON pb.athlete_id = a.athlete_id
        WHERE strftime('%Y', datetime(e.date, '-6 hours')) = :year
            AND strftime('%m', datetime(e.date, '-6 hours')) = :month
            AND pb.athlete_didNotPlay = '0'
            AND pb.points IS NOT NULL
            AND pb.rebounds IS NOT NULL
            AND pb.assists IS NOT NULL
        ORDER BY total_score DESC
        LIMIT 1
    """)

    highest_score = db.execute(highest_score_query, {"year": str(year), "month": month_str}).fetchone()

    # Get team with most wins
    team_wins_query = text("""
        WITH daily_kings AS (
            SELECT
                pb.team_id,
                t.team_display_name as team_name,
                t.team_logo as team_logo,
                t.team_color as team_color,
                date(datetime(e.date, '-6 hours')) as game_date,
                (pb.points + pb.rebounds + pb.assists) as total_score,
                ROW_NUMBER() OVER (PARTITION BY date(datetime(e.date, '-6 hours')) ORDER BY (pb.points + pb.rebounds + pb.assists) DESC) as daily_rank
            FROM basic_events e
            JOIN player_boxscores pb ON e.event_id = pb.game_id
            LEFT JOIN teams t ON pb.team_id = t.team_id AND e.season = t.season
            WHERE strftime('%Y', datetime(e.date, '-6 hours')) = :year
                AND strftime('%m', datetime(e.date, '-6 hours')) = :month
                AND pb.athlete_didNotPlay = '0'
                AND pb.points IS NOT NULL
                AND pb.rebounds IS NOT NULL
                AND pb.assists IS NOT NULL
        )
        SELECT
            team_id,
            team_name,
            team_logo,
            team_color,
            COUNT(*) as win_count
        FROM daily_kings
        WHERE daily_rank = 1 AND team_id IS NOT NULL
        GROUP BY team_id, team_name, team_logo, team_color
        ORDER BY win_count DESC
        LIMIT 1
    """)

    team_wins = db.execute(team_wins_query, {"year": str(year), "month": month_str}).fetchone()

    return {
        "year": year,
        "month": month,
        "monthly_mvp": dict(mvp_result._mapping) if mvp_result else None,
        "highest_score": dict(highest_score._mapping) if highest_score else None,
        "top_team": dict(team_wins._mapping) if team_wins else None
    }


@router.get("/king-of-the-court/month")
@cache_response(ttl_seconds=3600)  # Cache for 1 hour
def get_king_of_the_court_month(
    year: int = Query(..., description="Year (e.g., 2025)"),
    month: int = Query(..., description="Month (1-12)"),
    db: Session = Depends(get_db)
):
    """Get all King of the Court winners for a specific month (Central Time)"""

    # Validate month
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12")

    # Query to get the king for each date in the month
    query = text("""
        WITH daily_games AS (
            SELECT DISTINCT date(datetime(e.date, '-6 hours')) as game_date
            FROM basic_events e
            WHERE strftime('%Y', datetime(e.date, '-6 hours')) = :year
                AND strftime('%m', datetime(e.date, '-6 hours')) = :month
        )
        SELECT
            dg.game_date as date,
            pb.athlete_id,
            a.athlete_display_name as player_name,
            a.athlete_headshot as player_headshot,
            pb.team_id,
            t.team_display_name as team_name,
            t.team_abbreviation as team_abbreviation,
            t.team_logo as team_logo,
            t.team_color as team_color,
            pb.points,
            pb.rebounds,
            pb.assists,
            (pb.points + pb.rebounds + pb.assists) as total_score
        FROM daily_games dg
        JOIN basic_events e ON date(datetime(e.date, '-6 hours')) = dg.game_date
        JOIN player_boxscores pb ON e.event_id = pb.game_id
        JOIN athletes a ON pb.athlete_id = a.athlete_id
        LEFT JOIN teams t ON pb.team_id = t.team_id AND e.season = t.season
        WHERE pb.athlete_didNotPlay = '0'
            AND pb.points IS NOT NULL
            AND pb.rebounds IS NOT NULL
            AND pb.assists IS NOT NULL
        GROUP BY dg.game_date
        HAVING (pb.points + pb.rebounds + pb.assists) = MAX(pb.points + pb.rebounds + pb.assists)
        ORDER BY dg.game_date
    """)

    # Format month with leading zero
    month_str = f"{month:02d}"

    result = db.execute(query, {"year": str(year), "month": month_str}).fetchall()

    daily_kings = [dict(row._mapping) for row in result]

    return {
        "year": year,
        "month": month,
        "daily_kings": daily_kings
    }


@router.get("/king-of-the-court")
@cache_response(ttl_seconds=600)  # Cache for 10 minutes
def get_king_of_the_court(
    date: Optional[str] = None,
    limit: int = Query(5, ge=1, le=50, description="Number of top players to return"),
    db: Session = Depends(get_db)
):
    """Get the player with the most points + rebounds + assists for a specific date (Central Time)"""

    # If no date provided, get the most recent game date in Central Time
    if not date:
        date_query = text("""
            SELECT date(datetime(date, '-6 hours')) as local_date
            FROM basic_events
            WHERE date IS NOT NULL
            ORDER BY date DESC
            LIMIT 1
        """)
        date_result = db.execute(date_query).fetchone()
        if date_result:
            date = date_result[0]  # Already in YYYY-MM-DD format
        else:
            raise HTTPException(status_code=404, detail="No games found")

    # Query to find the king for the given date (convert UTC to Central Time)
    # Start from events table (smaller) and join to player_boxscores for better performance
    query = text("""
        SELECT
            pb.athlete_id,
            a.athlete_display_name as player_name,
            a.athlete_headshot as player_headshot,
            pb.team_id,
            t.team_display_name as team_name,
            t.team_logo as team_logo,
            t.team_color as team_color,
            pb.points,
            pb.rebounds,
            pb.assists,
            (pb.points + pb.rebounds + pb.assists) as total_score,
            pb.game_id,
            e.event_name as game_name,
            e.date as game_date
        FROM basic_events e
        JOIN player_boxscores pb ON e.event_id = pb.game_id
        JOIN athletes a ON pb.athlete_id = a.athlete_id
        LEFT JOIN teams t ON pb.team_id = t.team_id AND e.season = t.season
        WHERE date(datetime(e.date, '-6 hours')) = :date
            AND pb.athlete_didNotPlay = '0'
            AND pb.points IS NOT NULL
            AND pb.rebounds IS NOT NULL
            AND pb.assists IS NOT NULL
        ORDER BY total_score DESC
        LIMIT 1
    """)

    result = db.execute(query, {"date": date}).fetchone()

    if not result:
        raise HTTPException(status_code=404, detail=f"No games found for date {date}")

    king_data = dict(result._mapping)

    # Get top N for context
    top_n_query = text("""
        SELECT
            pb.athlete_id,
            a.athlete_display_name as player_name,
            a.athlete_headshot as player_headshot,
            pb.team_id,
            t.team_display_name as team_name,
            t.team_logo as team_logo,
            pb.points,
            pb.rebounds,
            pb.assists,
            (pb.points + pb.rebounds + pb.assists) as total_score,
            pb.game_id
        FROM basic_events e
        JOIN player_boxscores pb ON e.event_id = pb.game_id
        JOIN athletes a ON pb.athlete_id = a.athlete_id
        LEFT JOIN teams t ON pb.team_id = t.team_id AND e.season = t.season
        WHERE date(datetime(e.date, '-6 hours')) = :date
            AND pb.athlete_didNotPlay = '0'
            AND pb.points IS NOT NULL
            AND pb.rebounds IS NOT NULL
            AND pb.assists IS NOT NULL
        ORDER BY total_score DESC
        LIMIT :limit
    """)

    top_n_result = db.execute(top_n_query, {"date": date, "limit": limit}).fetchall()
    top_n = [dict(row._mapping) for row in top_n_result]

    return {
        "date": date,
        "king": king_data,
        "top_5": top_n  # Keep the key name for backwards compatibility
    }


@router.get("/leaders")
@cache_response(ttl_seconds=600)  # Cache for 10 minutes
def get_stat_leaders(
    stat: str = Query("avg_points", description="Stat to rank by"),
    season: Optional[str] = None,
    limit: int = Query(10, le=100),
    db: Session = Depends(get_db)
):
    """Get stat leaders"""

    valid_stats = [
        "avg_points", "avg_rebounds", "avg_assists",
        "avg_steals", "avg_blocks", "total_points",
        "total_rebounds", "total_assists"
    ]

    if stat not in valid_stats:
        stat = "avg_points"

    query = text(f"""
        SELECT
            pss.athlete_id,
            a.athlete_display_name as athlete_name,
            pss.season,
            pss.{stat} as stat_value,
            pss.games_played
        FROM player_season_stats pss
        JOIN athletes a ON pss.athlete_id = a.athlete_id
        WHERE pss.games_played >= 20
    """)

    if season:
        query = text(str(query) + " AND pss.season = :season")
        params = {"season": season}
    else:
        params = {}

    query = text(str(query) + f" ORDER BY pss.{stat} DESC LIMIT :limit")
    params["limit"] = limit

    result = db.execute(query, params).fetchall()

    leaders = [dict(row._mapping) for row in result]

    return {
        "stat": stat,
        "season": season or "all",
        "leaders": leaders
    }


@router.get("/trends")
@cache_response(ttl_seconds=1800)  # Cache for 30 minutes - rarely changes
def get_trends(
    stat: str = Query("avg_points", description="Stat to analyze"),
    db: Session = Depends(get_db)
):
    """Get historical trends for a stat across seasons"""

    query = text(f"""
        SELECT
            season,
            AVG({stat}) as avg_value,
            MAX({stat}) as max_value,
            MIN({stat}) as min_value
        FROM player_season_stats
        WHERE games_played >= 20
        GROUP BY season
        ORDER BY season
    """)

    result = db.execute(query).fetchall()

    trends = [dict(row._mapping) for row in result]

    return {
        "stat": stat,
        "trends": trends
    }


@router.get("/compare")
def compare_players(
    player_ids: str = Query(..., description="Comma-separated player IDs"),
    season: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Compare multiple players"""

    ids = [id.strip() for id in player_ids.split(",")]

    query = text("""
        SELECT
            pss.athlete_id,
            a.athlete_display_name as athlete_name,
            pss.season,
            pss.games_played,
            pss.avg_points,
            pss.avg_rebounds,
            pss.avg_assists,
            pss.avg_steals,
            pss.avg_blocks
        FROM player_season_stats pss
        JOIN athletes a ON pss.athlete_id = a.athlete_id
        WHERE pss.athlete_id IN :ids
    """)

    params = {"ids": tuple(ids)}

    if season:
        query = text(str(query) + " AND pss.season = :season")
        params["season"] = season

    result = db.execute(query, params).fetchall()

    comparison = [dict(row._mapping) for row in result]

    return {
        "players": comparison,
        "season": season or "all"
    }


@router.get("/correlation")
def analyze_correlation(
    player1_id: str = Query(..., description="First player ID"),
    player1_stat: str = Query(..., description="Stat for player 1 (points, rebounds, assists, etc.)"),
    player2_id: str = Query(..., description="Second player ID"),
    player2_stat: str = Query(..., description="Stat for player 2"),
    season: str = Query("2026", description="Season to analyze (not used - analyzes last 10 games)"),
    min_games: int = Query(5, description="Minimum games played together"),
    db: Session = Depends(get_db)
):
    """
    Analyze correlation between two players' stats in their last 10 regular season games together
    Example: Does Player A's points correlate with Player B's assists?
    """

    # Map friendly stat names to database columns
    stat_mapping = {
        'points': 'points',
        'rebounds': 'rebounds',
        'assists': 'assists',
        'steals': 'steals',
        'blocks': 'blocks',
        'turnovers': 'turnovers',
        'threes': 'threePointFieldGoalsMade_threePointFieldGoalsAttempted',
        'fg_pct': 'fieldGoalsMade_fieldGoalsAttempted',
        'minutes': 'minutes'
    }

    # Validate stats
    if player1_stat not in stat_mapping:
        raise HTTPException(status_code=400, detail=f"Invalid stat: {player1_stat}. Valid options: {list(stat_mapping.keys())}")
    if player2_stat not in stat_mapping:
        raise HTTPException(status_code=400, detail=f"Invalid stat: {player2_stat}. Valid options: {list(stat_mapping.keys())}")

    col1 = stat_mapping[player1_stat]
    col2 = stat_mapping[player2_stat]

    # Get last 10 regular season games where both players played together (across all seasons)
    query = text(f"""
        SELECT
            p1.game_id,
            p1.{col1} as player1_value,
            p2.{col2} as player2_value,
            p1.team_id,
            p1.athlete_id as player1_id,
            p2.athlete_id as player2_id,
            a1.athlete_display_name as player1_name,
            a2.athlete_display_name as player2_name,
            e.date as game_date,
            e.event_name,
            CASE
                WHEN p1.team_id = tb.home_team_id THEN 'home'
                WHEN p1.team_id = tb.away_team_id THEN 'away'
                ELSE 'unknown'
            END as home_away,
            COALESCE(e.event_name, 'Unknown') as opponent_abbreviation,
            COALESCE(e.event_name, 'Unknown Opponent') as opponent_name
        FROM player_boxscores p1
        JOIN player_boxscores p2 ON p1.game_id = p2.game_id AND p1.team_id = p2.team_id
        JOIN athletes a1 ON p1.athlete_id = a1.athlete_id
        JOIN athletes a2 ON p2.athlete_id = a2.athlete_id
        JOIN basic_events e ON p1.game_id = e.event_id
        JOIN team_boxscores tb ON p1.game_id = tb.game_id
        WHERE p1.athlete_id = :player1_id
            AND p2.athlete_id = :player2_id
            AND p1.athlete_didNotPlay = '0'
            AND p2.athlete_didNotPlay = '0'
            AND p1.{col1} IS NOT NULL
            AND p2.{col2} IS NOT NULL
            AND e.event_season_type = 2
        ORDER BY e.date DESC
        LIMIT 10
    """)

    result = db.execute(query, {
        "player1_id": player1_id,
        "player2_id": player2_id
    }).fetchall()

    if len(result) < min_games:
        return {
            "error": f"Not enough games together. Found {len(result)}, need at least {min_games}",
            "games_found": len(result),
            "player1_id": player1_id,
            "player2_id": player2_id
        }

    # Extract player names from first row
    player1_name = result[0].player1_name if result else "Unknown"
    player2_name = result[0].player2_name if result else "Unknown"

    # Map stat names to prop types
    stat_to_prop_type = {
        'points': 'Total Points',
        'rebounds': 'Total Rebounds',
        'assists': 'Total Assists',
        'steals': 'Total Steals',
        'blocks': 'Total Blocks',
        'threes': 'Total 3-Point Field Goals'
    }

    # Get all game IDs for prop lookup
    game_ids = [row.game_id for row in result]

    # Fetch props for both players for these games
    # Build IN clause placeholders for SQLite
    game_ids_placeholders = ','.join([f"'{gid}'" for gid in game_ids])
    athlete_ids_placeholders = f"'{player1_id}', '{player2_id}'"

    prop_types_to_fetch = [stat_to_prop_type.get(player1_stat), stat_to_prop_type.get(player2_stat)]
    prop_types_to_fetch = [pt for pt in prop_types_to_fetch if pt is not None]

    props_result = []
    if prop_types_to_fetch and game_ids:
        prop_types_placeholders = ','.join([f"'{pt}'" for pt in prop_types_to_fetch])

        prop_query = text(f"""
            SELECT
                game_id,
                athlete_id,
                prop_type,
                line,
                over_odds,
                under_odds,
                provider
            FROM player_props
            WHERE game_id IN ({game_ids_placeholders})
                AND athlete_id IN ({athlete_ids_placeholders})
                AND prop_type IN ({prop_types_placeholders})
            ORDER BY
                CASE WHEN over_odds IS NOT NULL AND under_odds IS NOT NULL THEN 0 ELSE 1 END,
                provider
        """)

        props_result = db.execute(prop_query).fetchall()

    # Build a props lookup: {game_id: {athlete_id: {prop_type: {line, over_odds, under_odds}}}}
    props_lookup = {}
    for prop in props_result:
        if prop.game_id not in props_lookup:
            props_lookup[prop.game_id] = {}
        if prop.athlete_id not in props_lookup[prop.game_id]:
            props_lookup[prop.game_id][prop.athlete_id] = {}
        # Store first prop found (prefer first provider)
        if prop.prop_type not in props_lookup[prop.game_id][prop.athlete_id]:
            props_lookup[prop.game_id][prop.athlete_id][prop.prop_type] = {
                'line': float(prop.line) if prop.line else None,
                'over_odds': prop.over_odds,
                'under_odds': prop.under_odds
            }

    # Parse data points
    data_points = []
    player1_values = []
    player2_values = []

    for row in result:
        # Handle special cases like "X-Y" format for shooting stats
        try:
            if col1 in ['threePointFieldGoalsMade_threePointFieldGoalsAttempted', 'fieldGoalsMade_fieldGoalsAttempted', 'freeThrowsMade_freeThrowsAttempted']:
                val1 = int(row.player1_value.split('-')[0]) if row.player1_value else 0
            else:
                val1 = float(row.player1_value) if row.player1_value is not None else 0

            if col2 in ['threePointFieldGoalsMade_threePointFieldGoalsAttempted', 'fieldGoalsMade_fieldGoalsAttempted', 'freeThrowsMade_freeThrowsAttempted']:
                val2 = int(row.player2_value.split('-')[0]) if row.player2_value else 0
            else:
                val2 = float(row.player2_value) if row.player2_value is not None else 0

            # Get prop data for this game
            game_props = props_lookup.get(row.game_id, {})

            player1_prop_type = stat_to_prop_type.get(player1_stat)
            player2_prop_type = stat_to_prop_type.get(player2_stat)

            player1_prop_data = game_props.get(player1_id, {}).get(player1_prop_type) if player1_prop_type else None
            player2_prop_data = game_props.get(player2_id, {}).get(player2_prop_type) if player2_prop_type else None

            # Extract line and odds
            player1_line = player1_prop_data.get('line') if player1_prop_data else None
            player1_over_odds = player1_prop_data.get('over_odds') if player1_prop_data else None
            player1_under_odds = player1_prop_data.get('under_odds') if player1_prop_data else None

            player2_line = player2_prop_data.get('line') if player2_prop_data else None
            player2_over_odds = player2_prop_data.get('over_odds') if player2_prop_data else None
            player2_under_odds = player2_prop_data.get('under_odds') if player2_prop_data else None

            # Determine if prop hit (over) - convert to Python bool for JSON serialization
            player1_hit = bool(val1 > player1_line) if player1_line is not None else None
            player2_hit = bool(val2 > player2_line) if player2_line is not None else None

            player1_values.append(val1)
            player2_values.append(val2)
            data_points.append({
                "game_id": row.game_id,
                "game_date": row.game_date,
                "opponent_abbreviation": row.opponent_abbreviation,
                "opponent_name": row.opponent_name,
                "home_away": row.home_away,
                "player1_value": val1,
                "player2_value": val2,
                "player1_line": player1_line,
                "player1_over_odds": player1_over_odds,
                "player1_under_odds": player1_under_odds,
                "player2_line": player2_line,
                "player2_over_odds": player2_over_odds,
                "player2_under_odds": player2_under_odds,
                "player1_hit_over": player1_hit,
                "player2_hit_over": player2_hit
            })
        except (ValueError, AttributeError):
            continue

    if len(player1_values) < min_games:
        return {
            "error": f"Not enough valid data points after parsing. Got {len(player1_values)}",
            "games_found": len(result),
            "valid_data_points": len(player1_values)
        }

    # Calculate correlation
    correlation, p_value = scipy_stats.pearsonr(player1_values, player2_values)

    # Calculate additional statistics
    player1_array = np.array(player1_values)
    player2_array = np.array(player2_values)

    # Linear regression for prediction
    slope, intercept, r_value, p_val_reg, std_err = scipy_stats.linregress(player1_values, player2_values)

    # Categorize correlation strength
    if abs(correlation) >= 0.7:
        strength = "Strong"
    elif abs(correlation) >= 0.4:
        strength = "Moderate"
    elif abs(correlation) >= 0.2:
        strength = "Weak"
    else:
        strength = "Very Weak"

    direction = "Positive" if correlation > 0 else "Negative"

    # Statistical significance
    is_significant = bool(p_value < 0.05)

    return {
        "player1": {
            "id": player1_id,
            "name": player1_name,
            "stat": player1_stat,
            "avg": round(float(np.mean(player1_array)), 2),
            "std": round(float(np.std(player1_array)), 2),
            "min": float(np.min(player1_array)),
            "max": float(np.max(player1_array))
        },
        "player2": {
            "id": player2_id,
            "name": player2_name,
            "stat": player2_stat,
            "avg": round(float(np.mean(player2_array)), 2),
            "std": round(float(np.std(player2_array)), 2),
            "min": float(np.min(player2_array)),
            "max": float(np.max(player2_array))
        },
        "correlation": {
            "coefficient": round(float(correlation), 3),
            "p_value": round(float(p_value), 4),
            "is_significant": is_significant,
            "strength": strength,
            "direction": direction,
            "r_squared": round(float(r_value ** 2), 3)
        },
        "regression": {
            "slope": round(slope, 3),
            "intercept": round(intercept, 3),
            "equation": f"y = {round(slope, 2)}x + {round(intercept, 2)}",
            "interpretation": f"For every 1 {player1_stat} by {player1_name}, {player2_name}'s {player2_stat} changes by {round(slope, 2)}"
        },
        "data": {
            "games_analyzed": len(data_points),
            "season": "Last 10 regular season games",
            "data_points": data_points[:20]  # Return first 20 games for visualization
        },
        "betting_insight": {
            "summary": f"{strength} {direction.lower()} correlation between {player1_name}'s {player1_stat} and {player2_name}'s {player2_stat}",
            "actionable": bool(is_significant and abs(correlation) >= 0.4),
            "recommendation": get_betting_recommendation(correlation, is_significant, player1_stat, player2_stat, player1_name, player2_name)
        }
    }


def get_betting_recommendation(correlation: float, is_significant: bool, stat1: str, stat2: str, name1: str, name2: str) -> str:
    """Generate betting recommendation based on correlation analysis"""

    if not is_significant:
        return f"No statistically significant relationship found. Not recommended for betting strategy."

    if abs(correlation) >= 0.6:
        if correlation > 0:
            return f"STRONG POSITIVE: When {name1} has high {stat1}, {name2} tends to have high {stat2}. Consider parlaying their overs together."
        else:
            return f"STRONG NEGATIVE: When {name1} has high {stat1}, {name2} tends to have low {stat2}. Consider opposite positions (one over, one under)."

    elif abs(correlation) >= 0.4:
        if correlation > 0:
            return f"MODERATE POSITIVE: Some correlation exists. {name2}'s {stat2} tends to increase with {name1}'s {stat1}. Use with caution."
        else:
            return f"MODERATE NEGATIVE: {name2}'s {stat2} tends to decrease when {name1}'s {stat1} increases. Interesting but not definitive."

    else:
        return f"WEAK CORRELATION: These stats appear relatively independent. Not useful for betting strategy."


@router.get("/correlation/team/best")
async def find_best_team_correlation(
    team_id: str = Query(..., description="Team ID to analyze"),
    season: str = Query("2025", description="Season"),
    min_games: int = Query(10, description="Minimum games played together"),
    db: Session = Depends(get_db)
):
    """
    Find the best positive correlation between any 2 players on a team
    """
    import httpx

    # Fetch current roster
    roster_url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{team_id}/roster"
    try:
        async with httpx.AsyncClient() as client:
            roster_response = await client.get(roster_url, timeout=10.0)
            roster_response.raise_for_status()
            roster_data = roster_response.json()
    except:
        return {
            "error": "Could not fetch current roster",
            "team_id": team_id
        }

    # Get list of current player IDs
    player_ids = [athlete.get('id') for athlete in roster_data.get('athletes', []) if athlete.get('id')]

    if len(player_ids) < 2:
        return {
            "error": "Not enough players on roster",
            "team_id": team_id
        }

    stat_mapping = {
        'points': 'points',
        'rebounds': 'rebounds',
        'assists': 'assists',
        'steals': 'steals',
        'blocks': 'blocks'
    }

    # Map stat names to prop types
    stat_to_prop_type = {
        'points': 'Total Points',
        'rebounds': 'Total Rebounds',
        'assists': 'Total Assists',
        'steals': 'Total Steals',
        'blocks': 'Total Blocks'
    }

    # Get all player stats for recent games
    query = text(f"""
        SELECT
            p.game_id,
            p.athlete_id,
            a.athlete_display_name as athlete_name,
            p.points,
            p.rebounds,
            p.assists,
            p.steals,
            p.blocks,
            e.date
        FROM player_boxscores p
        JOIN basic_events e ON p.game_id = e.event_id
        JOIN athletes a ON p.athlete_id = a.athlete_id
        WHERE p.athlete_didNotPlay = '0'
            AND e.event_season_type = 2
            AND e.season = :season
            AND p.points IS NOT NULL
            AND p.rebounds IS NOT NULL
            AND p.assists IS NOT NULL
        ORDER BY e.date DESC
    """)

    result = db.execute(query, {"season": season}).fetchall()

    # Organize data by game and player
    games_data = {}
    player_names = {}
    all_game_ids = set()

    for row in result:
        if row.athlete_id not in player_ids:
            continue  # Skip players not on current roster

        player_names[row.athlete_id] = row.athlete_name
        all_game_ids.add(row.game_id)

        if row.game_id not in games_data:
            games_data[row.game_id] = {}

        games_data[row.game_id][row.athlete_id] = {
            'points': float(row.points) if row.points else 0,
            'rebounds': float(row.rebounds) if row.rebounds else 0,
            'assists': float(row.assists) if row.assists else 0,
            'steals': float(row.steals) if row.steals else 0,
            'blocks': float(row.blocks) if row.blocks else 0
        }

    # Fetch all props for these games and players
    props_lookup = {}  # {game_id: {athlete_id: {stat_name: has_prop}}}

    if all_game_ids:
        game_ids_placeholders = ','.join([f"'{gid}'" for gid in all_game_ids])
        athlete_ids_placeholders = ','.join([f"'{pid}'" for pid in player_ids])

        # Get all prop types
        prop_types_placeholders = ','.join([f"'{pt}'" for pt in stat_to_prop_type.values()])

        prop_query = text(f"""
            SELECT DISTINCT
                game_id,
                athlete_id,
                prop_type
            FROM player_props
            WHERE game_id IN ({game_ids_placeholders})
                AND athlete_id IN ({athlete_ids_placeholders})
                AND prop_type IN ({prop_types_placeholders})
                AND line IS NOT NULL
        """)

        props_result = db.execute(prop_query).fetchall()

        # Build props lookup
        for prop in props_result:
            if prop.game_id not in props_lookup:
                props_lookup[prop.game_id] = {}
            if prop.athlete_id not in props_lookup[prop.game_id]:
                props_lookup[prop.game_id][prop.athlete_id] = set()

            # Map prop_type back to stat name
            for stat_name, prop_type in stat_to_prop_type.items():
                if prop.prop_type == prop_type:
                    props_lookup[prop.game_id][prop.athlete_id].add(stat_name)
                    break

    # Find all player pairs and calculate correlations
    best_correlation = None
    best_score = -float('inf')

    for i, player1_id in enumerate(player_ids):
        for player2_id in player_ids[i+1:]:
            if player1_id == player2_id:
                continue

            # Find common games
            common_games = [gid for gid, players in games_data.items()
                          if player1_id in players and player2_id in players]

            if len(common_games) < min_games:
                continue

            # Try all stat combinations
            for stat1_name, stat1_col in stat_mapping.items():
                for stat2_name, stat2_col in stat_mapping.items():
                    player1_values = []
                    player2_values = []

                    # Count games where BOTH players have props for these stats
                    games_with_props = 0
                    for game_id in common_games:
                        player1_values.append(games_data[game_id][player1_id][stat1_col])
                        player2_values.append(games_data[game_id][player2_id][stat2_col])

                        # Check if both players have props for their respective stats in this game
                        p1_has_prop = (
                            game_id in props_lookup and
                            player1_id in props_lookup[game_id] and
                            stat1_name in props_lookup[game_id][player1_id]
                        )
                        p2_has_prop = (
                            game_id in props_lookup and
                            player2_id in props_lookup[game_id] and
                            stat2_name in props_lookup[game_id][player2_id]
                        )

                        if p1_has_prop and p2_has_prop:
                            games_with_props += 1

                    try:
                        correlation, p_value = scipy_stats.pearsonr(player1_values, player2_values)

                        # Only consider positive correlations
                        if correlation <= 0:
                            continue

                        # Categorize strength
                        if abs(correlation) >= 0.7:
                            strength = "Strong"
                        elif abs(correlation) >= 0.4:
                            strength = "Moderate"
                        elif abs(correlation) >= 0.2:
                            strength = "Weak"
                        else:
                            strength = "Very Weak"

                        is_significant = bool(p_value < 0.05)

                        # Score this correlation with HEAVY emphasis on prop availability
                        score = abs(correlation) * 100

                        # Base bonuses
                        if abs(correlation) < 0.4:
                            score -= 50
                        if is_significant:
                            score += 20
                            if abs(correlation) >= 0.6:
                                score += 10

                        # MAJOR BONUS for having prop data - this is what makes it useful for betting!
                        # Each game with props adds significant value
                        score += games_with_props * 30  # 30 points per game with props for BOTH players

                        # Only get minor bonus for games without props
                        games_without_props = len(common_games) - games_with_props
                        score += min(games_without_props, 5)  # Capped at 5 points for games without props

                        # If there are NO games with props at all, heavily penalize
                        if games_with_props == 0:
                            score -= 100  # Large penalty if no betting data available

                        # Track the best one
                        if score > best_score:
                            best_score = score
                            best_correlation = {
                                "player1_id": player1_id,
                                "player1_name": player_names.get(player1_id, "Unknown"),
                                "player1_stat": stat1_name,
                                "player2_id": player2_id,
                                "player2_name": player_names.get(player2_id, "Unknown"),
                                "player2_stat": stat2_name,
                                "correlation": round(float(correlation), 3),
                                "p_value": round(float(p_value), 4),
                                "strength": strength,
                                "is_significant": is_significant,
                                "games_together": len(common_games),
                                "games_with_props": games_with_props,
                                "score": score
                            }
                    except:
                        continue

    if not best_correlation:
        return {
            "error": f"No positive correlations found with minimum {min_games} games together",
            "team_id": team_id
        }

    # Generate reasoning
    abs_corr = abs(best_correlation['correlation'])
    is_sig = best_correlation['is_significant']
    games = best_correlation['games_together']
    games_with_props = best_correlation.get('games_with_props', 0)

    reasoning_parts = []
    if abs_corr >= 0.7:
        reasoning_parts.append(f"Strongest positive correlation found ({abs_corr:.3f})")
    elif abs_corr >= 0.6:
        reasoning_parts.append(f"Very strong positive correlation ({abs_corr:.3f})")
    else:
        reasoning_parts.append(f"Best positive correlation found ({abs_corr:.3f})")

    if is_sig:
        reasoning_parts.append("statistically significant")

    reasoning_parts.append(f"across {games} games")

    # Highlight prop availability - this is critical for betting!
    if games_with_props > 0:
        reasoning_parts.append(f"{games_with_props} games with betting props available")
        if abs_corr >= 0.6 and is_sig:
            reasoning_parts.append("Excellent betting opportunity with prop data")
        elif abs_corr >= 0.4:
            reasoning_parts.append("Good betting opportunity with actionable props")
    else:
        reasoning_parts.append("No betting props available for these stats")

    best_correlation["reasoning"] = " - ".join(reasoning_parts)

    return {
        "team_id": team_id,
        "season": season,
        "min_games": min_games,
        "best_correlation": best_correlation
    }


@router.get("/correlation/teammates")
async def find_teammate_correlations(
    player_id: str = Query(..., description="Player ID to analyze"),
    player_stat: str = Query("points", description="Stat to analyze"),
    season: str = Query("2026", description="Season"),
    team_id: str = Query(..., description="Team ID to filter current roster"),
    min_correlation: float = Query(0.3, description="Minimum correlation threshold"),
    db: Session = Depends(get_db)
):
    """
    Find all teammates whose stats correlate with this player's stat
    Only considers players on the current roster (fetched from live API)
    """

    # Import httpx for fetching current roster
    import httpx

    # Fetch current roster from live API to get current teammates
    roster_url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{team_id}/roster"
    try:
        async with httpx.AsyncClient() as client:
            roster_response = await client.get(roster_url, timeout=10.0)
            roster_response.raise_for_status()
            roster_data = roster_response.json()
    except:
        return {
            "error": "Could not fetch current roster",
            "player_id": player_id
        }

    # Get list of current teammate IDs
    current_teammate_ids = set()
    for athlete in roster_data.get('athletes', []):
        athlete_id = athlete.get('id')
        if athlete_id and athlete_id != player_id:
            current_teammate_ids.add(athlete_id)

    stat_mapping = {
        'points': 'points',
        'rebounds': 'rebounds',
        'assists': 'assists',
        'steals': 'steals',
        'blocks': 'blocks'
    }

    if player_stat not in stat_mapping:
        raise HTTPException(status_code=400, detail=f"Invalid stat. Valid options: {list(stat_mapping.keys())}")

    col = stat_mapping[player_stat]

    # Single optimized query: Get last 10 games from the specified season with all player stats
    query = text(f"""
        WITH recent_games AS (
            SELECT DISTINCT p1.game_id, p1.team_id
            FROM player_boxscores p1
            JOIN basic_events e ON p1.game_id = e.event_id
            WHERE p1.athlete_id = :player_id
                AND p1.athlete_didNotPlay = '0'
                AND e.event_season_type = 2
                AND e.season = :season
            ORDER BY e.date DESC
            LIMIT 10
        )
        SELECT
            p.game_id,
            p.athlete_id,
            a.athlete_display_name as athlete_name,
            p.points,
            p.rebounds,
            p.assists,
            p.steals,
            p.blocks
        FROM player_boxscores p
        JOIN recent_games rg ON p.game_id = rg.game_id AND p.team_id = rg.team_id
        JOIN athletes a ON p.athlete_id = a.athlete_id
        WHERE p.athlete_didNotPlay = '0'
            AND p.points IS NOT NULL
            AND p.rebounds IS NOT NULL
            AND p.assists IS NOT NULL
        ORDER BY p.game_id, p.athlete_id
    """)

    result = db.execute(query, {"player_id": player_id, "season": season}).fetchall()

    # Organize data by player and game (need to track per-game stats)
    player_data = {}
    for row in result:
        if row.athlete_id not in player_data:
            player_data[row.athlete_id] = {
                'name': row.athlete_name,
                'games': {}  # game_id -> {points, rebounds, assists, etc}
            }

        # Store stats by game_id
        player_data[row.athlete_id]['games'][row.game_id] = {
            'points': float(row.points) if row.points else 0,
            'rebounds': float(row.rebounds) if row.rebounds else 0,
            'assists': float(row.assists) if row.assists else 0,
            'steals': float(row.steals) if row.steals else 0,
            'blocks': float(row.blocks) if row.blocks else 0
        }

    # Get the target player's games
    if player_id not in player_data:
        return {
            "error": "Player not found in recent games",
            "player_id": player_id
        }

    player_games = player_data[player_id]['games']

    if len(player_games) < 3:
        return {
            "error": f"Not enough games. Found {len(player_games)}, need at least 3",
            "player_id": player_id
        }

    # Calculate correlations with all teammates
    correlations = []

    for teammate_id, teammate_info in player_data.items():
        if teammate_id == player_id:
            continue

        # Only include current teammates (on current roster)
        if teammate_id not in current_teammate_ids:
            continue

        teammate_games = teammate_info['games']

        # Find common games (games where both players played)
        common_game_ids = set(player_games.keys()) & set(teammate_games.keys())

        # Only analyze if they played in at least 3 of the same games
        if len(common_game_ids) < 3:
            continue

        # Check for each stat
        for stat_name in ['points', 'rebounds', 'assists']:
            # Build aligned arrays for common games only
            player_values = []
            teammate_values = []

            for game_id in sorted(common_game_ids):  # Sort for consistency
                player_values.append(player_games[game_id][col])
                teammate_values.append(teammate_games[game_id][stat_name])

            try:
                # Calculate correlation
                correlation, p_value = scipy_stats.pearsonr(player_values, teammate_values)

                # Only include if meets threshold
                if abs(correlation) >= min_correlation:
                    # Categorize strength
                    if abs(correlation) >= 0.7:
                        strength = "Strong"
                    elif abs(correlation) >= 0.4:
                        strength = "Moderate"
                    elif abs(correlation) >= 0.2:
                        strength = "Weak"
                    else:
                        strength = "Very Weak"

                    is_significant = bool(p_value < 0.05)

                    # Generate recommendation
                    recommendation = get_betting_recommendation(
                        correlation, is_significant, player_stat, stat_name,
                        player_data[player_id]['name'], teammate_info['name']
                    )

                    correlations.append({
                        "teammate_id": teammate_id,
                        "teammate_name": teammate_info['name'],
                        "teammate_stat": stat_name,
                        "correlation": round(float(correlation), 3),
                        "p_value": round(float(p_value), 4),
                        "strength": strength,
                        "is_significant": is_significant,
                        "games_together": len(common_game_ids),
                        "recommendation": recommendation
                    })
            except:
                continue

    # Sort by absolute correlation value
    correlations.sort(key=lambda x: abs(x['correlation']), reverse=True)

    # Find the best correlation using a weighted scoring system
    best_correlation = None
    if correlations:
        def score_correlation(corr):
            """Score a correlation to determine the 'best' one"""
            abs_corr = abs(corr['correlation'])
            is_sig = corr['is_significant']
            games = corr['games_together']

            # Base score from correlation strength (0-100)
            score = abs_corr * 100

            # Penalty for weak correlations
            if abs_corr < 0.4:
                score -= 50

            # Bonuses for statistical significance
            if is_sig:
                score += 20  # p < 0.05
                # Check if highly significant (p < 0.01 would need p_value, but we can infer from strength)
                if abs_corr >= 0.6:
                    score += 10

            # Bonus for sample size (capped at +10)
            score += min(games, 10)

            return score

        # Score all correlations
        scored_correlations = [(corr, score_correlation(corr)) for corr in correlations]
        scored_correlations.sort(key=lambda x: x[1], reverse=True)

        # Get the best one if score is positive
        if scored_correlations[0][1] > 0:
            best_corr = scored_correlations[0][0]

            # Generate reasoning
            abs_corr = abs(best_corr['correlation'])
            strength = best_corr['strength']
            is_sig = best_corr['is_significant']
            games = best_corr['games_together']

            # Build reasoning text
            reasoning_parts = []

            # Lead with the main selling point
            if abs_corr >= 0.7:
                reasoning_parts.append(f"Strongest correlation found ({abs_corr:.3f})")
            elif abs_corr >= 0.6:
                reasoning_parts.append(f"Very strong correlation ({abs_corr:.3f})")
            else:
                reasoning_parts.append(f"Best correlation found ({abs_corr:.3f})")

            # Add statistical validity
            if is_sig:
                reasoning_parts.append("statistically significant")

            # Add sample size context
            reasoning_parts.append(f"across {games} games")

            # Add actionability statement
            if abs_corr >= 0.6 and is_sig:
                reasoning_parts.append("This represents a reliable betting opportunity")
            elif abs_corr >= 0.4:
                reasoning_parts.append("This shows a notable pattern worth considering")

            reasoning = " - ".join(reasoning_parts)

            best_correlation = {
                **best_corr,
                "reasoning": reasoning,
                "score": scored_correlations[0][1]
            }

    return {
        "player_id": player_id,
        "stat": player_stat,
        "season": season,
        "correlations_found": len(correlations),
        "top_correlations": correlations[:10],
        "best_correlation": best_correlation
    }
