"""Team endpoints"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from database.session import get_db
from database.models import Team, Roster
from api.models.schemas import TeamBase
import httpx
import asyncio

router = APIRouter()


@router.get("/", response_model=List[TeamBase])
def list_teams(
    season: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List all teams, optionally filtered by season"""
    query = db.query(Team)

    if season:
        query = query.filter(Team.season == season)
    else:
        # Get most recent season
        latest_season = db.query(Team.season).order_by(Team.season.desc()).first()
        if latest_season:
            query = query.filter(Team.season == latest_season[0])

    teams = query.all()
    return teams


@router.get("/{team_id}/seasons/{season}")
def get_team_season(
    team_id: str,
    season: str,
    db: Session = Depends(get_db)
):
    """Get team stats for a specific season"""

    # Get team info
    team = db.query(Team).filter(
        Team.team_id == team_id,
        Team.season == season
    ).first()

    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Get team stats from aggregate table
    query = text("""
        SELECT * FROM team_season_stats
        WHERE team_id = :team_id AND season = :season
    """)

    result = db.execute(query, {"team_id": team_id, "season": season}).fetchone()

    stats = dict(result._mapping) if result else None

    return {
        "team": team,
        "stats": stats
    }


@router.get("/{team_id}/roster")
def get_team_roster(team_id: str, db: Session = Depends(get_db)):
    """Get current roster for a team"""
    roster = db.query(Roster).filter(Roster.team_id == team_id).all()

    return {
        "team_id": team_id,
        "roster_count": len(roster),
        "players": roster
    }


@router.get("/live/standings")
async def get_live_standings(
    season: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    """
    Get current NBA standings from ESPN API
    Returns standings organized by conference and division
    Automatically uses the most recent season from the database if no season is specified
    """

    # If no season specified, get the most recent season from the database
    if not season:
        latest_season = db.query(Team.season).order_by(Team.season.desc()).first()
        if latest_season:
            season = latest_season[0]
        else:
            # Fallback to 2026 if no data in database
            season = "2026"

    url = f"https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season={season}"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching standings: {str(e)}"
        )

    # Parse standings
    standings = []

    # Extract season info from the first conference's standings
    season_info = None
    season_type = None
    season_display = None
    if data.get('children'):
        first_conference = data.get('children', [])[0]
        standings_data = first_conference.get('standings', {})
        season_info = standings_data.get('season')
        season_type = standings_data.get('seasonType')
        season_display = standings_data.get('seasonDisplayName')

    for entry in data.get('children', []):
        # Each entry is a conference (Eastern, Western)
        conference_name = entry.get('name')
        conference_abbr = entry.get('abbreviation')

        for standing in entry.get('standings', {}).get('entries', []):
            team = standing.get('team', {})
            stats = standing.get('stats', [])

            # Build stats dict
            stats_dict = {}
            for stat in stats:
                stat_name = stat.get('name')
                stat_value = stat.get('value')
                stat_display = stat.get('displayValue')

                if stat_name:
                    stats_dict[stat_name] = {
                        'value': stat_value,
                        'display': stat_display
                    }

            team_data = {
                'team_id': team.get('id'),
                'team_name': team.get('displayName'),
                'team_abbreviation': team.get('abbreviation'),
                'team_logo': team.get('logos', [{}])[0].get('href') if team.get('logos') else None,
                'conference': conference_name,
                'conference_abbr': conference_abbr,
                'rank': stats_dict.get('playoffSeed', {}).get('value'),
                'wins': stats_dict.get('wins', {}).get('value'),
                'losses': stats_dict.get('losses', {}).get('value'),
                'win_pct': stats_dict.get('winPercent', {}).get('display'),
                'games_back': stats_dict.get('gamesBehind', {}).get('display'),
                'home_record': stats_dict.get('Home', {}).get('display'),
                'away_record': stats_dict.get('Road', {}).get('display'),
                'streak': stats_dict.get('streak', {}).get('display'),
                'last_10': stats_dict.get('Last Ten Games', {}).get('display'),
                'points_per_game': stats_dict.get('avgPointsFor', {}).get('display'),
                'opp_points_per_game': stats_dict.get('avgPointsAgainst', {}).get('display'),
                'point_diff': stats_dict.get('differential', {}).get('display')
            }

            standings.append(team_data)

    # Organize by conference
    eastern = [t for t in standings if t['conference_abbr'] == 'East']
    western = [t for t in standings if t['conference_abbr'] == 'West']

    # Sort by rank
    eastern.sort(key=lambda x: x['rank'] or 999)
    western.sort(key=lambda x: x['rank'] or 999)

    return {
        'season': season_info,
        'season_display': season_display,
        'season_type': season_type,
        'eastern_conference': eastern,
        'western_conference': western,
        'total_teams': len(standings)
    }


