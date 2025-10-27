from ast import Dict
import pandas as pd
import httpx
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy import create_engine, Column, Integer, String, JSON, Boolean
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    pass


class Season(Base):
    __tablename__ = 'seasons'

    year = Column(Integer, primary_key=True)
    startDate = Column(String)
    endDate = Column(String)
    displayYear = Column(String)
    types = Column(JSON)



class Team(Base):
    __tablename__ = 'teams'

    season_team_id = Column(String, primary_key=True)
    season = Column(String)
    team_id = Column(String)
    team_display_name = Column(String)
    team_location = Column(String)
    team_name = Column(String)
    team_abbreviation = Column(String)
    team_color = Column(String)
    team_alternate_color = Column(String)
    team_logo = Column(String)
    team_isActive = Column(Boolean)
    division_id = Column(String)

class Venue(Base):
    __tablename__ = 'venues'
    
    venue_id = Column(String, primary_key=True)
    venue_name = Column(String)
    venue_city = Column(String)
    venue_state = Column(String)

class Athlete(Base):
    __tablename__ = 'athletes'
    
    athlete_id = Column(String, primary_key=True)
    athlete_first_name = Column(String)
    athlete_last_name = Column(String)
    athlete_display_name = Column(String)
    athlete_short_name = Column(String)
    athlete_full_name = Column(String)
    athlete_weight = Column(String)
    athlete_display_weight = Column(String)
    athlete_height = Column(String)
    athlete_display_height = Column(String)
    athlete_birth_date = Column(String)
    athlete_age = Column(String)
    athlete_birth_place_city = Column(String)
    athlete_birth_place_state = Column(String)
    athlete_birth_place_country = Column(String)
    athlete_jersey = Column(String)
    athlete_headshot = Column(String)



class Roster(Base):
    __tablename__ = 'rosters'
    
    athlete_id = Column(String, primary_key=True)
    team_id = Column(String)
    athlete_display_name = Column(String)
    athlete_short_name = Column(String)
    athlete_position = Column(String)

class BasicEvent(Base):
    __tablename__ = 'basic_events'
    
    event_id = Column(String, primary_key=True)
    event_season_type = Column(Integer)
    event_season_type_slug = Column(String)
    season = Column(String)
    date = Column(String)
    event_name = Column(String)
    event_shortName = Column(String)
    event_status_period = Column(Integer)
    event_status_description = Column(String)

class TeamBoxscore(Base):
    __tablename__ = 'team_boxscores'
    
    game_id = Column(String, primary_key=True)
    season = Column(String)
    away_team_id = Column(String)
    away_team_name = Column(String)
    home_team_id = Column(String)
    home_team_name = Column(String)
    away_fieldGoalsMade_fieldGoalsAttempted = Column(String)
    away_fieldGoalPct = Column(String)
    away_threePointFieldGoalsMade_threePointFieldGoalsAttempted = Column(String)
    away_threePointFieldGoalPct = Column(String)
    away_freeThrowsMade_freeThrowsAttempted = Column(String)
    away_freeThrowPct = Column(String)
    away_totalRebounds = Column(String)
    away_offensiveRebounds = Column(String)
    away_defensiveRebounds = Column(String)
    away_assists = Column(String)
    away_steals = Column(String)
    away_blocks = Column(String)
    away_turnovers = Column(String)
    away_teamTurnovers = Column(String)
    away_totalTurnovers = Column(String)
    away_technicalFouls = Column(String)
    away_totalTechnicalFouls = Column(String)
    away_flagrantFouls = Column(String)
    away_turnoverPoints = Column(String)
    away_fastBreakPoints = Column(String)
    away_pointsInPaint = Column(String)
    away_fouls = Column(String)
    away_largestLead = Column(String)
    home_fieldGoalsMade_fieldGoalsAttempted = Column(String)
    home_fieldGoalPct = Column(String)
    home_threePointFieldGoalsMade_threePointFieldGoalsAttempted = Column(String)
    home_threePointFieldGoalPct = Column(String)
    home_freeThrowsMade_freeThrowsAttempted = Column(String)
    home_freeThrowPct = Column(String)
    home_totalRebounds = Column(String)
    home_offensiveRebounds = Column(String)
    home_defensiveRebounds = Column(String)
    home_assists = Column(String)
    home_steals = Column(String)
    home_blocks = Column(String)
    home_turnovers = Column(String)
    home_teamTurnovers = Column(String)
    home_totalTurnovers = Column(String)
    home_technicalFouls = Column(String)
    home_totalTechnicalFouls = Column(String)
    home_flagrantFouls = Column(String)
    home_turnoverPoints = Column(String)
    home_fastBreakPoints = Column(String)
    home_pointsInPaint = Column(String)
    home_fouls = Column(String)
    home_largestLead = Column(String)

