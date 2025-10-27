"""
Script to fetch player props for upcoming games and store them in the database
"""
import httpx
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from database.create_db import PlayerProps, BasicEvent
import time

# Database setup
engine = create_engine('sqlite:///../../data/nba.db', echo=False)
Session = sessionmaker(bind=engine)
session = Session()

# ESPN BET provider ID
PROVIDER_ID = "58"
PROVIDER_NAME = "ESPN BET"


def get_upcoming_games():
    """Get list of upcoming games from basic_events table"""
    try:
        # Get games from the next 7 days
        query = text("""
            SELECT DISTINCT event_id, season
            FROM basic_events
            WHERE date >= date('now')
            AND date <= date('now', '+7 days')
            ORDER BY date
        """)
        result = session.execute(query)
        games = [{'game_id': row[0], 'season': row[1]} for row in result]
        print(f"Found {len(games)} upcoming games")
        return games
    except Exception as e:
        print(f"Error fetching upcoming games: {e}")
        return []


def fetch_player_props_for_game(game_data, max_retries=2):
    """Fetch player props for a single game"""
    game_id = game_data['game_id']
    season = game_data['season']

    # Group props by unique key (athlete_id + prop_type + line)
    # ESPN returns separate items for over/under, we need to combine them
    props_dict = {}
    fetch_date = datetime.now(datetime.UTC).isoformat() if hasattr(datetime, 'UTC') else datetime.utcnow().isoformat()

    # Start with page 1
    page_index = 1
    page_count = 1  # Will be updated from first response

    while page_index <= page_count:
        url = f"https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/{game_id}/competitions/{game_id}/odds/{PROVIDER_ID}/propBets?lang=en&region=us&limit=1000&page={page_index}"

        for attempt in range(max_retries):
            try:
                response = httpx.get(url, timeout=30.0)
                response.raise_for_status()
                data = response.json()

                # Update page count from response
                if page_index == 1:
                    page_count = data.get('pageCount', 1)
                    total_count = data.get('count', 0)
                    if page_count > 1:
                        print(f"    Found {total_count} props across {page_count} pages")

                if not data.get('items'):
                    break  # No more items, exit page loop

                for item in data['items']:
                    # Extract athlete ID
                    athlete_ref = item.get('athlete', {}).get('$ref', '')
                    if not athlete_ref:
                        continue

                    athlete_id = athlete_ref.split('/')[-1].split('?')[0]

                    # Extract prop details
                    prop_type = item.get('type', {}).get('name', 'Unknown')
                    prop_type_id = item.get('type', {}).get('id', '')

                    current = item.get('current', {})
                    target = current.get('target', {})
                    over = current.get('over', {})
                    under = current.get('under', {})

                    line = target.get('displayValue', '')

                    # Only skip if there's no line at all
                    if not line:
                        continue

                    # Create unique prop_id
                    prop_type_clean = prop_type.replace(' ', '_').replace('-', '_')
                    prop_id = f"{game_id}_{athlete_id}_{prop_type_clean}_{line}"

                    # If this prop_id already exists, merge over/under odds
                    if prop_id in props_dict:
                        existing = props_dict[prop_id]
                        if over and not existing['over_odds']:
                            existing['over_odds'] = over.get('alternateDisplayValue')
                            existing['over_decimal'] = str(over.get('decimal', ''))
                        if under and not existing['under_odds']:
                            existing['under_odds'] = under.get('alternateDisplayValue')
                            existing['under_decimal'] = str(under.get('decimal', ''))
                    else:
                        # Create new prop entry
                        props_dict[prop_id] = {
                            'prop_id': prop_id,
                            'game_id': game_id,
                            'season': season,
                            'athlete_id': athlete_id,
                            'prop_type': prop_type,
                            'prop_type_id': str(prop_type_id),
                            'line': line,
                            'over_odds': over.get('alternateDisplayValue') if over else None,
                            'under_odds': under.get('alternateDisplayValue') if under else None,
                            'over_decimal': str(over.get('decimal', '')) if over else None,
                            'under_decimal': str(under.get('decimal', '')) if under else None,
                            'provider': PROVIDER_NAME,
                            'provider_id': PROVIDER_ID,
                            'last_updated': item.get('lastUpdated'),
                            'fetch_date': fetch_date
                        }

                break  # Success, exit retry loop

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    # No props available for this game yet
                    return []
                elif attempt < max_retries - 1:
                    time.sleep(1)
                    continue
                else:
                    print(f"  Error fetching props for game {game_id}: {e}")
                    return []
            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep(1)
                    continue
                else:
                    print(f"  Unexpected error for game {game_id}: {e}")
                    return []

        page_index += 1

    return list(props_dict.values())


def main():
    print("="*80)
    print("FETCHING PLAYER PROPS FOR UPCOMING GAMES")
    print("="*80)

    # Get upcoming games
    upcoming_games = get_upcoming_games()

    if not upcoming_games:
        print("No upcoming games found!")
        return

    # Fetch props for all games
    all_props = []

    print(f"\nFetching player props from {len(upcoming_games)} games...")

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {
            executor.submit(fetch_player_props_for_game, game): game
            for game in upcoming_games
        }

        for i, future in enumerate(as_completed(futures), 1):
            try:
                props = future.result()
                if props:
                    all_props.extend(props)
                    game = futures[future]
                    print(f"  [{i}/{len(upcoming_games)}] Game {game['game_id']}: {len(props)} props")
                else:
                    game = futures[future]
                    print(f"  [{i}/{len(upcoming_games)}] Game {game['game_id']}: No props available")
            except Exception as e:
                print(f"  Error processing game: {e}")

    if not all_props:
        print("\nNo player props found for upcoming games.")
        return

    print(f"\n{'='*80}")
    print(f"TOTAL PROPS FETCHED: {len(all_props)}")
    print(f"{'='*80}")

    # Check for existing props
    print("\nChecking for existing props in database...")
    existing_prop_ids = set()
    try:
        result = session.execute(text("SELECT prop_id FROM player_props"))
        existing_prop_ids = {row[0] for row in result}
        print(f"  Found {len(existing_prop_ids)} existing props")
    except Exception as e:
        print(f"  No existing props found: {e}")

    # Filter out duplicates
    new_props = [p for p in all_props if p['prop_id'] not in existing_prop_ids]
    print(f"  {len(new_props)} new props to insert")

    if not new_props:
        print("\nAll props already in database!")
        return

    # Insert new props
    print(f"\nInserting {len(new_props)} new props...")

    try:
        # Use bulk insert for better performance
        session.bulk_insert_mappings(PlayerProps, new_props)
        session.commit()
        print(f"  Successfully inserted {len(new_props)} props!")

        # Show summary by game
        from collections import Counter
        games_count = Counter(p['game_id'] for p in new_props)
        print(f"\n  Props by game:")
        for game_id, count in games_count.most_common():
            print(f"    Game {game_id}: {count} props")

    except Exception as e:
        print(f"  Error inserting props: {e}")
        session.rollback()
        raise
    finally:
        session.close()

    print(f"\n{'='*80}")
    print("PLAYER PROPS UPDATE COMPLETE")
    print(f"{'='*80}")


if __name__ == "__main__":
    main()