@router.get("/live/{team_id}")
async def get_live_team_info(
    team_id: str,
    include_depthchart: bool = Query(default=False),
    db: Session = Depends(get_db)
):
    """
    Get detailed team information from ESPN API
    Optionally includes depth chart data when include_depthchart=true
    """

    url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{team_id}"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching team info: {str(e)}"
        )

    team = data.get('team', {})

    # Extract team colors
    color = team.get('color', '000000')
    alternate_color = team.get('alternateColor', '000000')

    # Get team record
    record = team.get('record', {})
    standings = team.get('standingSummary', '')

    # Extract wins and losses from record stats
    wins = None
    losses = None
    record_summary = None

    if record.get('items'):
        # Get the overall/total record (first item)
        overall_record = record.get('items', [])[0]
        record_summary = overall_record.get('summary')

        # Extract wins and losses from stats array
        stats = overall_record.get('stats', [])
        for stat in stats:
            if stat.get('name') == 'wins':
                wins = stat.get('value')
            elif stat.get('name') == 'losses':
                losses = stat.get('value')

    # Get team leaders
    leaders = []
    for leader_category in team.get('leaders', []):
        category_name = leader_category.get('displayName')
        leader_data = leader_category.get('leaders', [{}])[0]
        athlete = leader_data.get('athlete', {})

        leaders.append({
            'category': category_name,
            'value': leader_data.get('displayValue'),
            'athlete_id': athlete.get('id'),
            'athlete_name': athlete.get('displayName'),
            'athlete_headshot': athlete.get('headshot'),
            'position': athlete.get('position', {}).get('abbreviation')
        })

    # Get next event
    next_event = team.get('nextEvent', [{}])[0] if team.get('nextEvent') else None
    next_game = None
    if next_event:
        competitions = next_event.get('competitions', [{}])
        if competitions:
            comp = competitions[0]
            competitors = comp.get('competitors', [])

            home_team = next(((c for c in competitors if c.get('homeAway') == 'home')), None)
            away_team = next(((c for c in competitors if c.get('homeAway') == 'away')), None)

            next_game = {
                'game_id': next_event.get('id'),
                'date': next_event.get('date'),
                'name': next_event.get('shortName'),
                'home_team': home_team.get('team', {}).get('abbreviation') if home_team else None,
                'away_team': away_team.get('team', {}).get('abbreviation') if away_team else None,
                'venue': comp.get('venue', {}).get('fullName')
            }

    result = {
        'team_id': team.get('id'),
        'team_name': team.get('displayName'),
        'team_nickname': team.get('nickname'),
        'team_abbreviation': team.get('abbreviation'),
        'team_color': color,
        'team_alternate_color': alternate_color,
        'team_logo': team.get('logos', [{}])[0].get('href') if team.get('logos') else None,
        'location': team.get('location'),
        'venue': {
            'name': team.get('franchise', {}).get('venue', {}).get('fullName'),
            'city': team.get('franchise', {}).get('venue', {}).get('address', {}).get('city'),
            'capacity': team.get('franchise', {}).get('venue', {}).get('capacity')
        },
        'record': {
            'wins': wins,
            'losses': losses,
            'summary': record_summary
        },
        'standing_summary': standings,
        'leaders': leaders,
        'next_game': next_game
    }

    # Optionally include depth chart
    if include_depthchart:
        # Get the most recent season from the database
        latest_season = db.query(Team.season).order_by(Team.season.desc()).first()
        season = latest_season[0] if latest_season else "2026"

        depth_chart_url = f"https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/{season}/teams/{team_id}/depthcharts?limit=100"

        try:
            async with httpx.AsyncClient() as client:
                dc_response = await client.get(depth_chart_url, timeout=10.0)
                if dc_response.status_code == 200:
                    dc_data = dc_response.json()
                    items = dc_data.get('items', [])

                    if items:
                        depth_chart_data = items[0]
                        positions = depth_chart_data.get('positions', {})
                        depth_chart = {}

                        for position_key, position_data in positions.items():
                            position_info = position_data.get('position', {})
                            athletes_list = position_data.get('athletes', [])

                            athletes_processed = []
                            for athlete_entry in athletes_list:
                                athlete_ref = athlete_entry.get('athlete', {}).get('$ref')
                                if athlete_ref:
                                    try:
                                        athlete_response = await client.get(athlete_ref, timeout=5.0)
                                        if athlete_response.status_code == 200:
                                            athlete_data = athlete_response.json()

                                            athletes_processed.append({
                                                'athlete_id': athlete_data.get('id'),
                                                'athlete_name': athlete_data.get('displayName'),
                                                'athlete_full_name': athlete_data.get('fullName'),
                                                'jersey': athlete_data.get('jersey'),
                                                'rank': athlete_entry.get('rank'),
                                                'headshot': athlete_data.get('headshot', {}).get('href') if athlete_data.get('headshot') else None,
                                                'position_abbr': athlete_data.get('position', {}).get('abbreviation') if athlete_data.get('position') else None
                                            })
                                    except Exception:
                                        continue

                            athletes_processed.sort(key=lambda x: x['rank'])

                            depth_chart[position_key.upper()] = {
                                'position_name': position_info.get('displayName'),
                                'position_abbr': position_info.get('abbreviation'),
                                'athletes': athletes_processed
                            }

                        result['depth_chart'] = depth_chart
                        result['depth_chart_season'] = season
        except Exception:
            # If depth chart fetch fails, just don't include it
            pass

    return result


