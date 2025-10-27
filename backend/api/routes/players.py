"""Player endpoints"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from typing import List, Optional
import requests
from database.session import get_db
from database.models import Athlete, PlayerBoxscore, PlayByPlay
from api.models.schemas import (
    PlayerBase, PlayerDetail, PlayerSeasonStats,
    PlayerGameLog, ShotChartResponse, ShotChartPoint
)

router = APIRouter()


@router.get("/search", response_model=List[PlayerBase])
def search_players(
    q: str = Query(..., min_length=2, description="Search query (name)"),
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db)
):
    """Search for players by name"""
    players = db.query(Athlete).filter(
        Athlete.athlete_display_name.like(f"%{q}%")
    ).limit(limit).all()

    return players


@router.get("/{athlete_id}")
def get_player(athlete_id: str, db: Session = Depends(get_db)):
    """Get player details with ESPN metadata"""
    player = db.query(Athlete).filter(Athlete.athlete_id == athlete_id).first()

    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    # Fetch additional ESPN metadata
    try:
        espn_response = requests.get(
            f"https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes/{athlete_id}?lang=en&region=us",
            timeout=3
        )
        if espn_response.status_code == 200:
            espn_data = espn_response.json()

            # Get team data for colors if available
            team_data = None
            team_id = None
            if 'team' in espn_data and '$ref' in espn_data['team']:
                try:
                    team_response = requests.get(espn_data['team']['$ref'], timeout=2)
                    if team_response.status_code == 200:
                        team_data = team_response.json()
                        team_id = team_data.get('id')
                except:
                    pass

            # Create enriched player dict
            player_dict = {
                'athlete_id': player.athlete_id,
                'athlete_display_name': player.athlete_display_name,
                'athlete_first_name': player.athlete_first_name,
                'athlete_last_name': player.athlete_last_name,
                'athlete_headshot': player.athlete_headshot,
                'athlete_position': espn_data.get('position', {}).get('displayName'),
                'athlete_position_abbreviation': espn_data.get('position', {}).get('abbreviation'),
                'athlete_height': player.athlete_height,
                'athlete_display_height': espn_data.get('displayHeight', player.athlete_display_height),
                'athlete_weight': player.athlete_weight,
                'athlete_display_weight': espn_data.get('displayWeight', player.athlete_display_weight),
                'athlete_birth_date': player.athlete_birth_date,
                'athlete_age': espn_data.get('age', player.athlete_age),
                'athlete_jersey': espn_data.get('jersey', player.athlete_jersey),
                'athlete_birth_place_city': espn_data.get('birthPlace', {}).get('city', player.athlete_birth_place_city),
                'athlete_birth_place_state': espn_data.get('birthPlace', {}).get('state', player.athlete_birth_place_state),
                'athlete_birth_place_country': espn_data.get('birthPlace', {}).get('country', player.athlete_birth_place_country),
                'debut_year': espn_data.get('debutYear'),
                'experience_years': espn_data.get('experience', {}).get('years'),
                'draft_info': espn_data.get('draft', {}).get('displayText'),
                'draft_year': espn_data.get('draft', {}).get('year'),
                'draft_round': espn_data.get('draft', {}).get('round'),
                'draft_pick': espn_data.get('draft', {}).get('selection'),
                'salary': espn_data.get('contract', {}).get('salary'),
                'team_id': team_id,
                'team_colors': {
                    'primary': team_data.get('color') if team_data else None,
                    'secondary': team_data.get('alternateColor') if team_data else None
                } if team_data else None,
                'team_name': team_data.get('displayName') if team_data else None,
                'team_abbreviation': team_data.get('abbreviation') if team_data else None,
                'team_logo': team_data.get('logos', [{}])[0].get('href') if team_data and team_data.get('logos') else None
            }
            return player_dict
    except Exception as e:
        # Fall back to database data if ESPN API fails
        pass

    return player


@router.get("/{athlete_id}/stats")
def get_player_stats(
    athlete_id: str,
    season: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get player career or season stats with team splits"""

    # Get stats aggregated by season and team (excluding All-Star games)
    # Use date-based season determination to fix mislabeled games
    query = text("""
        SELECT
            pb.athlete_id,
            CASE
                WHEN be.date IS NOT NULL AND CAST(SUBSTR(be.date, 6, 2) AS INTEGER) >= 7 THEN
                    CAST(CAST(SUBSTR(be.date, 1, 4) AS INTEGER) + 1 AS TEXT)
                WHEN be.date IS NOT NULL THEN
                    SUBSTR(be.date, 1, 4)
                ELSE
                    pb.season
            END as season,
            pb.team_id,
            t.team_display_name,
            t.team_abbreviation,
            t.team_logo,
            COUNT(*) as games_played,
            ROUND(AVG(CAST(pb.points AS REAL)), 1) as avg_points,
            ROUND(AVG(CAST(pb.rebounds AS REAL)), 1) as avg_rebounds,
            ROUND(AVG(CAST(pb.assists AS REAL)), 1) as avg_assists,
            ROUND(AVG(CAST(pb.steals AS REAL)), 1) as avg_steals,
            ROUND(AVG(CAST(pb.blocks AS REAL)), 1) as avg_blocks,
            ROUND(SUM(CAST(pb.points AS REAL)), 0) as total_points,
            ROUND(SUM(CAST(pb.rebounds AS REAL)), 0) as total_rebounds,
            ROUND(SUM(CAST(pb.assists AS REAL)), 0) as total_assists
        FROM player_boxscores pb
        LEFT JOIN basic_events be ON pb.game_id = be.event_id
        LEFT JOIN teams t ON pb.team_id = t.team_id AND (
            CASE
                WHEN be.date IS NOT NULL AND CAST(SUBSTR(be.date, 6, 2) AS INTEGER) >= 7 THEN
                    CAST(CAST(SUBSTR(be.date, 1, 4) AS INTEGER) + 1 AS TEXT)
                WHEN be.date IS NOT NULL THEN
                    SUBSTR(be.date, 1, 4)
                ELSE
                    pb.season
            END
        ) = t.season
        WHERE pb.athlete_id = :athlete_id
        AND (pb.athlete_didNotPlay IS NULL OR pb.athlete_didNotPlay != '1')
        AND pb.points IS NOT NULL AND pb.points != ''
        AND t.team_id IS NOT NULL
        AND (be.event_name IS NULL OR be.event_name NOT LIKE '%All-Star%')
        AND (be.event_season_type IS NULL OR be.event_season_type = 2)
    """)

    params = {"athlete_id": athlete_id}

    if season:
        query = text(str(query) + " AND pb.season = :season")
        params["season"] = season

    query = text(str(query) + """
        GROUP BY
            pb.athlete_id,
            CASE
                WHEN be.date IS NOT NULL AND CAST(SUBSTR(be.date, 6, 2) AS INTEGER) >= 7 THEN
                    CAST(CAST(SUBSTR(be.date, 1, 4) AS INTEGER) + 1 AS TEXT)
                WHEN be.date IS NOT NULL THEN
                    SUBSTR(be.date, 1, 4)
                ELSE
                    pb.season
            END,
            pb.team_id,
            t.team_display_name,
            t.team_abbreviation,
            t.team_logo
        ORDER BY
            CASE
                WHEN be.date IS NOT NULL AND CAST(SUBSTR(be.date, 6, 2) AS INTEGER) >= 7 THEN
                    CAST(CAST(SUBSTR(be.date, 1, 4) AS INTEGER) + 1 AS TEXT)
                WHEN be.date IS NOT NULL THEN
                    SUBSTR(be.date, 1, 4)
                ELSE
                    pb.season
            END DESC,
            games_played DESC
    """)

    result = db.execute(query, params).fetchall()

    if not result:
        raise HTTPException(status_code=404, detail="No stats found for player")

    # Convert to dict and group by season
    stats_by_season = {}
    for row in result:
        row_dict = dict(row._mapping)
        season_key = row_dict['season']

        if season_key not in stats_by_season:
            stats_by_season[season_key] = {
                'season': season_key,
                'teams': []
            }

        stats_by_season[season_key]['teams'].append({
            'team_id': row_dict['team_id'],
            'team_display_name': row_dict['team_display_name'],
            'team_abbreviation': row_dict['team_abbreviation'],
            'team_logo': row_dict['team_logo'],
            'games_played': row_dict['games_played'],
            'avg_points': row_dict['avg_points'],
            'avg_rebounds': row_dict['avg_rebounds'],
            'avg_assists': row_dict['avg_assists'],
            'avg_steals': row_dict['avg_steals'],
            'avg_blocks': row_dict['avg_blocks'],
            'total_points': row_dict['total_points'],
            'total_rebounds': row_dict['total_rebounds'],
            'total_assists': row_dict['total_assists']
        })

    # Convert to list and calculate season totals
    seasons_list = []
    for season_key, season_data in stats_by_season.items():
        teams = season_data['teams']

        # Calculate season totals
        total_games = sum(t['games_played'] for t in teams)
        total_pts = sum(t['total_points'] for t in teams)
        total_reb = sum(t['total_rebounds'] for t in teams)
        total_ast = sum(t['total_assists'] for t in teams)

        seasons_list.append({
            'season': season_key,
            'teams': teams,
            'games_played': total_games,
            'avg_points': round(total_pts / total_games, 1) if total_games > 0 else 0,
            'avg_rebounds': round(total_reb / total_games, 1) if total_games > 0 else 0,
            'avg_assists': round(total_ast / total_games, 1) if total_games > 0 else 0,
            'total_points': total_pts,
            'total_rebounds': total_reb,
            'total_assists': total_ast
        })

    return {
        "athlete_id": athlete_id,
        "seasons": seasons_list
    }