class PlayerBoxscore(Base):
    __tablename__ = 'player_boxscores'
    
    game_id_athlete_id = Column(String, primary_key=True)
    game_id = Column(String)
    season = Column(String)
    team_id = Column(String)
    athlete_id = Column(String)
    athlete_position = Column(String)
    athlete_starter = Column(String)
    athlete_didNotPlay = Column(String)
    athlete_reason = Column(String)
    athlete_ejected = Column(String)
    minutes = Column(String)
    fieldGoalsMade_fieldGoalsAttempted = Column(String)
    threePointFieldGoalsMade_threePointFieldGoalsAttempted = Column(String)
    freeThrowsMade_freeThrowsAttempted = Column(String)
    offensiveRebounds = Column(String)
    defensiveRebounds = Column(String)
    rebounds = Column(String)
    assists = Column(String)
    steals = Column(String)
    blocks = Column(String)
    turnovers = Column(String)
    fouls = Column(String)
    plusMinus = Column(String)
    points = Column(String)

class PlayByPlay(Base):
    __tablename__ = 'play_by_play'

    game_id_play_id = Column(String, primary_key=True)
    game_id = Column(String)
    season = Column(String)
    play_id = Column(String)
    sequenceNumber = Column(String)
    playType_id = Column(String)
    playType_text = Column(String)
    text = Column(String)
    awayScore = Column(String)
    homeScore = Column(String)
    quarter_number = Column(String)
    quarter_display_value = Column(String)
    clock_display_value = Column(String)
    scoring_play = Column(String)
    score_value = Column(String)
    team_id = Column(String)
    shooting_play = Column(String)
    x_coordinate = Column(String)
    y_coordinate = Column(String)
    participant_1_id = Column(String)
    participant_2_id = Column(String)
    participant_3_id = Column(String)

class PlayerProps(Base):
    __tablename__ = 'player_props'

    prop_id = Column(String, primary_key=True)  # game_id_athlete_id_prop_type_line
    game_id = Column(String)
    season = Column(String)
    athlete_id = Column(String)
    prop_type = Column(String)  # e.g., "Total Points", "Total Assists"
    prop_type_id = Column(String)  # e.g., "1", "2"
    line = Column(String)  # e.g., "8.5"
    over_odds = Column(String)  # e.g., "-110", "Even"
    under_odds = Column(String)  # e.g., "-120", "+105"
    over_decimal = Column(String)  # Decimal odds
    under_decimal = Column(String)
    provider = Column(String)  # e.g., "ESPN BET"
    provider_id = Column(String)  # e.g., "58"
    last_updated = Column(String)  # ISO timestamp
    fetch_date = Column(String)  # When we fetched this data


def main():
    # Create database engine (SQLite)
    engine = create_engine('sqlite:///../../data/nba.db', echo=True)

    # Create tables
    Base.metadata.create_all(engine)



    # Create session
    Session = sessionmaker(bind=engine)
    session = Session()



    session.commit()


    session.close()


if __name__ == "__main__":
    main()