@router.get("/live/{team_id}/roster")
async def get_live_team_roster(team_id: str):
    """
    Get team roster with player stats from ESPN API
    """

    url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{team_id}/roster"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching team roster: {str(e)}"
        )

    athletes = data.get('athletes', [])
    roster = []

    for athlete in athletes:
        position = athlete.get('position', {})

        # Try to get stats from the athlete data (may not always be present)
        season_stats = {}
        # Note: The roster endpoint doesn't include detailed statistics
        # For stats, we'd need to fetch from a different endpoint

        player = {
            'athlete_id': athlete.get('id'),
            'athlete_name': athlete.get('displayName'),
            'athlete_headshot': athlete.get('headshot', {}).get('href') if athlete.get('headshot') else None,
            'jersey': athlete.get('jersey'),
            'position': position.get('displayName') if isinstance(position, dict) else position,
            'position_abbr': position.get('abbreviation') if isinstance(position, dict) else position,
            'height': athlete.get('displayHeight'),
            'weight': athlete.get('displayWeight'),
            'age': athlete.get('age'),
            'experience': athlete.get('experience', {}).get('displayValue') if isinstance(athlete.get('experience'), dict) else athlete.get('experience'),
            'college': athlete.get('college', {}).get('name') if isinstance(athlete.get('college'), dict) else athlete.get('college'),
            'stats': season_stats
        }

        roster.append(player)

    # Organize by position
    guards = [p for p in roster if p.get('position_abbr') in ['PG', 'SG', 'G']]
    forwards = [p for p in roster if p.get('position_abbr') in ['SF', 'PF', 'F']]
    centers = [p for p in roster if p.get('position_abbr') in ['C']]

    return {
        'team_id': team_id,
        'season': data.get('season', {}).get('year'),
        'total_players': len(roster),
        'roster': roster,
        'by_position': {
            'guards': guards,
            'forwards': forwards,
            'centers': centers
        }
    }