@router.get("/{athlete_id}/splits/{season}/{team_id}")
def get_player_season_splits(
    athlete_id: str,
    season: str,
    team_id: str,
    db: Session = Depends(get_db)
):
    """Get detailed splits for a player's season with a specific team"""

    # Division to conference mapping
    # Eastern Conference: divisions 1 (Atlantic), 2 (Central), 9 (Southeast)
    # Western Conference: divisions 4 (Pacific), 10 (Southwest), 11 (Northwest)
    eastern_divisions = ['1', '2', '9']
    western_divisions = ['4', '10', '11']

    # Get player's team division for the season
    player_team_query = text("""
        SELECT division_id FROM teams
        WHERE team_id = :team_id AND season = :season
        LIMIT 1
    """)
    player_team_result = db.execute(player_team_query, {"team_id": team_id, "season": season}).fetchone()

    if not player_team_result:
        raise HTTPException(status_code=404, detail="Team not found for this season")

    player_division = str(player_team_result[0])
    player_conference = 'Eastern' if player_division in eastern_divisions else 'Western'

    # Main query to get games with opponent info
    query = text("""
        SELECT
            pb.game_id,
            pb.points,
            pb.rebounds,
            pb.assists,
            pb.steals,
            pb.blocks,
            CASE
                WHEN pb.team_id = tb.home_team_id THEN 'Home'
                ELSE 'Away'
            END as home_away,
            CASE
                WHEN pb.team_id = tb.home_team_id THEN tb.away_team_id
                ELSE tb.home_team_id
            END as opponent_team_id,
            opp_team.division_id as opponent_division_id
        FROM player_boxscores pb
        JOIN team_boxscores tb ON pb.game_id = tb.game_id
        LEFT JOIN basic_events be ON pb.game_id = be.event_id
        LEFT JOIN teams opp_team ON (
            CASE
                WHEN pb.team_id = tb.home_team_id THEN tb.away_team_id
                ELSE tb.home_team_id
            END
        ) = opp_team.team_id AND (
            CASE
                WHEN be.date IS NOT NULL AND CAST(SUBSTR(be.date, 6, 2) AS INTEGER) >= 7 THEN
                    CAST(CAST(SUBSTR(be.date, 1, 4) AS INTEGER) + 1 AS TEXT)
                WHEN be.date IS NOT NULL THEN
                    SUBSTR(be.date, 1, 4)
                ELSE
                    pb.season
            END
        ) = opp_team.season
        WHERE pb.athlete_id = :athlete_id
        AND pb.team_id = :team_id
        AND pb.season = :season
        AND (pb.athlete_didNotPlay IS NULL OR pb.athlete_didNotPlay != '1')
        AND pb.points IS NOT NULL AND pb.points != ''
        AND (be.event_name IS NULL OR be.event_name NOT LIKE '%All-Star%')
    """)

    result = db.execute(query, {
        "athlete_id": athlete_id,
        "team_id": team_id,
        "season": season
    }).fetchall()

    # Calculate splits
    splits = {
        'home': {'games': 0, 'points': 0, 'rebounds': 0, 'assists': 0, 'steals': 0, 'blocks': 0},
        'away': {'games': 0, 'points': 0, 'rebounds': 0, 'assists': 0, 'steals': 0, 'blocks': 0},
        'vs_conference': {'games': 0, 'points': 0, 'rebounds': 0, 'assists': 0, 'steals': 0, 'blocks': 0},
        'vs_out_conference': {'games': 0, 'points': 0, 'rebounds': 0, 'assists': 0, 'steals': 0, 'blocks': 0},
        'vs_division': {'games': 0, 'points': 0, 'rebounds': 0, 'assists': 0, 'steals': 0, 'blocks': 0},
        'vs_out_division': {'games': 0, 'points': 0, 'rebounds': 0, 'assists': 0, 'steals': 0, 'blocks': 0}
    }

    for row in result:
        row_dict = dict(row._mapping)
        pts = float(row_dict['points'] or 0)
        reb = float(row_dict['rebounds'] or 0)
        ast = float(row_dict['assists'] or 0)
        stl = float(row_dict['steals'] or 0)
        blk = float(row_dict['blocks'] or 0)

        # Home/Away splits
        location_key = 'home' if row_dict['home_away'] == 'Home' else 'away'
        splits[location_key]['games'] += 1
        splits[location_key]['points'] += pts
        splits[location_key]['rebounds'] += reb
        splits[location_key]['assists'] += ast
        splits[location_key]['steals'] += stl
        splits[location_key]['blocks'] += blk

        # Conference splits
        opp_division = str(row_dict['opponent_division_id']) if row_dict['opponent_division_id'] else None
        if opp_division:
            opp_conference = 'Eastern' if opp_division in eastern_divisions else 'Western'
            conf_key = 'vs_conference' if opp_conference == player_conference else 'vs_out_conference'
            splits[conf_key]['games'] += 1
            splits[conf_key]['points'] += pts
            splits[conf_key]['rebounds'] += reb
            splits[conf_key]['assists'] += ast
            splits[conf_key]['steals'] += stl
            splits[conf_key]['blocks'] += blk

            # Division splits
            div_key = 'vs_division' if opp_division == player_division else 'vs_out_division'
            splits[div_key]['games'] += 1
            splits[div_key]['points'] += pts
            splits[div_key]['rebounds'] += reb
            splits[div_key]['assists'] += ast
            splits[div_key]['steals'] += stl
            splits[div_key]['blocks'] += blk

    # Calculate averages
    def calc_averages(split_data):
        games = split_data['games']
        if games > 0:
            return {
                'games_played': games,
                'avg_points': round(split_data['points'] / games, 1),
                'avg_rebounds': round(split_data['rebounds'] / games, 1),
                'avg_assists': round(split_data['assists'] / games, 1),
                'avg_steals': round(split_data['steals'] / games, 1),
                'avg_blocks': round(split_data['blocks'] / games, 1),
            }
        return {
            'games_played': 0,
            'avg_points': 0,
            'avg_rebounds': 0,
            'avg_assists': 0,
            'avg_steals': 0,
            'avg_blocks': 0,
        }

    return {
        'athlete_id': athlete_id,
        'season': season,
        'team_id': team_id,
        'player_conference': player_conference,
        'splits': {
            'home': calc_averages(splits['home']),
            'away': calc_averages(splits['away']),
            'vs_conference': calc_averages(splits['vs_conference']),
            'vs_out_conference': calc_averages(splits['vs_out_conference']),
            'vs_division': calc_averages(splits['vs_division']),
            'vs_out_division': calc_averages(splits['vs_out_division']),
        }
    }


