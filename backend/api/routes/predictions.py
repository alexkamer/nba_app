"""
Predictions API routes

Endpoints for player stat predictions using Vegas+ model
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from pydantic import BaseModel
from services.prediction_engine import PredictionEngine
from sqlalchemy.orm import Session
from sqlalchemy import text
from database.session import get_db
import sqlite3
import httpx


router = APIRouter()
engine = PredictionEngine()


class PredictionResponse(BaseModel):
    """Prediction response model."""
    athlete_id: str
    player_name: Optional[str] = None
    team_name: Optional[str] = None
    game_id: str
    stat_type: str
    prediction: float
    vegas_line: Optional[float] = None
    stat_prediction: Optional[float] = None
    edge: Optional[float] = None
    confidence: str
    recommendation: Optional[str] = None
    model_type: str
    factors: List[str] = []
    games_used: Optional[int] = None


class PredictionRequest(BaseModel):
    """Request model for generating prediction."""
    athlete_id: str
    game_id: str
    stat_type: str


@router.get("/player/{athlete_id}/game/{game_id}", response_model=List[PredictionResponse])
def get_player_game_predictions(
    athlete_id: str,
    game_id: str,
    stat_types: Optional[str] = Query("points,rebounds,assists", description="Comma-separated stat types")
):
    """
    Get predictions for a specific player in a specific game.

    Example: /api/predictions/player/3975/game/401584654?stat_types=points,rebounds,assists
    """
    try:
        stat_list = [s.strip() for s in stat_types.split(",")]
        predictions = []

        for stat_type in stat_list:
            prediction = engine.predict_stat(athlete_id, game_id, stat_type)

            if 'error' in prediction:
                continue  # Skip if prediction failed

            # Get player name
            conn = engine.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT athlete_display_name FROM athletes WHERE athlete_id = ?", (athlete_id,))
            result = cursor.fetchone()
            player_name = result[0] if result else None
            conn.close()

            predictions.append({
                "athlete_id": athlete_id,
                "player_name": player_name,
                "game_id": game_id,
                "stat_type": stat_type,
                **prediction
            })

        return predictions

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/game/{game_id}", response_model=List[PredictionResponse])
async def get_game_predictions(
    game_id: str,
    stat_types: Optional[str] = Query("points,rebounds,assists", description="Comma-separated stat types"),
    min_vegas_line: Optional[float] = Query(None, description="Filter: minimum Vegas line"),
    confidence: Optional[str] = Query(None, description="Filter: confidence level (High, Medium, Low)"),
    db: Session = Depends(get_db)
):
    """
    Get predictions for all players in a game.

    Example: /api/predictions/game/401584654?stat_types=points&min_vegas_line=10
    """
    try:
        stat_list = [s.strip() for s in stat_types.split(",")]
        predictions = engine.get_game_predictions(game_id, stat_list)

        # If no predictions (future game with no boxscores), fetch from ESPN props and generate
        if not predictions:
            # Fetch props from ESPN API - handle pagination
            provider_id = "58"

            try:
                athlete_ids = set()
                page_index = 1
                page_count = 1

                # Loop through all pages
                while page_index <= page_count:
                    url = f"https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/{game_id}/competitions/{game_id}/odds/{provider_id}/propBets?lang=en&region=us&limit=1000&page={page_index}"

                    async with httpx.AsyncClient() as client:
                        response = await client.get(url, timeout=30.0)
                        response.raise_for_status()
                        data = response.json()

                        # Update page count from first response
                        if page_index == 1:
                            page_count = data.get('pageCount', 1)

                        if data.get('items'):
                            # Extract unique athlete IDs (from all items with valid line)
                            for item in data['items']:
                                current = item.get('current', {})
                                target = current.get('target', {})
                                line = target.get('displayValue')

                                # Only skip if there's no line at all
                                if not line:
                                    continue

                                athlete_ref = item.get('athlete', {}).get('$ref', '')
                                if athlete_ref:
                                    athlete_id = athlete_ref.split('/')[-1].split('?')[0]
                                    athlete_ids.add(athlete_id)

                    page_index += 1

                # Get athlete info from database
                if athlete_ids:
                    placeholders = ','.join([f"'{id}'" for id in athlete_ids])
                    athlete_query = text(f"""
                        SELECT DISTINCT
                            r.athlete_id,
                            r.athlete_display_name as player_name,
                            r.team_id,
                            t.team_display_name as team_name
                        FROM rosters r
                        LEFT JOIN teams t ON r.team_id = t.team_id AND t.season = '2025'
                        WHERE r.athlete_id IN ({placeholders})
                    """)
                    athletes = db.execute(athlete_query).fetchall()

                    # Generate predictions for each athlete and stat type
                    for athlete in athletes:
                        for stat_type in stat_list:
                            prediction = engine.predict_stat(
                                str(athlete.athlete_id),
                                game_id,
                                stat_type
                            )

                            if 'error' not in prediction:
                                predictions.append({
                                    "athlete_id": str(athlete.athlete_id),
                                    "player_name": athlete.player_name,
                                    "team_id": str(athlete.team_id) if athlete.team_id else None,
                                    "team_name": athlete.team_name,
                                    "game_id": game_id,
                                    "stat_type": stat_type,
                                    **prediction
                                })
            except httpx.HTTPError:
                pass  # Return empty predictions if API call fails

        # Apply filters
        if min_vegas_line is not None:
            predictions = [p for p in predictions if p.get('vegas_line') and p['vegas_line'] >= min_vegas_line]

        if confidence:
            predictions = [p for p in predictions if p['confidence'] == confidence]

        return predictions

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate", response_model=PredictionResponse)
def generate_prediction(request: PredictionRequest):
    """
    Generate a new prediction and optionally save it.

    Example payload:
    {
        "athlete_id": "3975",
        "game_id": "401584654",
        "stat_type": "points"
    }
    """
    try:
        prediction = engine.predict_stat(
            request.athlete_id,
            request.game_id,
            request.stat_type
        )

        if 'error' in prediction:
            raise HTTPException(status_code=400, detail=prediction['error'])

        # Get player name
        conn = engine.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT athlete_display_name FROM athletes WHERE athlete_id = ?", (request.athlete_id,))
        result = cursor.fetchone()
        player_name = result[0] if result else None
        conn.close()

        return {
            "athlete_id": request.athlete_id,
            "player_name": player_name,
            "game_id": request.game_id,
            "stat_type": request.stat_type,
            **prediction
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/edges", response_model=List[PredictionResponse])
def get_biggest_edges(
    season: str = Query("2024", description="Season to analyze"),
    stat_type: str = Query("points", description="Stat type"),
    min_edge: float = Query(2.0, description="Minimum edge (absolute value)"),
    limit: int = Query(20, description="Number of results")
):
    """
    Find biggest edges (where our model disagrees most with Vegas).

    Useful for identifying betting opportunities.

    Example: /api/predictions/edges?stat_type=points&min_edge=3.0&limit=10
    """
    try:
        conn = engine.get_connection()

        # Get recent games - LIMITED to 30 for performance
        query = """
        SELECT
            pp.athlete_id,
            pp.game_id,
            a.athlete_display_name as player_name,
            t.team_display_name as team_name,
            be.date,
            CAST(pp.line AS FLOAT) as vegas_line
        FROM player_props pp
        JOIN basic_events be ON pp.game_id = be.event_id
        JOIN athletes a ON pp.athlete_id = a.athlete_id
        JOIN player_boxscores pb ON pp.game_id = pb.game_id AND pp.athlete_id = pb.athlete_id
        JOIN teams t ON pb.team_id = t.team_id
        WHERE pp.prop_type = ?
        AND be.season = ?
        AND pb.athlete_didNotPlay = '0'
        AND be.date < '2025-01-01'
        AND be.event_season_type = 2
        ORDER BY be.date DESC
        LIMIT 30
        """

        prop_type_mapping = {
            'points': 'Total Points',
            'rebounds': 'Total Rebounds',
            'assists': 'Total Assists'
        }

        import pandas as pd
        games = pd.read_sql_query(
            query,
            conn,
            params=(prop_type_mapping[stat_type], season)
        )
        conn.close()

        edges = []

        for _, row in games.iterrows():
            try:
                prediction = engine.predict_stat(
                    row['athlete_id'],
                    row['game_id'],
                    stat_type
                )

                if 'error' not in prediction and prediction.get('edge') is not None:
                    if abs(prediction['edge']) >= min_edge:
                        edges.append({
                            "athlete_id": row['athlete_id'],
                            "player_name": row['player_name'],
                            "team_name": row['team_name'],
                            "game_id": row['game_id'],
                            "stat_type": stat_type,
                            **prediction
                        })
            except Exception:
                continue  # Skip problematic predictions

        # Sort by absolute edge
        edges.sort(key=lambda x: abs(x['edge']), reverse=True)

        return edges[:limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sample", response_model=List[PredictionResponse])
def get_sample_predictions(
    season: str = Query("2024", description="Season"),
    limit: int = Query(10, description="Number of samples")
):
    """
    Get sample predictions to demonstrate the system.

    Returns predictions for recent games with prop lines.
    """
    try:
        conn = engine.get_connection()

        # Get a specific recent game with prop lines (much faster than random sampling)
        query = """
        SELECT DISTINCT
            pp.athlete_id,
            pp.game_id,
            a.athlete_display_name as player_name,
            pp.line as vegas_line
        FROM player_props pp
        JOIN basic_events be ON pp.game_id = be.event_id
        JOIN athletes a ON pp.athlete_id = a.athlete_id
        WHERE pp.prop_type = 'Total Points'
        AND be.season = ?
        AND be.date < '2025-01-01'
        AND be.event_season_type = 2
        ORDER BY be.date DESC
        LIMIT ?
        """

        import pandas as pd
        samples = pd.read_sql_query(query, conn, params=(season, limit))
        conn.close()

        predictions = []

        for _, row in samples.iterrows():
            try:
                prediction = engine.predict_stat(
                    row['athlete_id'],
                    row['game_id'],
                    'points'
                )

                if 'error' not in prediction:
                    predictions.append({
                        "athlete_id": row['athlete_id'],
                        "player_name": row['player_name'],
                        "game_id": row['game_id'],
                        "stat_type": "points",
                        **prediction
                    })
            except Exception:
                continue  # Skip problematic predictions

        return predictions

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
