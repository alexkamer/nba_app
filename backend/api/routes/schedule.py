"""Schedule endpoints"""

from fastapi import APIRouter, HTTPException, Query
from datetime import datetime
import httpx

router = APIRouter()


@router.get("")
def get_schedule(date: str = Query(..., description="Date in YYYYMMDD format")):
    """
    Get NBA games for a specific date from ESPN API

    Args:
        date: Date in YYYYMMDD format (e.g., 20231225 for Christmas 2023)

    Returns:
        List of games with scores, teams, and game info
    """

    # Validate date format
    try:
        datetime.strptime(date, "%Y%m%d")
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid date format. Use YYYYMMDD (e.g., 20231225)"
        )

    # Fetch from ESPN API
    url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?limit=1000&dates={date}"

    try:
        response = httpx.get(url, timeout=30.0)
        response.raise_for_status()
        data = response.json()
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching data from ESPN: {str(e)}"
        )

    # Parse and format the response
    games = []
    for event in data.get('events', []):
        competition = event.get('competitions', [{}])[0]
        competitors = competition.get('competitors', [])

        # Get home and away teams
        home_team = None
        away_team = None
        for comp in competitors:
            # Extract leaders (top performers)
            leaders = {}
            for leader_category in comp.get('leaders', []):
                category_name = leader_category.get('name')
                if category_name in ['points', 'rebounds', 'assists']:
                    leader_data = leader_category.get('leaders', [{}])[0]
                    athlete = leader_data.get('athlete', {})
                    leaders[category_name] = {
                        'value': leader_data.get('displayValue'),
                        'athlete_name': athlete.get('displayName'),
                        'athlete_id': athlete.get('id'),
                        'headshot': athlete.get('headshot'),
                        'position': athlete.get('position', {}).get('abbreviation')
                    }

            team_info = {
                'id': comp.get('team', {}).get('id'),
                'name': comp.get('team', {}).get('displayName'),
                'abbreviation': comp.get('team', {}).get('abbreviation'),
                'logo': comp.get('team', {}).get('logo'),
                'score': comp.get('score'),
                'winner': comp.get('winner', False),
                'record': comp.get('records', [{}])[0].get('summary') if comp.get('records') else None,
                'linescores': comp.get('linescores', []),
                'leaders': leaders if leaders else None
            }

            if comp.get('homeAway') == 'home':
                home_team = team_info
            else:
                away_team = team_info

        # Get game status
        status = event.get('status', {})
        game_status = {
            'state': status.get('type', {}).get('state'),  # pre, in, post
            'completed': status.get('type', {}).get('completed', False),
            'description': status.get('type', {}).get('description'),
            'detail': status.get('type', {}).get('detail'),
            'short_detail': status.get('type', {}).get('shortDetail'),
            'period': status.get('period'),
            'display_clock': status.get('displayClock')
        }

        # Extract additional game metadata
        attendance = competition.get('attendance', 0) if competition.get('attendance', 0) > 0 else None
        headlines = competition.get('headlines', [])
        tickets = competition.get('tickets', [{}])[0] if competition.get('tickets') else None
        neutral_site = competition.get('neutralSite', False)

        # Extract odds data for upcoming games
        odds_data = None
        if competition.get('odds') and len(competition['odds']) > 0:
            odds = competition['odds'][0]  # Primary odds provider
            odds_data = {
                'provider': odds.get('provider', {}).get('name'),
                'details': odds.get('details'),  # e.g., "NY -3.5"
                'over_under': odds.get('overUnder'),  # e.g., 229.5
                'spread': odds.get('spread'),  # e.g., -3.5
                'home_moneyline': odds.get('homeTeamOdds', {}).get('moneyLine'),  # e.g., -165
                'away_moneyline': odds.get('awayTeamOdds', {}).get('moneyLine'),  # e.g., +140
                'favorite': 'home' if odds.get('homeTeamOdds', {}).get('favorite') else 'away' if odds.get('awayTeamOdds', {}).get('favorite') else None
            }

        game = {
            'game_id': event.get('id'),
            'name': event.get('name'),
            'short_name': event.get('shortName'),
            'date': event.get('date'),
            'season': {
                'year': event.get('season', {}).get('year'),
                'type': event.get('season', {}).get('type'),
                'slug': event.get('season', {}).get('slug')
            },
            'status': game_status,
            'home_team': home_team,
            'away_team': away_team,
            'venue': {
                'name': competition.get('venue', {}).get('fullName'),
                'city': competition.get('venue', {}).get('address', {}).get('city'),
                'state': competition.get('venue', {}).get('address', {}).get('state')
            },
            'broadcast': [b.get('names', []) for b in competition.get('broadcasts', [])],
            'attendance': attendance,
            'neutral_site': neutral_site,
            'headline': headlines[0] if headlines else None,
            'tickets': {
                'summary': tickets.get('summary'),
                'available': tickets.get('numberAvailable'),
                'link': tickets.get('links', [{}])[0].get('href') if tickets and tickets.get('links') else None
            } if tickets else None,
            'odds': odds_data
        }

        games.append(game)

    return {
        'date': date,
        'formatted_date': data.get('day', {}).get('date'),
        'total_games': len(games),
        'games': games
    }