@router.get("/{athlete_id}/seasons")
def get_player_seasons(athlete_id: str, db: Session = Depends(get_db)):
    """Get list of seasons a player has data for"""
    query = text("""
        SELECT DISTINCT season
        FROM player_boxscores
        WHERE athlete_id = :athlete_id
        ORDER BY season DESC
    """)

    result = db.execute(query, {"athlete_id": athlete_id}).fetchall()
    seasons = [row[0] for row in result]

    return {"athlete_id": athlete_id, "seasons": seasons}


@router.get("/{athlete_id}/games")
def get_player_games(
    athlete_id: str,
    season: Optional[str] = None,
    season_type: Optional[int] = None,
    starter_status: Optional[str] = None,
    location: Optional[str] = None,
    limit: int = Query(82, le=500),
    db: Session = Depends(get_db)
):
    """Get player game log with team, opponent, home/away, and date info

    season_type: 1=preseason, 2=regular-season, 3=post-season
    starter_status: 'starter' for starting games only, 'bench' for bench games only, None for all games
    location: 'home' for home games only, 'away' for away games only, None for all games
    """

    # Join player_boxscores with team_boxscores and teams to get game context and logos
    query = text("""
        SELECT
            pb.game_id_athlete_id,
            pb.game_id,
            pb.season,
            pb.team_id,
            pb.athlete_starter,
            pb.minutes,
            pb.points,
            pb.rebounds,
            pb.assists,
            pb.steals,
            pb.blocks,
            pb.turnovers,
            pb.plusMinus,
            pb.fieldGoalsMade_fieldGoalsAttempted,
            pb.threePointFieldGoalsMade_threePointFieldGoalsAttempted,
            pb.freeThrowsMade_freeThrowsAttempted,
            tb.home_team_id,
            tb.home_team_name,
            tb.away_team_id,
            tb.away_team_name,
            tb.home_score,
            tb.away_score,
            be.event_season_type,
            be.event_season_type_slug,
            CASE
                WHEN pb.team_id = tb.home_team_id THEN tb.away_team_name
                ELSE tb.home_team_name
            END as opponent_name,
            CASE
                WHEN pb.team_id = tb.home_team_id THEN 'Home'
                ELSE 'Away'
            END as home_away,
            CASE
                WHEN pb.team_id = tb.home_team_id THEN tb.home_team_name
                ELSE tb.away_team_name
            END as team_name,
            CASE
                WHEN pb.team_id = tb.home_team_id THEN home_team.team_logo
                ELSE away_team.team_logo
            END as player_team_logo,
            CASE
                WHEN pb.team_id = tb.home_team_id THEN away_team.team_logo
                ELSE home_team.team_logo
            END as opponent_team_logo,
            CASE
                WHEN pb.team_id = tb.home_team_id THEN tb.home_score
                ELSE tb.away_score
            END as team_score,
            CASE
                WHEN pb.team_id = tb.home_team_id THEN tb.away_score
                ELSE tb.home_score
            END as opponent_score,
            CASE
                WHEN pb.team_id = tb.home_team_id AND tb.home_score > tb.away_score THEN 'W'
                WHEN pb.team_id = tb.away_team_id AND tb.away_score > tb.home_score THEN 'W'
                ELSE 'L'
            END as game_result,
            COALESCE(
                SUBSTR(be.date, 6, 2) || '/' || SUBSTR(be.date, 9, 2) || '/' || SUBSTR(be.date, 1, 4),
                CASE
                    WHEN LENGTH(pb.game_id) = 9 AND CAST(pb.game_id AS INTEGER) < 400000000 THEN
                        SUBSTR(pb.game_id, 3, 2) || '/' ||
                        SUBSTR(pb.game_id, 5, 2) || '/' ||
                        CASE
                            WHEN CAST(SUBSTR(pb.game_id, 3, 2) AS INTEGER) >= 10 THEN
                                CAST(CAST(pb.season AS INTEGER) - 1 AS TEXT)
                            ELSE
                                pb.season
                        END
                    ELSE
                        NULL
                END
            ) as game_date
        FROM player_boxscores pb
        JOIN team_boxscores tb ON pb.game_id = tb.game_id
        LEFT JOIN teams home_team ON tb.home_team_id = home_team.team_id AND pb.season = home_team.season
        LEFT JOIN teams away_team ON tb.away_team_id = away_team.team_id AND pb.season = away_team.season
        LEFT JOIN basic_events be ON pb.game_id = be.event_id
        WHERE pb.athlete_id = :athlete_id
        AND (pb.athlete_didNotPlay IS NULL OR pb.athlete_didNotPlay != '1')
        AND tb.home_score IS NOT NULL
        AND tb.away_score IS NOT NULL
    """)

    params = {"athlete_id": athlete_id}

    if season:
        query = text(str(query) + " AND pb.season = :season")
        params["season"] = season

    if season_type:
        query = text(str(query) + " AND be.event_season_type = :season_type")
        params["season_type"] = season_type

    if starter_status:
        if starter_status.lower() == 'starter':
            query = text(str(query) + " AND pb.athlete_starter = '1'")
        elif starter_status.lower() == 'bench':
            query = text(str(query) + " AND pb.athlete_starter = '0'")

    if location:
        if location.lower() == 'home':
            query = text(str(query) + " AND pb.team_id = tb.home_team_id")
        elif location.lower() == 'away':
            query = text(str(query) + " AND pb.team_id = tb.away_team_id")

    # Order by actual date from basic_events if available, fallback to game_id
    query = text(str(query) + " ORDER BY COALESCE(be.date, pb.game_id) DESC LIMIT :limit")
    params["limit"] = limit

    result = db.execute(query, params).fetchall()

    # Convert to dict
    games = [dict(row._mapping) for row in result]

    return {
        "athlete_id": athlete_id,
        "total_games": len(games),
        "games": games
    }


