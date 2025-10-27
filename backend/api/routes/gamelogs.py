"""Direct gamelog endpoint - bypasses LLM for instant response"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from database.session import get_db
from typing import List, Optional

router = APIRouter()


class GamelogEntry(BaseModel):
    game_id: str
    date: str
    season_type: int
    player_team_name: str
    player_team_logo: str
    opponent_id: str
    opponent_name: str
    opponent_logo: str
    home_score: Optional[int]
    away_score: Optional[int]
    is_home: bool
    is_starter: bool
    minutes: str
    points: int
    rebounds: int
    assists: int
    steals: int
    blocks: int
    turnovers: int
    fouls: int
    fg: str
    threept: str
    ft: str
    plus_minus: int


class GamelogResponse(BaseModel):
    player_name: str
    player_headshot: str
    player_position: str
    player_jersey: str
    player_team: str
    player_team_logo: str
    season_avg_points: Optional[float]
    season_avg_rebounds: Optional[float]
    season_avg_assists: Optional[float]
    games: List[GamelogEntry]


@router.get("/players/{player_name}/gamelog", response_model=GamelogResponse)
def get_player_gamelog(
    player_name: str,
    limit: int = 15,
    opponent: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get player gamelog with all stats - INSTANT response, no LLM

    Example: /api/gamelogs/players/Luka Doncic/gamelog
    With opponent filter: /api/gamelogs/players/Luka Doncic/gamelog?opponent=lakers
    """

    query = text("""
        WITH season_stats AS (
            SELECT
                ROUND(AVG(CAST(points AS FLOAT)), 1) as avg_pts,
                ROUND(AVG(CAST(rebounds AS FLOAT)), 1) as avg_reb,
                ROUND(AVG(CAST(assists AS FLOAT)), 1) as avg_ast
            FROM player_boxscores pb2
            JOIN basic_events be2 ON pb2.game_id = be2.event_id
            WHERE pb2.athlete_id = (SELECT athlete_id FROM athletes WHERE athlete_display_name LIKE :player_search LIMIT 1)
            AND be2.season = '2025' AND pb2.athlete_didNotPlay IS NOT 1
        ),
        game_scores AS (
            SELECT
                pb3.game_id,
                SUM(CASE WHEN pb3.team_id = (SELECT home_team_id FROM team_boxscores WHERE game_id = pb3.game_id LIMIT 1)
                    THEN CAST(pb3.points AS INTEGER) ELSE 0 END) as calc_home_score,
                SUM(CASE WHEN pb3.team_id = (SELECT away_team_id FROM team_boxscores WHERE game_id = pb3.game_id LIMIT 1)
                    THEN CAST(pb3.points AS INTEGER) ELSE 0 END) as calc_away_score
            FROM player_boxscores pb3
            GROUP BY pb3.game_id
        )
        SELECT DISTINCT
            a.athlete_display_name, a.athlete_headshot,
            COALESCE(r.athlete_position, 'G') as athlete_position,
            a.athlete_jersey,
            pt.team_display_name as player_team, pt.team_logo as player_team_logo,
            ss.avg_pts, ss.avg_reb, ss.avg_ast,
            pb.game_id, be.date, be.event_season_type,
            gt.team_display_name as game_team_name,
            gt.team_logo as game_team_logo,
            CASE WHEN tb.home_team_id = pb.team_id THEN tb.away_team_id ELSE tb.home_team_id END as opp_id,
            CASE WHEN tb.home_team_id = pb.team_id THEN tb.away_team_name ELSE tb.home_team_name END as opp_name,
            ot.team_logo as opp_logo,
            COALESCE(tb.home_score, gs.calc_home_score) as home_score,
            COALESCE(tb.away_score, gs.calc_away_score) as away_score,
            CASE WHEN tb.home_team_id = pb.team_id THEN 1 ELSE 0 END as is_home,
            tb.home_team_id, tb.away_team_id, pb.team_id,
            pb.athlete_starter,
            pb.minutes, pb.points, pb.rebounds, pb.assists,
            pb.steals, pb.blocks, pb.turnovers, pb.fouls,
            pb.fieldGoalsMade_fieldGoalsAttempted as fg,
            pb.threePointFieldGoalsMade_threePointFieldGoalsAttempted as thr,
            pb.freeThrowsMade_freeThrowsAttempted as ft,
            pb.plusMinus
        FROM player_boxscores pb
        JOIN basic_events be ON pb.game_id = be.event_id
        JOIN team_boxscores tb ON pb.game_id = tb.game_id
        LEFT JOIN game_scores gs ON pb.game_id = gs.game_id
        JOIN athletes a ON pb.athlete_id = a.athlete_id
        LEFT JOIN rosters r ON a.athlete_id = r.athlete_id
        LEFT JOIN teams pt ON r.team_id = pt.team_id AND pt.season = '2025'
        LEFT JOIN teams gt ON pb.team_id = gt.team_id AND gt.season = be.season
        LEFT JOIN teams ot ON (CASE WHEN tb.home_team_id = pb.team_id THEN tb.away_team_id ELSE tb.home_team_id END) = ot.team_id AND ot.season = be.season
        CROSS JOIN season_stats ss
        WHERE a.athlete_display_name LIKE :player_search
        AND pb.athlete_didNotPlay IS NOT 1
        AND (:opponent IS NULL OR
             (CASE WHEN tb.home_team_id = pb.team_id THEN tb.away_team_name ELSE tb.home_team_name END) LIKE :opponent_search OR
             ot.team_name LIKE :opponent_search OR
             ot.team_display_name LIKE :opponent_search)
        ORDER BY be.date DESC
        LIMIT :limit
    """)

    result = db.execute(query, {
        "player_search": f"%{player_name}%",
        "opponent": opponent,
        "opponent_search": f"%{opponent}%" if opponent else None,
        "limit": limit
    })

    rows = result.fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail=f"Player '{player_name}' not found or has no games")

    # First row has player info and season averages
    first_row = rows[0]

    games = []
    for row in rows:
        games.append(GamelogEntry(
            game_id=row.game_id,
            date=row.date,
            season_type=row.event_season_type,
            player_team_name=row.game_team_name,
            player_team_logo=row.game_team_logo,
            opponent_id=row.opp_id,
            opponent_name=row.opp_name,
            opponent_logo=row.opp_logo,
            home_score=row.home_score,
            away_score=row.away_score,
            is_home=bool(row.is_home),
            is_starter=bool(row.athlete_starter) if row.athlete_starter else False,
            minutes=row.minutes,
            points=row.points,
            rebounds=row.rebounds,
            assists=row.assists,
            steals=row.steals or 0,
            blocks=row.blocks or 0,
            turnovers=row.turnovers or 0,
            fouls=row.fouls or 0,
            fg=row.fg,
            threept=row.thr,
            ft=row.ft,
            plus_minus=row.plusMinus
        ))

    return GamelogResponse(
        player_name=first_row.athlete_display_name,
        player_headshot=first_row.athlete_headshot,
        player_position=first_row.athlete_position,
        player_jersey=first_row.athlete_jersey,
        player_team=first_row.player_team,
        player_team_logo=first_row.player_team_logo,
        season_avg_points=first_row.avg_pts,
        season_avg_rebounds=first_row.avg_reb,
        season_avg_assists=first_row.avg_ast,
        games=games
    )
