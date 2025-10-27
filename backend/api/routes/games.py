"""Game endpoints"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from database.session import get_db
from database.models import TeamBoxscore, PlayerBoxscore, PlayByPlay
import httpx

router = APIRouter()


@router.get("/{game_id}")
async def get_game(game_id: str, db: Session = Depends(get_db)):
    """Get complete game details including box scores for both teams"""

    # Try to fetch live data from ESPN first for quarter-by-quarter and other live stats
    away_linescores = []
    home_linescores = []
    game_odds = None
    additional_stats = {}
    venue_data = None
    attendance = None
    game_date_time = None

    try:
        url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={game_id}"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            espn_data = response.json()

        # Extract linescores (quarter-by-quarter scoring)
        header = espn_data.get('header', {})
        competition = header.get('competitions', [{}])[0]
        competitors = competition.get('competitors', [])

        # Extract venue information
        venue = competition.get('venue', {})
        if venue:
            venue_data = {
                'id': venue.get('id'),
                'name': venue.get('fullName'),
                'city': venue.get('address', {}).get('city'),
                'state': venue.get('address', {}).get('state'),
                'indoor': venue.get('indoor')
            }

        # Extract attendance
        attendance = competition.get('attendance')

        # Extract game date/time
        game_date_time = competition.get('date')

        if competitors:
            for competitor in competitors:
                linescores = competitor.get('linescores', [])
                if competitor.get('homeAway') == 'away':
                    away_linescores = [ls.get('displayValue') for ls in linescores]
                else:
                    home_linescores = [ls.get('displayValue') for ls in linescores]

        # Extract additional team stats from boxscore
        boxscore = espn_data.get('boxscore', {})
        teams = boxscore.get('teams', [])
        if len(teams) >= 2:
            for team in teams:
                stats = team.get('statistics', [])
                team_id = team.get('team', {}).get('id')
                stats_dict = {}
                for stat in stats:
                    stats_dict[stat.get('name')] = stat.get('displayValue')

                if team_id:
                    additional_stats[team_id] = stats_dict

    except Exception:
        # If ESPN fetch fails, continue without linescores
        pass

    # Get game metadata and team info
    game_query = text("""
        SELECT
            tb.game_id,
            tb.season,
            tb.away_team_id,
            tb.away_team_name,
            tb.home_team_id,
            tb.home_team_name,
            tb.away_score,
            tb.home_score,
            be.date as game_date,
            be.event_season_type,
            be.event_season_type_slug,
            away_team.team_logo as away_team_logo,
            away_team.team_color as away_team_color,
            home_team.team_logo as home_team_logo,
            home_team.team_color as home_team_color,
            tb.away_fieldGoalsMade_fieldGoalsAttempted,
            tb.away_fieldGoalPct,
            tb.away_threePointFieldGoalsMade_threePointFieldGoalsAttempted,
            tb.away_threePointFieldGoalPct,
            tb.away_freeThrowsMade_freeThrowsAttempted,
            tb.away_freeThrowPct,
            tb.away_totalRebounds,
            tb.away_assists,
            tb.away_steals,
            tb.away_blocks,
            tb.away_turnovers,
            tb.home_fieldGoalsMade_fieldGoalsAttempted,
            tb.home_fieldGoalPct,
            tb.home_threePointFieldGoalsMade_threePointFieldGoalsAttempted,
            tb.home_threePointFieldGoalPct,
            tb.home_freeThrowsMade_freeThrowsAttempted,
            tb.home_freeThrowPct,
            tb.home_totalRebounds,
            tb.home_assists,
            tb.home_steals,
            tb.home_blocks,
            tb.home_turnovers
        FROM team_boxscores tb
        LEFT JOIN basic_events be ON tb.game_id = be.event_id
        LEFT JOIN teams away_team ON tb.away_team_id = away_team.team_id AND tb.season = away_team.season
        LEFT JOIN teams home_team ON tb.home_team_id = home_team.team_id AND tb.season = home_team.season
        WHERE tb.game_id = :game_id
    """)

    game_result = db.execute(game_query, {"game_id": game_id}).fetchone()

    if not game_result:
        raise HTTPException(status_code=404, detail="Game not found")

    game_data = dict(game_result._mapping)

    # Get player box scores for both teams
    players_query = text("""
        SELECT
            pb.game_id,
            pb.athlete_id,
            pb.team_id,
            a.athlete_display_name as player_name,
            pb.athlete_position as position,
            a.athlete_headshot,
            pb.athlete_starter,
            pb.minutes,
            pb.points,
            pb.rebounds,
            pb.assists,
            pb.steals,
            pb.blocks,
            pb.turnovers,
            pb.fouls,
            pb.offensiveRebounds,
            pb.defensiveRebounds,
            pb.fieldGoalsMade_fieldGoalsAttempted,
            pb.threePointFieldGoalsMade_threePointFieldGoalsAttempted,
            pb.freeThrowsMade_freeThrowsAttempted,
            pb.plusMinus,
            pb.athlete_didNotPlay
        FROM player_boxscores pb
        JOIN athletes a ON pb.athlete_id = a.athlete_id
        WHERE pb.game_id = :game_id
        ORDER BY pb.athlete_starter DESC, CAST(pb.points AS INTEGER) DESC
    """)

    players_result = db.execute(players_query, {"game_id": game_id}).fetchall()

    # If no player data in database, try fetching from ESPN API
    if not players_result:
        try:
            url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={game_id}"
            async with httpx.AsyncClient() as client:
                response = await client.get(url, timeout=10.0)
                response.raise_for_status()
                espn_data = response.json()

            boxscore = espn_data.get('boxscore', {})
            players = boxscore.get('players', [])

            # Parse player stats from ESPN
            def parse_espn_players(team_players):
                if not team_players:
                    return []

                statistics = team_players.get('statistics', [])
                if not statistics:
                    return []

                stat_group = statistics[0]
                athletes = stat_group.get('athletes', [])
                labels = stat_group.get('labels', [])

                parsed_players = []
                for athlete_data in athletes:
                    athlete = athlete_data.get('athlete', {})
                    stats = athlete_data.get('stats', [])

                    # Create dict mapping labels to values
                    stats_dict = {}
                    for i, label in enumerate(labels):
                        if i < len(stats):
                            stats_dict[label] = stats[i]

                    # Map ESPN stats to our format
                    parsed_players.append({
                        'athlete_id': athlete.get('id'),
                        'player_name': athlete.get('displayName'),
                        'position': athlete.get('position', {}).get('abbreviation'),
                        'athlete_headshot': athlete.get('headshot', {}).get('href'),
                        'athlete_starter': '1' if athlete_data.get('starter', False) else '0',
                        'minutes': stats_dict.get('MIN', '0'),
                        'points': stats_dict.get('PTS', '0'),
                        'rebounds': stats_dict.get('REB', '0'),
                        'assists': stats_dict.get('AST', '0'),
                        'steals': stats_dict.get('STL', '0'),
                        'blocks': stats_dict.get('BLK', '0'),
                        'turnovers': stats_dict.get('TO', '0'),
                        'fieldGoalsMade_fieldGoalsAttempted': stats_dict.get('FG', '0-0'),
                        'threePointFieldGoalsMade_threePointFieldGoalsAttempted': stats_dict.get('3PT', '0-0'),
                        'freeThrowsMade_freeThrowsAttempted': stats_dict.get('FT', '0-0'),
                        'plusMinus': stats_dict.get('+/-', '0'),
                        'team_id': team_players.get('team', {}).get('id')
                    })

                return parsed_players

            away_players = parse_espn_players(players[0]) if len(players) > 0 else []
            home_players = parse_espn_players(players[1]) if len(players) > 1 else []

            # Combine all players and convert to the expected format
            all_players = away_players + home_players
            players_result = [type('obj', (object,), {'_mapping': p})() for p in all_players]

        except Exception as e:
            # If ESPN fetch fails, just continue with empty player data
            pass

    # Organize players by team and starter status
    away_starters = []
    away_bench = []
    home_starters = []
    home_bench = []

    for player in players_result:
        player_dict = dict(player._mapping)

        # Skip DNP players for now
        if player_dict.get('athlete_didNotPlay') == '1':
            continue

        is_starter = player_dict.get('athlete_starter') == '1'
        is_away_team = player_dict.get('team_id') == game_data['away_team_id']

        if is_away_team:
            if is_starter:
                away_starters.append(player_dict)
            else:
                away_bench.append(player_dict)
        else:
            if is_starter:
                home_starters.append(player_dict)
            else:
                home_bench.append(player_dict)

    # Format game date
    formatted_date = None
    if game_data.get('game_date'):
        date_str = game_data['game_date']
        formatted_date = f"{date_str[5:7]}/{date_str[8:10]}/{date_str[0:4]}"

    # Get additional stats for away and home teams
    away_additional = additional_stats.get(game_data['away_team_id'], {})
    home_additional = additional_stats.get(game_data['home_team_id'], {})

    return {
        "game_id": game_data['game_id'],
        "season": game_data['season'],
        "game_date": formatted_date,
        "game_date_time": game_date_time,
        "venue": venue_data,
        "attendance": attendance,
        "season_type": game_data.get('event_season_type_slug', 'regular-season'),
        "away_team": {
            "team_id": game_data['away_team_id'],
            "team_name": game_data['away_team_name'],
            "team_logo": game_data.get('away_team_logo'),
            "team_color": game_data.get('away_team_color'),
            "score": game_data['away_score'],
            "linescores": away_linescores,
            "stats": {
                "field_goals": game_data.get('away_fieldGoalsMade_fieldGoalsAttempted'),
                "field_goal_pct": game_data.get('away_fieldGoalPct'),
                "three_pointers": game_data.get('away_threePointFieldGoalsMade_threePointFieldGoalsAttempted'),
                "three_point_pct": game_data.get('away_threePointFieldGoalPct'),
                "free_throws": game_data.get('away_freeThrowsMade_freeThrowsAttempted'),
                "free_throw_pct": game_data.get('away_freeThrowPct'),
                "rebounds": game_data.get('away_totalRebounds'),
                "assists": game_data.get('away_assists'),
                "steals": game_data.get('away_steals'),
                "blocks": game_data.get('away_blocks'),
                "turnovers": game_data.get('away_turnovers'),
                "largest_lead": away_additional.get('largestLead'),
                "fast_break_points": away_additional.get('fastBreakPoints'),
                "points_in_paint": away_additional.get('pointsInPaint'),
                "bench_points": away_additional.get('benchPoints'),
            },
            "players": {
                "starters": away_starters,
                "bench": away_bench
            }
        },
        "home_team": {
            "team_id": game_data['home_team_id'],
            "team_name": game_data['home_team_name'],
            "team_logo": game_data.get('home_team_logo'),
            "team_color": game_data.get('home_team_color'),
            "score": game_data['home_score'],
            "linescores": home_linescores,
            "stats": {
                "field_goals": game_data.get('home_fieldGoalsMade_fieldGoalsAttempted'),
                "field_goal_pct": game_data.get('home_fieldGoalPct'),
                "three_pointers": game_data.get('home_threePointFieldGoalsMade_threePointFieldGoalsAttempted'),
                "three_point_pct": game_data.get('home_threePointFieldGoalPct'),
                "free_throws": game_data.get('home_freeThrowsMade_freeThrowsAttempted'),
                "free_throw_pct": game_data.get('home_freeThrowPct'),
                "rebounds": game_data.get('home_totalRebounds'),
                "assists": game_data.get('home_assists'),
                "steals": game_data.get('home_steals'),
                "blocks": game_data.get('home_blocks'),
                "turnovers": game_data.get('home_turnovers'),
                "largest_lead": home_additional.get('largestLead'),
                "fast_break_points": home_additional.get('fastBreakPoints'),
                "points_in_paint": home_additional.get('pointsInPaint'),
                "bench_points": home_additional.get('benchPoints'),
            },
            "players": {
                "starters": home_starters,
                "bench": home_bench
            }
        }
    }


@router.get("/{game_id}/boxscore")
def get_game_boxscore(game_id: str, db: Session = Depends(get_db)):
    """Get full boxscore for a game"""
    team_stats = db.query(TeamBoxscore).filter(TeamBoxscore.game_id == game_id).first()
    player_stats = db.query(PlayerBoxscore).filter(PlayerBoxscore.game_id == game_id).all()

    if not team_stats:
        raise HTTPException(status_code=404, detail="Game not found")

    return {
        "game_id": game_id,
        "team_stats": team_stats,
        "player_stats": player_stats
    }


@router.get("/{game_id}/plays")
def get_game_plays(
    game_id: str,
    quarter: Optional[str] = None,
    play_type: Optional[str] = None,
    scoring_only: bool = False,
    limit: int = Query(500, le=2000),
    db: Session = Depends(get_db)
):
    """Get play-by-play for a game"""
    query_str = """
        SELECT
            pbp.play_id,
            pbp.sequenceNumber,
            pbp.playType_id,
            pbp.playType_text,
            pbp.text,
            pbp.awayScore,
            pbp.homeScore,
            pbp.quarter_number,
            pbp.quarter_display_value,
            pbp.clock_display_value,
            pbp.scoring_play,
            pbp.score_value,
            pbp.team_id,
            pbp.shooting_play,
            pbp.participant_1_id,
            a1.athlete_display_name as participant_1_name,
            a1.athlete_headshot as participant_1_headshot,
            pbp.participant_2_id,
            a2.athlete_display_name as participant_2_name,
            pbp.participant_3_id,
            a3.athlete_display_name as participant_3_name
        FROM play_by_play pbp
        LEFT JOIN athletes a1 ON pbp.participant_1_id = a1.athlete_id
        LEFT JOIN athletes a2 ON pbp.participant_2_id = a2.athlete_id
        LEFT JOIN athletes a3 ON pbp.participant_3_id = a3.athlete_id
        WHERE pbp.game_id = :game_id
    """

    params = {"game_id": game_id}

    if quarter:
        query_str += " AND pbp.quarter_number = :quarter"
        params["quarter"] = quarter

    if play_type:
        query_str += " AND pbp.playType_id = :play_type"
        params["play_type"] = play_type

    if scoring_only:
        query_str += " AND pbp.scoring_play = '1'"

    query_str += " ORDER BY CAST(pbp.sequenceNumber AS INTEGER) LIMIT :limit"
    params["limit"] = limit

    plays = db.execute(text(query_str), params).fetchall()

    # Group plays by quarter
    plays_by_quarter = {}
    for play in plays:
        play_dict = dict(play._mapping)
        quarter = play_dict.get('quarter_display_value', 'Unknown')
        if quarter not in plays_by_quarter:
            plays_by_quarter[quarter] = []
        plays_by_quarter[quarter].append(play_dict)

    return {
        "game_id": game_id,
        "total_plays": len(plays),
        "plays": [dict(play._mapping) for play in plays],
        "plays_by_quarter": plays_by_quarter
    }


@router.get("/{game_id}/live")
async def get_live_game_stats(game_id: str):
    """
    Get live game stats from ESPN API for in-progress games
    Returns team stats, player stats, and game status
    """

    url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={game_id}"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching live game data: {str(e)}"
        )

    # Extract boxscore data
    boxscore = data.get('boxscore', {})
    teams = boxscore.get('teams', [])
    players = boxscore.get('players', [])

    if not teams:
        raise HTTPException(status_code=404, detail="Boxscore data not available")

    # Parse team stats
    def parse_team_stats(team_data):
        team = team_data.get('team', {})
        statistics = team_data.get('statistics', [])

        stats_dict = {}
        for stat in statistics:
            name = stat.get('name')
            value = stat.get('displayValue')
            stats_dict[name] = value

        return {
            'team_id': team.get('id'),
            'team_name': team.get('displayName'),
            'team_abbreviation': team.get('abbreviation'),
            'team_logo': team.get('logo'),
            'team_color': team.get('color'),
            'stats': stats_dict
        }

    away_team = parse_team_stats(teams[0]) if len(teams) > 0 else None
    home_team = parse_team_stats(teams[1]) if len(teams) > 1 else None

    # Parse player stats
    def parse_player_stats(team_players):
        team_info = team_players.get('team', {})
        statistics = team_players.get('statistics', [])

        if not statistics:
            return []

        # Get the main statistics group (usually the first one)
        stat_group = statistics[0]
        athletes = stat_group.get('athletes', [])
        labels = stat_group.get('labels', [])

        parsed_players = []
        for athlete_data in athletes:
            athlete = athlete_data.get('athlete', {})
            stats = athlete_data.get('stats', [])

            # Create dict mapping labels to values
            stats_dict = {}
            for i, label in enumerate(labels):
                if i < len(stats):
                    stats_dict[label] = stats[i]

            parsed_players.append({
                'athlete_id': athlete.get('id'),
                'athlete_name': athlete.get('displayName'),
                'athlete_short_name': athlete.get('shortName'),
                'athlete_headshot': athlete.get('headshot', {}).get('href'),
                'position': athlete.get('position', {}).get('abbreviation'),
                'jersey': athlete.get('jersey'),
                'starter': athlete_data.get('starter', False),
                'stats': stats_dict
            })

        return parsed_players

    away_players = parse_player_stats(players[0]) if len(players) > 0 else []
    home_players = parse_player_stats(players[1]) if len(players) > 1 else []

    # Get game header info
    header = data.get('header', {})
    competition = header.get('competitions', [{}])[0]
    status = competition.get('status', {})
    competitors = competition.get('competitors', [])

    # Extract linescores (quarter-by-quarter scoring)
    away_linescores = []
    home_linescores = []
    if competitors:
        for competitor in competitors:
            linescores = competitor.get('linescores', [])
            if competitor.get('homeAway') == 'away':
                away_linescores = linescores
            else:
                home_linescores = linescores

    # Extract injury data
    injuries_data = data.get('injuries', [])
    away_injuries = []
    home_injuries = []

    for team_injury in injuries_data:
        team_id = team_injury.get('team', {}).get('id')
        injuries_list = team_injury.get('injuries', [])

        parsed_injuries = []
        for injury in injuries_list:
            athlete = injury.get('athlete', {})
            parsed_injuries.append({
                'athlete_id': athlete.get('id'),
                'athlete_name': athlete.get('displayName'),
                'athlete_headshot': athlete.get('headshot', {}).get('href'),
                'position': athlete.get('position', {}).get('abbreviation'),
                'status': injury.get('status'),
                'date': injury.get('date'),
                'details': injury.get('details', {}).get('detail') if injury.get('details') else None,
                'type': injury.get('details', {}).get('type') if injury.get('details') else None
            })

        if team_id == away_team.get('team_id'):
            away_injuries = parsed_injuries
        elif team_id == home_team.get('team_id'):
            home_injuries = parsed_injuries

    return {
        'game_id': game_id,
        'status': {
            'state': status.get('type', {}).get('state'),
            'period': status.get('period'),
            'clock': status.get('displayClock'),
            'detail': status.get('type', {}).get('detail')
        },
        'away_team': away_team,
        'home_team': home_team,
        'away_players': away_players,
        'home_players': home_players,
        'away_linescores': away_linescores,
        'home_linescores': home_linescores,
        'away_injuries': away_injuries,
        'home_injuries': home_injuries,
        'available': True
    }


@router.get("/{game_id}/live-plays")
async def get_live_game_plays(
    game_id: str,
    quarter: Optional[str] = None,
    scoring_only: bool = False,
    limit: int = Query(500, le=2000),
    db: Session = Depends(get_db)
):
    """
    Get live play-by-play for a game from ESPN API

    Args:
        game_id: ESPN game ID
        quarter: Filter by quarter number (1, 2, 3, 4)
        scoring_only: Only return scoring plays
        limit: Maximum number of plays to return
    """

    url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={game_id}"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching live play-by-play data: {str(e)}"
        )

    plays = data.get('plays', [])

    if not plays:
        return {
            "game_id": game_id,
            "total_plays": 0,
            "plays": [],
            "plays_by_quarter": {}
        }

    # Collect all athlete IDs to fetch headshots
    athlete_ids = set()
    for play in plays:
        participants = play.get('participants', [])
        for participant in participants:
            athlete_id = participant.get('athlete', {}).get('id')
            if athlete_id:
                athlete_ids.add(str(athlete_id))

    # Fetch athlete info from database
    athlete_info = {}
    if athlete_ids:
        placeholders = ','.join([f"'{id}'" for id in athlete_ids])
        athlete_query = text(f"""
            SELECT athlete_id, athlete_display_name, athlete_headshot
            FROM athletes
            WHERE athlete_id IN ({placeholders})
        """)
        athletes = db.execute(athlete_query).fetchall()
        athlete_info = {str(a.athlete_id): dict(a._mapping) for a in athletes}

    # Parse and format plays
    formatted_plays = []
    for play in plays:
        # Filter by quarter if specified
        if quarter and str(play.get('period', {}).get('number')) != quarter:
            continue

        # Filter by scoring plays if specified
        if scoring_only and not play.get('scoringPlay', False):
            continue

        # Get participant info (athletes involved in the play)
        participants = play.get('participants', [])
        participant_1_id = participants[0].get('athlete', {}).get('id') if len(participants) > 0 else None
        participant_2_id = participants[1].get('athlete', {}).get('id') if len(participants) > 1 else None
        participant_3_id = participants[2].get('athlete', {}).get('id') if len(participants) > 2 else None

        # Get athlete info from database
        participant_1_info = athlete_info.get(str(participant_1_id), {}) if participant_1_id else {}
        participant_2_info = athlete_info.get(str(participant_2_id), {}) if participant_2_id else {}
        participant_3_info = athlete_info.get(str(participant_3_id), {}) if participant_3_id else {}

        formatted_play = {
            'play_id': play.get('id'),
            'sequenceNumber': play.get('sequenceNumber'),
            'playType_id': play.get('type', {}).get('id'),
            'playType_text': play.get('type', {}).get('text'),
            'text': play.get('text'),
            'awayScore': play.get('awayScore'),
            'homeScore': play.get('homeScore'),
            'quarter_number': str(play.get('period', {}).get('number', '')),
            'quarter_display_value': play.get('period', {}).get('displayValue'),
            'clock_display_value': play.get('clock', {}).get('displayValue'),
            'scoring_play': '1' if play.get('scoringPlay') else '0',
            'score_value': str(play.get('scoreValue', 0)),
            'team_id': play.get('team', {}).get('id'),
            'shooting_play': play.get('shootingPlay', False),
            'participant_1_id': participant_1_id,
            'participant_1_name': participant_1_info.get('athlete_display_name'),
            'participant_1_headshot': participant_1_info.get('athlete_headshot'),
            'participant_2_id': participant_2_id,
            'participant_2_name': participant_2_info.get('athlete_display_name'),
            'participant_3_id': participant_3_id,
            'participant_3_name': participant_3_info.get('athlete_display_name'),
        }

        formatted_plays.append(formatted_play)

        # Stop if we've reached the limit
        if len(formatted_plays) >= limit:
            break

    # Group plays by quarter
    plays_by_quarter = {}
    for play in formatted_plays:
        quarter_name = play.get('quarter_display_value', 'Unknown')
        if quarter_name not in plays_by_quarter:
            plays_by_quarter[quarter_name] = []
        plays_by_quarter[quarter_name].append(play)

    return {
        "game_id": game_id,
        "total_plays": len(formatted_plays),
        "plays": formatted_plays,
        "plays_by_quarter": plays_by_quarter
    }


@router.get("/{game_id}/odds")
def get_game_odds(game_id: str, db: Session = Depends(get_db)):
    """
    Get betting odds for a game from the database
    Returns spread, over/under, and money line odds
    """
    from database.models import GameOdds

    # Query for odds - get the most recent odds for this game
    odds_query = db.query(GameOdds).filter(
        GameOdds.game_id == game_id,
        GameOdds.odds_type == 'current'
    ).first()

    if not odds_query:
        return {
            "game_id": game_id,
            "available": False,
            "odds": None
        }

    return {
        "game_id": game_id,
        "available": True,
        "odds": {
            "provider": odds_query.provider_name,
            "spread": odds_query.spread,
            "home_spread_odds": odds_query.home_spread_odds,
            "away_spread_odds": odds_query.away_spread_odds,
            "home_favorite": odds_query.home_favorite,
            "home_moneyline": odds_query.home_moneyline,
            "away_moneyline": odds_query.away_moneyline,
            "over_under": odds_query.over_under,
            "over_odds": odds_query.over_odds,
            "under_odds": odds_query.under_odds,
            "details": odds_query.details,
            "last_updated": odds_query.last_updated
        }
    }


@router.get("/{game_id}/shots")
async def get_game_shots(game_id: str, db: Session = Depends(get_db)):
    """
    Get shot chart data for a game from ESPN API
    Returns all shooting plays with coordinates, player info, and shot results
    """

    url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={game_id}"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching shot data: {str(e)}"
        )

    plays = data.get('plays', [])

    if not plays:
        return {
            "game_id": game_id,
            "total_shots": 0,
            "shots": [],
            "available": False
        }

    # Filter to only shooting plays
    shooting_plays = [p for p in plays if p.get('shootingPlay')]

    # Collect all athlete IDs to fetch headshots
    athlete_ids = set()
    for play in shooting_plays:
        participants = play.get('participants', [])
        for participant in participants:
            athlete_id = participant.get('athlete', {}).get('id')
            if athlete_id:
                athlete_ids.add(str(athlete_id))

    # Fetch athlete info from database
    athlete_info = {}
    if athlete_ids:
        placeholders = ','.join([f"'{id}'" for id in athlete_ids])
        athlete_query = text(f"""
            SELECT athlete_id, athlete_display_name, athlete_headshot
            FROM athletes
            WHERE athlete_id IN ({placeholders})
        """)
        athletes = db.execute(athlete_query).fetchall()
        athlete_info = {str(a.athlete_id): dict(a._mapping) for a in athletes}

    # Process shots
    shots = []
    for play in shooting_plays:
        coordinate = play.get('coordinate', {})

        # Skip if no coordinates
        if not coordinate or coordinate.get('x') is None or coordinate.get('y') is None:
            continue

        # Get participant info
        participants = play.get('participants', [])
        shooter_id = participants[0].get('athlete', {}).get('id') if len(participants) > 0 else None
        shooter_info = athlete_info.get(str(shooter_id), {}) if shooter_id else {}

        shot = {
            'play_id': play.get('id'),
            'sequence_number': play.get('sequenceNumber'),
            'text': play.get('text'),
            'x': coordinate.get('x'),
            'y': coordinate.get('y'),
            'made': play.get('scoringPlay', False),
            'shot_type': play.get('type', {}).get('text'),
            'score_value': play.get('scoreValue', 0),
            'quarter': play.get('period', {}).get('number'),
            'quarter_display': play.get('period', {}).get('displayValue'),
            'clock': play.get('clock', {}).get('displayValue'),
            'team_id': play.get('team', {}).get('id'),
            'athlete_id': shooter_id,
            'athlete_name': shooter_info.get('athlete_display_name', 'Unknown'),
            'athlete_headshot': shooter_info.get('athlete_headshot'),
            'away_score': play.get('awayScore'),
            'home_score': play.get('homeScore')
        }

        shots.append(shot)

    # Calculate shot statistics
    made_shots = [s for s in shots if s['made']]
    missed_shots = [s for s in shots if not s['made']]

    return {
        "game_id": game_id,
        "total_shots": len(shots),
        "made": len(made_shots),
        "missed": len(missed_shots),
        "field_goal_percentage": round((len(made_shots) / len(shots) * 100), 1) if shots else 0,
        "shots": shots,
        "available": True
    }


@router.get("/{game_id}/props")
async def get_player_props(game_id: str, db: Session = Depends(get_db)):
    """
    Get player prop bets for a game

    First attempts to fetch from database, then falls back to ESPN API if not found
    """

    # First, try to fetch props from database with team info
    props_query = text("""
        SELECT
            pp.athlete_id,
            pp.prop_type,
            pp.line,
            pp.over_odds,
            pp.under_odds,
            pp.provider,
            pp.last_updated,
            a.athlete_display_name,
            a.athlete_headshot,
            r.team_id
        FROM player_props pp
        LEFT JOIN athletes a ON pp.athlete_id = a.athlete_id
        LEFT JOIN rosters r ON pp.athlete_id = r.athlete_id
        WHERE pp.game_id = :game_id
    """)

    props_result = db.execute(props_query, {"game_id": game_id}).fetchall()

    # If props found in database, format and return them
    if props_result:
        props_by_player = {}
        provider = None

        for row in props_result:
            row_dict = dict(row._mapping)
            athlete_id = row_dict['athlete_id']

            if not provider:
                provider = row_dict['provider']

            if athlete_id not in props_by_player:
                props_by_player[athlete_id] = {
                    'athlete_id': athlete_id,
                    'athlete_name': row_dict.get('athlete_display_name', 'Unknown'),
                    'athlete_headshot': row_dict.get('athlete_headshot'),
                    'team_id': row_dict.get('team_id'),
                    'props': []
                }

            prop_detail = {
                'type': row_dict['prop_type'],
                'line': row_dict['line'],
                'over_odds': row_dict['over_odds'],
                'under_odds': row_dict['under_odds'],
                'last_updated': row_dict['last_updated']
            }

            props_by_player[athlete_id]['props'].append(prop_detail)

        # Filter out Basketball Player Prop and organize props by type for each player
        for athlete_id, player_data in props_by_player.items():
            # Filter out Basketball Player Prop
            player_data['props'] = [p for p in player_data['props'] if p['type'] != 'Basketball Player Prop']

            props_by_type = {}
            for prop in player_data['props']:
                prop_type = prop['type']
                if prop_type not in props_by_type:
                    props_by_type[prop_type] = []
                props_by_type[prop_type].append(prop)
            player_data['props_by_type'] = props_by_type

        # Remove players with no props after filtering
        props_by_player = {k: v for k, v in props_by_player.items() if v['props']}

        return {
            "game_id": game_id,
            "provider": provider or "ESPN BET",
            "total_props": sum(len(p['props']) for p in props_by_player.values()),
            "total_players": len(props_by_player),
            "props_by_player": props_by_player,
            "available": True,
            "source": "database"
        }

    # If no props in database, try ESPN API with pagination
    provider_id = "58"

    try:
        all_items = []
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
                    # Include ALL items that have a line (even if missing over or under)
                    for item in data['items']:
                        current = item.get('current', {})
                        target = current.get('target', {})
                        line = target.get('displayValue')

                        # Only skip if there's no line at all
                        if not line:
                            continue

                        all_items.append(item)

                        # Extract athlete IDs
                        athlete_ref = item.get('athlete', {}).get('$ref', '')
                        if athlete_ref:
                            athlete_id = athlete_ref.split('/')[-1].split('?')[0]
                            athlete_ids.add(athlete_id)

            page_index += 1

    except httpx.HTTPError as e:
        # Props not available in database or API
        return {
            "game_id": game_id,
            "total_props": 0,
            "props_by_player": {},
            "available": False,
            "source": "none"
        }

    if not all_items:
        return {
            "game_id": game_id,
            "total_props": 0,
            "props_by_player": {},
            "available": False,
            "source": "api_empty"
        }

    # Query database for athlete info
    athlete_info = {}
    if athlete_ids:
        # Build IN clause manually for SQLite
        placeholders = ','.join([f"'{id}'" for id in athlete_ids])
        athlete_query = text(f"""
            SELECT athlete_id, athlete_display_name, athlete_headshot
            FROM athletes
            WHERE athlete_id IN ({placeholders})
        """)
        athletes = db.execute(athlete_query).fetchall()
        athlete_info = {str(a.athlete_id): dict(a._mapping) for a in athletes}

    # Group props by player and merge over/under for same line
    props_by_player = {}
    props_dict = {}  # Key: athlete_id_proptype_line, Value: prop detail

    for item in all_items:
        athlete_ref = item.get('athlete', {}).get('$ref', '')
        if not athlete_ref:
            continue

        athlete_id = athlete_ref.split('/')[-1].split('?')[0]

        # Get player info
        player_name = athlete_info.get(athlete_id, {}).get('athlete_display_name', 'Unknown')
        player_headshot = athlete_info.get(athlete_id, {}).get('athlete_headshot')

        if athlete_id not in props_by_player:
            props_by_player[athlete_id] = {
                'athlete_id': athlete_id,
                'athlete_name': player_name,
                'athlete_headshot': player_headshot,
                'props': []
            }

        # Extract prop details
        prop_type = item.get('type', {}).get('name', 'Unknown')
        current = item.get('current', {})
        target = current.get('target', {})
        over = current.get('over', {})
        under = current.get('under', {})
        line = target.get('displayValue')

        # Create unique key for merging over/under
        prop_key = f"{athlete_id}_{prop_type}_{line}"

        if prop_key in props_dict:
            # Merge over/under odds for existing prop
            if over and not props_dict[prop_key]['over_odds']:
                props_dict[prop_key]['over_odds'] = over.get('alternateDisplayValue')
            if under and not props_dict[prop_key]['under_odds']:
                props_dict[prop_key]['under_odds'] = under.get('alternateDisplayValue')
        else:
            # Create new prop entry
            props_dict[prop_key] = {
                'athlete_id': athlete_id,
                'type': prop_type,
                'line': line,
                'over_odds': over.get('alternateDisplayValue') if over else None,
                'under_odds': under.get('alternateDisplayValue') if under else None,
                'last_updated': item.get('lastUpdated')
            }

    # Organize merged props by player
    for prop_key, prop_detail in props_dict.items():
        athlete_id = prop_detail['athlete_id']
        if athlete_id in props_by_player:
            props_by_player[athlete_id]['props'].append(prop_detail)

    # Filter out Basketball Player Prop and organize props by type for each player
    for athlete_id, player_data in props_by_player.items():
        # Filter out Basketball Player Prop
        player_data['props'] = [p for p in player_data['props'] if p['type'] != 'Basketball Player Prop']

        props_by_type = {}
        for prop in player_data['props']:
            prop_type = prop['type']
            if prop_type not in props_by_type:
                props_by_type[prop_type] = []
            props_by_type[prop_type].append(prop)
        player_data['props_by_type'] = props_by_type

    # Remove players with no props after filtering
    props_by_player = {k: v for k, v in props_by_player.items() if v['props']}

    return {
        "game_id": game_id,
        "provider": "ESPN BET",
        "total_props": sum(len(p['props']) for p in props_by_player.values()),
        "total_players": len(props_by_player),
        "props_by_player": props_by_player,
        "available": True,
        "source": "api"
    }