@router.get("/{athlete_id}/career-highs")
def get_career_highs(athlete_id: str, db: Session = Depends(get_db)):
    """Get career high stats for a player"""

    query = text("""
        SELECT
            MAX(CAST(points AS REAL)) as career_high_points,
            MAX(CAST(rebounds AS REAL)) as career_high_rebounds,
            MAX(CAST(assists AS REAL)) as career_high_assists,
            MAX(CAST(steals AS REAL)) as career_high_steals,
            MAX(CAST(blocks AS REAL)) as career_high_blocks
        FROM player_boxscores
        WHERE athlete_id = :athlete_id
          AND points IS NOT NULL
          AND points != ''
    """)

    result = db.execute(query, {"athlete_id": athlete_id}).fetchone()

    if not result:
        raise HTTPException(status_code=404, detail="No stats found for player")

    return dict(result._mapping)


@router.get("/{athlete_id}/career-summary")
def get_career_summary(athlete_id: str, db: Session = Depends(get_db)):
    """Get career summary stats"""

    query = text("""
        SELECT
            COUNT(DISTINCT season) as seasons_played,
            SUM(games_played) as total_games,
            SUM(total_points) as career_points,
            SUM(total_rebounds) as career_rebounds,
            SUM(total_assists) as career_assists,
            ROUND(AVG(avg_points), 1) as career_ppg,
            ROUND(AVG(avg_rebounds), 1) as career_rpg,
            ROUND(AVG(avg_assists), 1) as career_apg
        FROM player_season_stats
        WHERE athlete_id = :athlete_id
    """)

    result = db.execute(query, {"athlete_id": athlete_id}).fetchone()

    if not result:
        raise HTTPException(status_code=404, detail="No stats found for player")

    return dict(result._mapping)


