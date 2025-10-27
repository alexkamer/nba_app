"""Pydantic models for API responses"""

from pydantic import BaseModel
from typing import Optional, List


# Player models
class PlayerBase(BaseModel):
    athlete_id: str
    athlete_display_name: str
    athlete_position: Optional[str] = None
    athlete_headshot: Optional[str] = None


class PlayerDetail(PlayerBase):
    athlete_first_name: Optional[str] = None
    athlete_last_name: Optional[str] = None
    athlete_height: Optional[str] = None
    athlete_weight: Optional[str] = None
    athlete_birth_date: Optional[str] = None
    athlete_age: Optional[str] = None


class PlayerSeasonStats(BaseModel):
    athlete_id: str
    season: str
    games_played: int
    avg_points: float
    avg_rebounds: float
    avg_assists: float
    avg_steals: float
    avg_blocks: float
    total_points: float
    total_rebounds: float
    total_assists: float


class PlayerGameLog(BaseModel):
    game_id: str
    season: str
    team_id: str
    minutes: Optional[str] = None
    points: Optional[str] = None
    rebounds: Optional[str] = None
    assists: Optional[str] = None
    steals: Optional[str] = None
    blocks: Optional[str] = None
    turnovers: Optional[str] = None
    fouls: Optional[str] = None
    plusMinus: Optional[str] = None


# Shot chart models
class ShotChartPoint(BaseModel):
    play_id: str
    x_coordinate: Optional[str] = None
    y_coordinate: Optional[str] = None
    text: str
    playType_text: Optional[str] = None
    made: bool
    quarter_number: Optional[str] = None
    clock_display_value: Optional[str] = None


class ShotChartResponse(BaseModel):
    athlete_id: str
    athlete_name: str
    season: Optional[str] = None
    total_shots: int
    made_shots: int
    missed_shots: int
    shooting_percentage: float
    shots: List[ShotChartPoint]


# Team models
class TeamBase(BaseModel):
    team_id: str
    season: str
    team_display_name: str
    team_abbreviation: Optional[str] = None
    team_logo: Optional[str] = None


class TeamSeasonStats(BaseModel):
    team_id: str
    season: str
    games_played: int
    wins: int
    losses: int
    win_percentage: float


# Game models
class GameSummary(BaseModel):
    game_id: str
    season: str
    away_team_id: str
    away_team_name: str
    home_team_id: str
    home_team_name: str


class PlayByPlayItem(BaseModel):
    play_id: str
    sequenceNumber: Optional[str] = None
    text: str
    playType_text: Optional[str] = None
    awayScore: Optional[str] = None
    homeScore: Optional[str] = None
    quarter_display_value: Optional[str] = None
    clock_display_value: Optional[str] = None
    scoring_play: Optional[str] = None
    team_id: Optional[str] = None


# Stats leaders
class StatLeader(BaseModel):
    athlete_id: str
    athlete_name: str
    season: str
    stat_value: float
    games_played: int


# Generic response models
class PaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int
    data: List[dict]