@router.get("/live/{team_id}/schedule")
async def get_live_team_schedule(
    team_id: str,
    season: str = "2026",
    db: Session = Depends(get_db)
):
    """
    Get team schedule (recent and upcoming games) from ESPN API
    Fetches preseason, regular season, and postseason games
    Defaults to most recent season in database
    """

    # If season not provided, get the most recent season from database
    if season == "2026":
        latest_season = db.query(Team.season).order_by(Team.season.desc()).first()
        if latest_season:
            season = latest_season[0]

    # Fetch all season types: 1=preseason, 2=regular season, 3=postseason
    all_events = []

    async with httpx.AsyncClient() as client:
        for season_type in [1, 2, 3]:
            url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{team_id}/schedule?season={season}&seasontype={season_type}"

            try:
                response = await client.get(url, timeout=10.0)
                response.raise_for_status()
                data = response.json()
                all_events.extend(data.get('events', []))
            except httpx.HTTPError as e:
                # Continue if one season type fails (e.g., no postseason games yet)
                continue

    games = []

    for event in all_events:
        competition = event.get('competitions', [{}])[0]
        competitors = competition.get('competitors', [])

        # Get home and away teams
        home_team = None
        away_team = None
        for comp in competitors:
            team_info = {
                'id': comp.get('team', {}).get('id'),
                'name': comp.get('team', {}).get('displayName'),
                'abbreviation': comp.get('team', {}).get('abbreviation'),
                'logo': comp.get('team', {}).get('logo'),
                'score': comp.get('score'),
                'winner': comp.get('winner', False),
                'record': comp.get('records', [{}])[0].get('summary') if comp.get('records') else None
            }

            if comp.get('homeAway') == 'home':
                home_team = team_info
            else:
                away_team = team_info

        # Get game status
        status = event.get('status', {})
        game_status = {
            'state': status.get('type', {}).get('state'),
            'completed': status.get('type', {}).get('completed', False),
            'detail': status.get('type', {}).get('shortDetail')
        }

        # Get season type from event
        season_type_info = event.get('seasonType', {})
        season_type = season_type_info.get('type')  # 1=preseason, 2=regular, 3=postseason
        season_type_name = season_type_info.get('name', 'Regular Season').lower().replace(' ', '-')  # e.g., 'preseason', 'regular-season', 'postseason'

        game = {
            'game_id': event.get('id'),
            'date': event.get('date'),
            'name': event.get('name'),
            'short_name': event.get('shortName'),
            'status': game_status,
            'season_type': season_type_name,
            'season_type_id': season_type,
            'home_team': home_team,
            'away_team': away_team,
            'venue': competition.get('venue', {}).get('fullName'),
            'broadcast': [b.get('names', []) for b in competition.get('broadcasts', [])]
        }

        games.append(game)

    # Separate completed and upcoming games
    # A game is considered completed if it has meaningful scores (not 0-0 from postponed/cancelled games)
    completed_games = []
    upcoming_games = []

    for g in games:
        # Check if game has scores - if both teams have scores, it's completed
        home_score_value = g.get('home_team', {}).get('score', {}).get('value') if isinstance(g.get('home_team', {}).get('score'), dict) else g.get('home_team', {}).get('score')
        away_score_value = g.get('away_team', {}).get('score', {}).get('value') if isinstance(g.get('away_team', {}).get('score'), dict) else g.get('away_team', {}).get('score')

        # A game is completed if it has non-zero scores OR explicitly marked as completed
        # This filters out postponed/cancelled games that have 0-0 scores
        has_meaningful_score = (
            home_score_value is not None and
            away_score_value is not None and
            (home_score_value > 0 or away_score_value > 0)
        )

        if has_meaningful_score or g['status']['completed']:
            completed_games.append(g)
        else:
            upcoming_games.append(g)

    # Sort: completed by date desc, upcoming by date asc, all_games by date desc (most recent first)
    completed_games.sort(key=lambda x: x['date'], reverse=True)
    upcoming_games.sort(key=lambda x: x['date'])
    games.sort(key=lambda x: x['date'], reverse=True)

    return {
        'team_id': team_id,
        'season': season,
        'total_games': len(games),
        'completed_games': completed_games,
        'upcoming_games': upcoming_games,
        'all_games': games
    }