@router.get("/{athlete_id}/shot-chart", response_model=ShotChartResponse)
def get_shot_chart(
    athlete_id: str,
    season: Optional[str] = None,
    game_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get shot chart data for a player"""

    # Get player name
    player = db.query(Athlete).filter(Athlete.athlete_id == athlete_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    # Query shooting plays
    query = db.query(PlayByPlay).filter(
        PlayByPlay.participant_1_id == athlete_id,
        PlayByPlay.shooting_play == "True",
        PlayByPlay.x_coordinate.isnot(None),
        PlayByPlay.y_coordinate.isnot(None)
    )

    if season:
        query = query.filter(PlayByPlay.season == season)

    if game_id:
        query = query.filter(PlayByPlay.game_id == game_id)

    shots = query.all()

    # Determine if shot was made based on text
    shot_data = []
    made_count = 0
    missed_count = 0

    for shot in shots:
        # Check if shot was made (text contains "made" or "makes")
        made = "made" in shot.text.lower() or "makes" in shot.text.lower()
        if made:
            made_count += 1
        else:
            missed_count += 1

        shot_data.append(ShotChartPoint(
            play_id=shot.play_id,
            x_coordinate=shot.x_coordinate,
            y_coordinate=shot.y_coordinate,
            text=shot.text,
            playType_text=shot.playType_text,
            made=made,
            quarter_number=shot.quarter_number,
            clock_display_value=shot.clock_display_value
        ))

    total_shots = made_count + missed_count
    shooting_pct = (made_count / total_shots * 100) if total_shots > 0 else 0

    return ShotChartResponse(
        athlete_id=athlete_id,
        athlete_name=player.athlete_display_name,
        season=season,
        total_shots=total_shots,
        made_shots=made_count,
        missed_shots=missed_count,
        shooting_percentage=round(shooting_pct, 1),
        shots=shot_data
    )


@router.get("/{athlete_id}/recent-games")
def get_recent_games(
    athlete_id: str,
    stat_type: str = Query("points", description="Stat type (points, rebounds, assists, steals, blocks)"),
    limit: int = Query(10, le=50, description="Number of recent games"),
    season_type: Optional[int] = Query(None, description="Season type: 2=regular-season, 3=post-season"),
    location: Optional[str] = Query(None, description="Location: 'home' or 'away'"),
    starter_status: Optional[str] = Query(None, description="Starter status: 'starter' or 'bench'"),
    db: Session = Depends(get_db)
):
    """
    Get player's last N games with specific stat performance
    Defaults to last 10 games
    Filters: location (home/away), starter_status (starter/bench)
    """

    # Validate stat type
    valid_stats = ['points', 'rebounds', 'assists', 'steals', 'blocks']
    if stat_type not in valid_stats:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid stat_type. Valid options: {valid_stats}"
        )

    # Build query
    query_str = f"""
        SELECT
            pb.game_id,
            be.date as game_date,
            pb.{stat_type} as stat_value,
            pb.minutes,
            pb.athlete_starter,
            CASE
                WHEN tb.home_team_id = pb.team_id THEN 'Home'
                ELSE 'Away'
            END as location,
            CASE
                WHEN tb.home_team_id = pb.team_id THEN tb.away_team_name
                ELSE tb.home_team_name
            END as opponent,
            CASE
                WHEN tb.home_team_id = pb.team_id THEN away_team.team_logo
                ELSE home_team.team_logo
            END as opponent_logo,
            CASE
                WHEN tb.home_team_id = pb.team_id THEN tb.home_score
                ELSE tb.away_score
            END as team_score,
            CASE
                WHEN tb.home_team_id = pb.team_id THEN tb.away_score
                ELSE tb.home_score
            END as opponent_score,
            CASE
                WHEN (tb.home_team_id = pb.team_id AND tb.home_score > tb.away_score)
                    OR (tb.away_team_id = pb.team_id AND tb.away_score > tb.home_score)
                THEN 'W'
                ELSE 'L'
            END as result
        FROM player_boxscores pb
        JOIN team_boxscores tb ON pb.game_id = tb.game_id
        LEFT JOIN basic_events be ON pb.game_id = be.event_id
        LEFT JOIN teams home_team ON tb.home_team_id = home_team.team_id AND pb.season = home_team.season
        LEFT JOIN teams away_team ON tb.away_team_id = away_team.team_id AND pb.season = away_team.season
        WHERE pb.athlete_id = :athlete_id
        AND (pb.athlete_didNotPlay IS NULL OR pb.athlete_didNotPlay != '1')
        AND pb.{stat_type} IS NOT NULL
        AND pb.{stat_type} != ''
    """

    params = {"athlete_id": athlete_id}

    if season_type:
        query_str += " AND be.event_season_type = :season_type"
        params["season_type"] = season_type

    if location:
        if location.lower() == 'home':
            query_str += " AND tb.home_team_id = pb.team_id"
        elif location.lower() == 'away':
            query_str += " AND tb.away_team_id = pb.team_id"

    if starter_status:
        if starter_status.lower() == 'starter':
            query_str += " AND pb.athlete_starter = '1'"
        elif starter_status.lower() == 'bench':
            query_str += " AND pb.athlete_starter = '0'"

    query_str += " ORDER BY be.date DESC LIMIT :limit"
    params["limit"] = limit

    query = text(query_str)
    result = db.execute(query, params).fetchall()

    if not result:
        return {
            "athlete_id": athlete_id,
            "stat_type": stat_type,
            "games": []
        }

    # Convert to list
    games = []
    for row in result:
        row_dict = dict(row._mapping)
        games.append({
            "game_id": row_dict['game_id'],
            "game_date": row_dict['game_date'],
            "stat_value": float(row_dict['stat_value']) if row_dict['stat_value'] else 0,
            "minutes": row_dict['minutes'],
            "starter": row_dict['athlete_starter'] == '1',
            "location": row_dict['location'],
            "opponent": row_dict['opponent'],
            "opponent_logo": row_dict['opponent_logo'],
            "team_score": row_dict['team_score'],
            "opponent_score": row_dict['opponent_score'],
            "result": row_dict['result']
        })

    return {
        "athlete_id": athlete_id,
        "stat_type": stat_type,
        "total_games": len(games),
        "games": games
    }


@router.get("/{athlete_id}/teammate-impact")
def get_teammate_impact(
    athlete_id: str,
    teammate_ids: str = Query(..., description="Comma-separated teammate IDs"),
    stat_type: str = Query("points", description="Stat type (points, rebounds, assists, steals, blocks)"),
    season: str = Query("2025", description="Season year"),
    limit: int = Query(50, le=100, description="Max games to analyze"),
    db: Session = Depends(get_db)
):
    """
    Analyze player performance with/without specific teammates
    Shows how a player's stats change when key teammates are absent
    """

    # Parse comma-separated teammate IDs
    teammate_id_list = [tid.strip() for tid in teammate_ids.split(',')]

    # Validate stat type
    valid_stats = ['points', 'rebounds', 'assists', 'steals', 'blocks']
    if stat_type not in valid_stats:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid stat_type. Valid options: {valid_stats}"
        )

    # Get player name
    player_query = text("SELECT athlete_display_name FROM athletes WHERE athlete_id = :athlete_id")
    player_result = db.execute(player_query, {"athlete_id": athlete_id}).fetchone()
    if not player_result:
        raise HTTPException(status_code=404, detail="Player not found")

    player_name = player_result[0]

    # Get teammate names
    teammate_names = {}
    for tid in teammate_id_list:
        tm_query = text("SELECT athlete_display_name FROM athletes WHERE athlete_id = :teammate_id")
        tm_result = db.execute(tm_query, {"teammate_id": tid}).fetchone()
        if tm_result:
            teammate_names[tid] = tm_result[0]

    # Query player's games with stat data
    player_games_query = text(f"""
        SELECT
            pb.game_id,
            pb.{stat_type} as stat_value,
            pb.minutes,
            be.date as game_date,
            be.event_season_type
        FROM player_boxscores pb
        LEFT JOIN basic_events be ON pb.game_id = be.event_id
        WHERE pb.athlete_id = :athlete_id
        AND be.season = :season
        AND be.event_season_type = 2
        AND pb.athlete_didNotPlay = '0'
        AND pb.{stat_type} IS NOT NULL
        ORDER BY be.date DESC
        LIMIT :limit
    """)

    player_games_result = db.execute(player_games_query, {
        "athlete_id": athlete_id,
        "season": season,
        "limit": limit
    }).fetchall()

    if not player_games_result:
        return {
            "athlete_id": athlete_id,
            "athlete_name": player_name,
            "stat_type": stat_type,
            "teammates": [],
            "summary": {
                "total_games": 0,
                "with_teammate_avg": None,
                "without_teammate_avg": None,
                "difference": None
            }
        }

    # Get game IDs
    game_ids = [row.game_id for row in player_games_result]
    game_ids_str = ','.join([f"'{gid}'" for gid in game_ids])

    # For each teammate, check which games they played in
    teammate_analysis = {}

    for teammate_id in teammate_id_list:
        # Find games where teammate played
        teammate_games_query = text(f"""
            SELECT game_id
            FROM player_boxscores
            WHERE athlete_id = :teammate_id
            AND game_id IN ({game_ids_str})
            AND athlete_didNotPlay = '0'
        """)

        teammate_games_result = db.execute(teammate_games_query, {
            "teammate_id": teammate_id
        }).fetchall()

        teammate_game_ids = {row.game_id for row in teammate_games_result}

        # Split player's games into with/without teammate
        with_teammate = []
        without_teammate = []

        for game in player_games_result:
            game_dict = {
                'game_id': game.game_id,
                'stat_value': float(game.stat_value) if game.stat_value else 0,
                'minutes': game.minutes,
                'game_date': game.game_date
            }

            if game.game_id in teammate_game_ids:
                with_teammate.append(game_dict)
            else:
                without_teammate.append(game_dict)

        # Calculate averages
        with_avg = None
        without_avg = None
        difference = None

        if with_teammate:
            with_avg = round(sum(g['stat_value'] for g in with_teammate) / len(with_teammate), 1)

        if without_teammate:
            without_avg = round(sum(g['stat_value'] for g in without_teammate) / len(without_teammate), 1)

        if with_avg is not None and without_avg is not None:
            difference = round(without_avg - with_avg, 1)

        teammate_analysis[teammate_id] = {
            'teammate_id': teammate_id,
            'teammate_name': teammate_names.get(teammate_id, 'Unknown'),
            'games_with': len(with_teammate),
            'games_without': len(without_teammate),
            'avg_with': with_avg,
            'avg_without': without_avg,
            'difference': difference,
            'games_with_list': with_teammate[:10],  # Include last 10 games for detail
            'games_without_list': without_teammate[:10]
        }

    return {
        "athlete_id": athlete_id,
        "athlete_name": player_name,
        "stat_type": stat_type,
        "season": season,
        "total_games_analyzed": len(player_games_result),
        "teammates": list(teammate_analysis.values())
    }


@router.get("/{athlete_id}/prop-history")
def get_prop_history(
    athlete_id: str,
    season: str = Query("2025", description="Season year"),
    prop_type: str = Query("Total Points", description="Prop type (Total Points, Total Rebounds, Total Assists, etc.)"),
    limit: int = Query(50, le=100, description="Max games to return"),
    db: Session = Depends(get_db)
):
    """
    Get player's prop betting history - actual performance vs betting lines
    Shows hit rates, trends, home/away splits
    """

    # Map prop types to player_boxscores columns
    prop_to_stat_column = {
        'Total Points': 'points',
        'Total Rebounds': 'rebounds',
        'Total Assists': 'assists',
        'Total Steals': 'steals',
        'Total Blocks': 'blocks',
        'Total 3-Point Field Goals': 'threePointFieldGoalsMade_threePointFieldGoalsAttempted'
    }

    stat_column = prop_to_stat_column.get(prop_type)
    if not stat_column:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid prop_type. Valid options: {list(prop_to_stat_column.keys())}"
        )

    # Get player name
    player_query = text("SELECT athlete_display_name FROM athletes WHERE athlete_id = :athlete_id")
    player_result = db.execute(player_query, {"athlete_id": athlete_id}).fetchone()
    if not player_result:
        raise HTTPException(status_code=404, detail="Player not found")

    player_name = player_result[0]

    # Query to get game-by-game data with props
    # Use a subquery to get the best prop per game (prioritize props with odds, then median line)
    query = text(f"""
        WITH game_lines AS (
            SELECT
                game_id,
                athlete_id,
                AVG(CAST(line AS REAL)) as median_line
            FROM player_props
            WHERE athlete_id = :athlete_id
                AND prop_type = :prop_type
                AND line IS NOT NULL
                AND line != ''
            GROUP BY game_id, athlete_id
        ),
        ranked_props AS (
            SELECT
                pp.game_id,
                pp.athlete_id,
                pp.line,
                pp.over_odds,
                pp.under_odds,
                pp.provider,
                ROW_NUMBER() OVER (
                    PARTITION BY pp.game_id, pp.athlete_id
                    ORDER BY
                        CASE WHEN pp.over_odds IS NOT NULL AND pp.under_odds IS NOT NULL THEN 0 ELSE 1 END,
                        CASE WHEN pp.over_odds IS NOT NULL OR pp.under_odds IS NOT NULL THEN 0 ELSE 1 END,
                        ABS(CAST(pp.line AS REAL) - COALESCE(gl.median_line, 20))
                ) as rn
            FROM player_props pp
            LEFT JOIN game_lines gl ON pp.game_id = gl.game_id AND pp.athlete_id = gl.athlete_id
            WHERE pp.athlete_id = :athlete_id
                AND pp.prop_type = :prop_type
                AND pp.line IS NOT NULL
                AND pp.line != ''
        )
        SELECT
            pb.game_id,
            e.date as game_date,
            pb.{stat_column} as actual_stat,
            pp.line,
            pp.over_odds,
            pp.under_odds,
            pp.provider,
            CASE
                WHEN tb.home_team_id = pb.team_id THEN 'home'
                ELSE 'away'
            END as location,
            CASE
                WHEN tb.home_team_id = pb.team_id THEN away_team.team_abbreviation
                ELSE home_team.team_abbreviation
            END as opponent,
            CASE
                WHEN tb.home_team_id = pb.team_id THEN away_team.team_logo
                ELSE home_team.team_logo
            END as opponent_logo,
            e.event_season_type
        FROM player_boxscores pb
        LEFT JOIN ranked_props pp ON pb.game_id = pp.game_id
            AND pb.athlete_id = pp.athlete_id
            AND pp.rn = 1
        JOIN basic_events e ON pb.game_id = e.event_id
        JOIN team_boxscores tb ON pb.game_id = tb.game_id
        LEFT JOIN teams home_team ON tb.home_team_id = home_team.team_id AND e.season = home_team.season
        LEFT JOIN teams away_team ON tb.away_team_id = away_team.team_id AND e.season = away_team.season
        WHERE pb.athlete_id = :athlete_id
            AND e.season = :season
            AND e.event_season_type = 2
            AND pb.athlete_didNotPlay = '0'
            AND pb.{stat_column} IS NOT NULL
        ORDER BY e.date DESC
        LIMIT :limit
    """)

    result = db.execute(query, {
        "athlete_id": athlete_id,
        "season": season,
        "prop_type": prop_type,
        "limit": limit
    }).fetchall()

    if not result:
        return {
            "athlete_id": athlete_id,
            "athlete_name": player_name,
            "season": season,
            "prop_type": prop_type,
            "games": [],
            "summary": {
                "total_games": 0,
                "games_with_props": 0,
                "hit_rate": None,
                "home_hit_rate": None,
                "away_hit_rate": None,
                "last_10_hit_rate": None,
                "average_actual": None,
                "average_line": None
            }
        }

    # Process games and calculate stats
    games = []
    total_games = len(result)
    games_with_props = 0
    hits = 0
    home_games = 0
    home_hits = 0
    away_games = 0
    away_hits = 0
    last_10_hits = 0
    total_actual = 0
    total_line = 0

    for idx, row in enumerate(result):
        row_dict = dict(row._mapping)

        # Handle special stat formats (e.g., "5-10" for made-attempted)
        if stat_column in ['threePointFieldGoalsMade_threePointFieldGoalsAttempted',
                           'fieldGoalsMade_fieldGoalsAttempted',
                           'freeThrowsMade_freeThrowsAttempted']:
            actual_value = float(row_dict['actual_stat'].split('-')[0]) if row_dict['actual_stat'] else None
        else:
            actual_value = float(row_dict['actual_stat']) if row_dict['actual_stat'] is not None else None

        line = float(row_dict['line']) if row_dict['line'] is not None and row_dict['line'] != '' else None
        hit_over = bool(actual_value > line if actual_value is not None and line is not None else False) if actual_value is not None and line is not None else None

        # Track statistics
        if actual_value is not None:
            total_actual += actual_value

        if line is not None:
            games_with_props += 1
            total_line += line

            if hit_over:
                hits += 1
                if idx < 10:  # Last 10 games
                    last_10_hits += 1

            # Home/away splits
            if row_dict['location'] == 'home':
                home_games += 1
                if hit_over:
                    home_hits += 1
            else:
                away_games += 1
                if hit_over:
                    away_hits += 1

        games.append({
            "game_id": row_dict['game_id'],
            "game_date": row_dict['game_date'],
            "actual": actual_value,
            "line": line,
            "over_odds": row_dict['over_odds'],
            "under_odds": row_dict['under_odds'],
            "provider": row_dict['provider'],
            "hit_over": hit_over,
            "location": row_dict['location'],
            "opponent": row_dict['opponent'],
            "opponent_logo": row_dict['opponent_logo']
        })

    # Calculate summary stats
    hit_rate = (hits / games_with_props * 100) if games_with_props > 0 else None
    home_hit_rate = (home_hits / home_games * 100) if home_games > 0 else None
    away_hit_rate = (away_hits / away_games * 100) if away_games > 0 else None
    last_10_count = min(games_with_props, 10)
    last_10_hit_rate = (last_10_hits / last_10_count * 100) if last_10_count > 0 else None
    avg_actual = round(total_actual / total_games, 1) if total_games > 0 else None
    avg_line = round(total_line / games_with_props, 1) if games_with_props > 0 else None

    return {
        "athlete_id": athlete_id,
        "athlete_name": player_name,
        "season": season,
        "prop_type": prop_type,
        "games": games,
        "summary": {
            "total_games": total_games,
            "games_with_props": games_with_props,
            "hit_rate": round(hit_rate, 1) if hit_rate is not None else None,
            "home_hit_rate": round(home_hit_rate, 1) if home_hit_rate is not None else None,
            "away_hit_rate": round(away_hit_rate, 1) if away_hit_rate is not None else None,
            "last_10_hit_rate": round(last_10_hit_rate, 1) if last_10_hit_rate is not None else None,
            "average_actual": avg_actual,
            "average_line": avg_line,
            "home_games": home_games,
            "away_games": away_games,
            "hits": hits
        }
    }


@router.get("/{athlete_id}/gamelog")
def get_player_gamelog_by_id(
    athlete_id: str,
    season: Optional[str] = Query(None, description="Season year (e.g., 2026)"),
    seasonType: Optional[int] = Query(None, description="Season type: 1=preseason, 2=regular, 3=postseason"),
    limit: int = Query(50, description="Max number of games to return"),
    db: Session = Depends(get_db)
):
    """
    Get player gamelog by athlete_id with optional season and seasonType filters
    
    Example: /api/players/3975/gamelog?season=2026&seasonType=2
    """
    
    # Build the base query
    query_str = """
        SELECT
            pb.game_id,
            pb.season,
            pb.team_id,
            pb.athlete_starter,
            pb.minutes,
            pb.points,
            pb.rebounds,
            pb.assists,
            pb.steals,
            pb.blocks,
            pb.turnovers,
            pb.fouls,
            pb.plusMinus,
            pb.fieldGoalsMade_fieldGoalsAttempted as fg,
            pb.threePointFieldGoalsMade_threePointFieldGoalsAttempted as three_pt,
            pb.freeThrowsMade_freeThrowsAttempted as ft,
            be.date,
            be.event_name,
            be.event_season_type,
            be.event_season_type_slug,
            be.event_status_description,
            tb.home_team_id,
            tb.home_team_name,
            tb.away_team_id,
            tb.away_team_name,
            tb.home_score,
            tb.away_score,
            t.team_display_name as player_team_name,
            t.team_logo as player_team_logo,
            CASE
                WHEN pb.team_id = tb.home_team_id THEN tb.away_team_name
                ELSE tb.home_team_name
            END as opponent_name,
            CASE
                WHEN pb.team_id = tb.home_team_id THEN away_t.team_logo
                ELSE home_t.team_logo
            END as opponent_logo,
            CASE
                WHEN pb.team_id = tb.home_team_id THEN 1
                ELSE 0
            END as is_home
        FROM player_boxscores pb
        JOIN basic_events be ON pb.game_id = be.event_id
        JOIN team_boxscores tb ON pb.game_id = tb.game_id
        LEFT JOIN teams t ON pb.team_id = t.team_id AND pb.season = t.season
        LEFT JOIN teams home_t ON tb.home_team_id = home_t.team_id AND pb.season = home_t.season
        LEFT JOIN teams away_t ON tb.away_team_id = away_t.team_id AND pb.season = away_t.season
        WHERE pb.athlete_id = :athlete_id
        AND (pb.athlete_didNotPlay IS NULL OR pb.athlete_didNotPlay != '1')
    """
    
    params = {"athlete_id": athlete_id}
    
    # Add optional filters
    if season:
        query_str += " AND pb.season = :season"
        params["season"] = season
    
    if seasonType is not None:
        query_str += " AND be.event_season_type = :season_type"
        params["season_type"] = seasonType
    
    query_str += " ORDER BY be.date DESC LIMIT :limit"
    params["limit"] = limit
    
    query = text(query_str)
    result = db.execute(query, params)
    rows = result.fetchall()
    
    if not rows:
        raise HTTPException(status_code=404, detail=f"No gamelog found for player {athlete_id}")
    
    # Convert to list of dicts
    games = []
    for row in rows:
        row_dict = dict(row._mapping)
        is_home = bool(row_dict['is_home'])
        home_score = row_dict['home_score']
        away_score = row_dict['away_score']

        # Calculate team score and opponent score based on home/away
        team_score = home_score if is_home else away_score
        opponent_score = away_score if is_home else home_score

        # Calculate game result (W/L)
        game_result = None
        if team_score is not None and opponent_score is not None:
            game_result = 'W' if team_score > opponent_score else 'L'

        games.append({
            "game_id": row_dict['game_id'],
            "game_date": row_dict['date'][:10] if row_dict['date'] else None,  # Format: YYYY-MM-DD
            "date": row_dict['date'],
            "season": row_dict['season'],
            "season_type": row_dict['event_season_type'],
            "event_season_type": row_dict['event_season_type'],  # Alias for frontend compatibility
            "season_type_slug": row_dict['event_season_type_slug'],
            "event_name": row_dict['event_name'],
            "team_name": row_dict['player_team_name'],
            "player_team_name": row_dict['player_team_name'],
            "player_team_logo": row_dict['player_team_logo'],
            "opponent_name": row_dict['opponent_name'],
            "opponent_team_logo": row_dict['opponent_logo'],
            "opponent_logo": row_dict['opponent_logo'],
            "home_away": 'Home' if is_home else 'Away',
            "is_home": is_home,
            "home_score": home_score,
            "away_score": away_score,
            "team_score": team_score,
            "opponent_score": opponent_score,
            "game_result": game_result,
            "is_starter": bool(row_dict['athlete_starter']) if row_dict['athlete_starter'] else False,
            "minutes": row_dict['minutes'],
            "points": int(row_dict['points']) if row_dict['points'] else 0,
            "rebounds": int(row_dict['rebounds']) if row_dict['rebounds'] else 0,
            "assists": int(row_dict['assists']) if row_dict['assists'] else 0,
            "steals": int(row_dict['steals']) if row_dict['steals'] else 0,
            "blocks": int(row_dict['blocks']) if row_dict['blocks'] else 0,
            "turnovers": int(row_dict['turnovers']) if row_dict['turnovers'] else 0,
            "fouls": int(row_dict['fouls']) if row_dict['fouls'] else 0,
            "plusMinus": int(row_dict['plusMinus']) if row_dict['plusMinus'] else 0,
            "plus_minus": int(row_dict['plusMinus']) if row_dict['plusMinus'] else 0,
            "fg": row_dict['fg'],
            "three_pt": row_dict['three_pt'],
            "ft": row_dict['ft']
        })
    
    return {
        "athlete_id": athlete_id,
        "games": games,
        "total_games": len(games)
    }
