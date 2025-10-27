"""
Script to fetch and store game odds from ESPN API into the database.

Usage:
    python fetch_game_odds.py --season 2025
    python fetch_game_odds.py --season 2025 --game-id 401704629
"""

import httpx
import asyncio
import argparse
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.database.models import GameOdds, BasicEvent

# Database setup
DATABASE_URL = "sqlite:///../../data/nba.db"
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)


async def fetch_game_odds(game_id: str) -> dict:
    """
    Fetch odds for a single game from ESPN API.

    Args:
        game_id: ESPN game/event ID

    Returns:
        Dictionary with odds data or None if not available
    """
    url = f"https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/{game_id}/competitions/{game_id}/odds/"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()

            if not data.get('items'):
                print(f"  No odds available for game {game_id}")
                return None

            return data
    except httpx.HTTPError as e:
        print(f"  Error fetching odds for game {game_id}: {str(e)}")
        return None


def parse_odds_data(game_id: str, season: str, odds_data: dict) -> list:
    """
    Parse ESPN odds API response into GameOdds model objects.

    Args:
        game_id: ESPN game/event ID
        season: Season year (e.g., "2025")
        odds_data: Raw odds data from ESPN API

    Returns:
        List of GameOdds objects
    """
    odds_objects = []
    timestamp = datetime.now().isoformat()

    for item in odds_data.get('items', []):
        provider_id = item.get('provider', {}).get('id')
        provider_name = item.get('provider', {}).get('name', 'Unknown')

        # Extract key values
        spread = item.get('spread')
        over_under = item.get('overUnder')
        details = item.get('details', '')

        # Home and away team odds
        home_odds = item.get('homeTeamOdds', {})
        away_odds = item.get('awayTeamOdds', {})

        home_favorite = home_odds.get('favorite', False)
        home_moneyline = home_odds.get('moneyLine')
        away_moneyline = away_odds.get('moneyLine')
        home_spread_odds = home_odds.get('spreadOdds')
        away_spread_odds = away_odds.get('spreadOdds')

        # Over/Under odds
        over_odds = item.get('overOdds')
        under_odds = item.get('underOdds')

        # Create "current" odds entry (we'll focus on current odds for now)
        odds_id = f"{game_id}_{provider_id}_current"

        odds_obj = GameOdds(
            odds_id=odds_id,
            game_id=game_id,
            season=season,
            provider_id=provider_id,
            provider_name=provider_name,
            odds_type='current',
            spread=spread,
            home_spread_odds=home_spread_odds,
            away_spread_odds=away_spread_odds,
            home_favorite=home_favorite,
            home_moneyline=home_moneyline,
            away_moneyline=away_moneyline,
            over_under=over_under,
            over_odds=over_odds,
            under_odds=under_odds,
            last_updated=timestamp,
            details=details
        )

        odds_objects.append(odds_obj)

    return odds_objects


async def fetch_and_store_odds_for_games(game_ids: list, season: str):
    """
    Fetch odds for multiple games and store them in the database.

    Args:
        game_ids: List of game IDs to fetch odds for
        season: Season year (e.g., "2025")
    """
    session = Session()

    try:
        print(f"\nFetching odds for {len(game_ids)} games...")

        # Fetch odds concurrently
        tasks = [fetch_game_odds(game_id) for game_id in game_ids]
        results = await asyncio.gather(*tasks)

        total_stored = 0
        total_updated = 0

        for game_id, odds_data in zip(game_ids, results):
            if not odds_data:
                continue

            # Parse odds data
            odds_objects = parse_odds_data(game_id, season, odds_data)

            # Store or update in database
            for odds_obj in odds_objects:
                existing = session.query(GameOdds).filter_by(odds_id=odds_obj.odds_id).first()

                if existing:
                    # Update existing record
                    for key, value in vars(odds_obj).items():
                        if not key.startswith('_'):
                            setattr(existing, key, value)
                    total_updated += 1
                else:
                    # Insert new record
                    session.add(odds_obj)
                    total_stored += 1

        session.commit()
        print(f"\n✓ Successfully stored {total_stored} new odds entries")
        print(f"✓ Updated {total_updated} existing odds entries")

    except Exception as e:
        session.rollback()
        print(f"\n✗ Error storing odds: {str(e)}")
        raise
    finally:
        session.close()


def get_games_from_db(season: str) -> list:
    """
    Get all game IDs from the database for a given season.

    Args:
        season: Season year (e.g., "2025")

    Returns:
        List of game IDs
    """
    session = Session()
    try:
        games = session.query(BasicEvent.event_id).filter_by(season=season).all()
        return [game[0] for game in games]
    finally:
        session.close()


async def main():
    parser = argparse.ArgumentParser(description='Fetch and store NBA game odds')
    parser.add_argument('--season', type=str, default='2025', help='Season year (default: 2025)')
    parser.add_argument('--game-id', type=str, help='Single game ID to fetch (optional)')
    parser.add_argument('--limit', type=int, help='Limit number of games to process (optional)')

    args = parser.parse_args()

    print(f"=== NBA Game Odds Fetcher ===")
    print(f"Season: {args.season}")

    # Get game IDs
    if args.game_id:
        game_ids = [args.game_id]
        print(f"Mode: Single game ({args.game_id})")
    else:
        print(f"Mode: All games from database")
        game_ids = get_games_from_db(args.season)

        if not game_ids:
            print(f"✗ No games found in database for season {args.season}")
            return

        print(f"Found {len(game_ids)} games in database")

        if args.limit:
            game_ids = game_ids[:args.limit]
            print(f"Limited to first {args.limit} games")

    # Fetch and store odds
    await fetch_and_store_odds_for_games(game_ids, args.season)

    print("\n=== Done! ===")


if __name__ == "__main__":
    asyncio.run(main())