@router.get("/live/{team_id}/injuries")
async def get_live_team_injuries(team_id: str):
    """
    Get team injury report from ESPN Core API
    """

    url = f"https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/teams/{team_id}/injuries?limit=100"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching team injuries: {str(e)}"
        )

    injuries_list = data.get('items', [])
    injuries = []

    for injury_ref in injuries_list:
        try:
            # Fetch detailed injury info
            async with httpx.AsyncClient() as client:
                injury_response = await client.get(injury_ref.get('$ref'), timeout=5.0)
                injury_response.raise_for_status()
                injury_data = injury_response.json()

            athlete_ref = injury_data.get('athlete', {}).get('$ref')
            if athlete_ref:
                # Fetch athlete info
                async with httpx.AsyncClient() as client:
                    athlete_response = await client.get(athlete_ref, timeout=5.0)
                    athlete_response.raise_for_status()
                    athlete_data = athlete_response.json()

                injuries.append({
                    'athlete_id': athlete_data.get('id'),
                    'athlete_name': athlete_data.get('displayName'),
                    'athlete_headshot': athlete_data.get('headshot', {}).get('href') if athlete_data.get('headshot') else None,
                    'position': athlete_data.get('position', {}).get('abbreviation') if athlete_data.get('position') else None,
                    'injury_status': injury_data.get('status'),
                    'injury_type': injury_data.get('type'),
                    'detail': injury_data.get('longComment') or injury_data.get('details', {}).get('shortComment'),
                    'date': injury_data.get('date')
                })
        except:
            # Skip injuries that fail to fetch
            continue

    return {
        'team_id': team_id,
        'total_injuries': len(injuries),
        'injuries': injuries
    }


@router.get("/live/{team_id}/depthchart")
async def get_team_depthchart(team_id: str, db: Session = Depends(get_db)):
    """
    Get team depth chart from ESPN API
    Returns players organized by position with their depth chart rank
    """

    # Get the most recent season from the database
    latest_season = db.query(Team.season).order_by(Team.season.desc()).first()
    season = latest_season[0] if latest_season else "2026"

    url = f"https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/{season}/teams/{team_id}/depthcharts?limit=100"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching depth chart: {str(e)}"
        )

    # Get the first (and usually only) depth chart
    items = data.get('items', [])
    if not items:
        return {
            'team_id': team_id,
            'season': season,
            'depth_chart': {}
        }

    depth_chart_data = items[0]
    positions = depth_chart_data.get('positions', {})

    # Process each position
    depth_chart = {}

    async with httpx.AsyncClient() as client:
        for position_key, position_data in positions.items():
            position_info = position_data.get('position', {})
            athletes_list = position_data.get('athletes', [])

            # Fetch athlete details concurrently
            athlete_tasks = []
            for athlete_entry in athletes_list:
                athlete_ref = athlete_entry.get('athlete', {}).get('$ref')
                if athlete_ref:
                    athlete_tasks.append({
                        'ref': athlete_ref,
                        'rank': athlete_entry.get('rank')
                    })

            # Fetch all athletes for this position
            athletes_processed = []
            for task in athlete_tasks:
                try:
                    athlete_response = await client.get(task['ref'], timeout=5.0)
                    if athlete_response.status_code == 200:
                        athlete_data = athlete_response.json()

                        athletes_processed.append({
                            'athlete_id': athlete_data.get('id'),
                            'athlete_name': athlete_data.get('displayName'),
                            'athlete_full_name': athlete_data.get('fullName'),
                            'jersey': athlete_data.get('jersey'),
                            'rank': task['rank'],
                            'headshot': athlete_data.get('headshot', {}).get('href') if athlete_data.get('headshot') else None,
                            'position_abbr': athlete_data.get('position', {}).get('abbreviation') if athlete_data.get('position') else None
                        })
                except Exception:
                    # Skip athletes that fail to fetch
                    continue

            # Sort by rank
            athletes_processed.sort(key=lambda x: x['rank'])

            depth_chart[position_key.upper()] = {
                'position_name': position_info.get('displayName'),
                'position_abbr': position_info.get('abbreviation'),
                'athletes': athletes_processed
            }

    return {
        'team_id': team_id,
        'season': season,
        'depth_chart': depth_chart
    }


@router.get("/live/{team_id}/schedule/odds")
async def get_schedule_with_odds(team_id: str, season: str = "2025", limit: int = Query(default=None, ge=1)):
    """
    Get betting odds for all games (completed and upcoming)
    Fetches odds from ESPN Odds API for all games in the season
    Selects the provider with the closest to even odds for over/under
    """

    # Fetch all season types to get all games
    all_events = []

    async with httpx.AsyncClient() as client:
        for season_type in [1, 2, 3]:
            url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{team_id}/schedule?season={season}&seasontype={season_type}"

            try:
                response = await client.get(url, timeout=10.0)
                response.raise_for_status()
                data = response.json()
                all_events.extend(data.get('events', []))
            except httpx.HTTPError as e:
                continue

    # Get all game IDs
    all_games = []
    for event in all_events:
        game_id = event.get('id')
        all_games.append({
            'game_id': game_id,
            'date': event.get('date')
        })

    # Sort by date descending (most recent first)
    all_games.sort(key=lambda x: x['date'], reverse=True)

    # Apply limit if provided
    if limit is not None:
        all_games = all_games[:limit]

    # Fetch odds concurrently for all games
    odds_data = {}

    async with httpx.AsyncClient() as client:
        tasks = []
        game_ids = []

        for game in all_games:
            game_id = game['game_id']
            game_ids.append(game_id)
            odds_url = f"https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/{game_id}/competitions/{game_id}/odds/"
            tasks.append(client.get(odds_url, timeout=5.0))

        responses = await asyncio.gather(*tasks, return_exceptions=True)

        for game_id, response in zip(game_ids, responses):
            if isinstance(response, Exception):
                # Skip if odds fetch failed
                continue

            try:
                if response.status_code == 200:
                    odds_json = response.json()
                    items = odds_json.get('items', [])

                    if items:
                        # Find provider with closest to even odds for over/under
                        best_provider = None
                        best_ou_diff = float('inf')

                        for provider_odds in items:
                            over_odds = provider_odds.get('overOdds')
                            under_odds = provider_odds.get('underOdds')

                            if over_odds is not None and under_odds is not None:
                                # Calculate how close to even (-110/-110) the odds are
                                # Closer to 0 is better (more even)
                                ou_diff = abs(over_odds + 110) + abs(under_odds + 110)

                                if ou_diff < best_ou_diff:
                                    best_ou_diff = ou_diff
                                    best_provider = provider_odds

                        # Fall back to first provider if none have over/under odds
                        if best_provider is None:
                            best_provider = items[0]

                        # Extract key odds information
                        odds_data[game_id] = {
                            'provider': best_provider.get('provider', {}).get('name', 'Unknown'),
                            'spread': best_provider.get('spread'),
                            'over_under': best_provider.get('overUnder'),
                            'details': best_provider.get('details'),
                            'over_odds': best_provider.get('overOdds'),
                            'under_odds': best_provider.get('underOdds'),
                            'home_team_odds': {
                                'favorite': best_provider.get('homeTeamOdds', {}).get('favorite', False),
                                'money_line': best_provider.get('homeTeamOdds', {}).get('moneyLine'),
                                'spread_odds': best_provider.get('homeTeamOdds', {}).get('spreadOdds')
                            },
                            'away_team_odds': {
                                'favorite': best_provider.get('awayTeamOdds', {}).get('favorite', False),
                                'money_line': best_provider.get('awayTeamOdds', {}).get('moneyLine'),
                                'spread_odds': best_provider.get('awayTeamOdds', {}).get('spreadOdds')
                            }
                        }
            except Exception:
                # Skip if parsing failed
                continue

    return {
        'team_id': team_id,
        'season': season,
        'games_with_odds': len(odds_data),
        'odds': odds_data
    }
