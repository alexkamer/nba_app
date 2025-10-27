#!/usr/bin/env python3
"""
Fetch player props for ALL upcoming NBA games
Run this daily to capture betting lines before games are played
"""

import sqlite3
import httpx
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
import time

# ESPN BET provider ID
PROVIDER_ID = "58"
PROVIDER_NAME = "ESPN BET"

def get_all_upcoming_games():
    """Get ALL upcoming games from basic_events table"""
    conn = sqlite3.connect('../../data/nba.db')
    cursor = conn.cursor()
    
    # Get all games from today onwards for current season (2025)
    query = """
        SELECT DISTINCT be.event_id, be.season, be.date, be.event_name
        FROM basic_events be
        WHERE be.date >= date('now')
        AND be.season = '2025'
        ORDER BY be.date
    """
    
    cursor.execute(query)
    games = [{"game_id": row[0], "season": row[1], "date": row[2], "name": row[3]} for row in cursor.fetchall()]
    conn.close()
    
    print(f"Found {len(games)} upcoming games in 2025 season")
    return games

def fetch_props_for_game(game_data, max_retries=2):
    """Fetch player props for a single game with pagination support"""
    game_id = game_data.get("game_id")
    season = game_data["season"]
    game_name = game_data.get("name", "Unknown")

    props_dict = {}
    fetch_date = datetime.utcnow().isoformat()

    base_url = f"https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/{game_id}/competitions/{game_id}/odds/{PROVIDER_ID}/propBets?lang=en&region=us&limit=500"

    for attempt in range(max_retries):
        try:
            response = httpx.get(base_url, timeout=30.0)
            response.raise_for_status()
            data = response.json()

            if not data.get("items"):
                return []

            page_count = data.get("pageCount", 1)

            # Process all pages
            for page_index in range(1, page_count + 1):
                if page_index == 1:
                    page_data = data
                else:
                    page_url = f"{base_url}&page={page_index}"
                    try:
                        page_response = httpx.get(page_url, timeout=30.0)
                        page_response.raise_for_status()
                        page_data = page_response.json()
                    except Exception as e:
                        print(f"    Warning: Error fetching page {page_index}: {e}")
                        continue

                for item in page_data.get("items", []):
                    athlete_ref = item.get("athlete", {}).get("$ref", "")
                    if not athlete_ref:
                        continue

                    athlete_id = athlete_ref.split("/")[-1].split("?")[0]
                    prop_type = item.get("type", {}).get("name", "Unknown")
                    prop_type_id = item.get("type", {}).get("id", "")

                    current = item.get("current", {})
                    target = current.get("target", {})
                    over = current.get("over", {})
                    under = current.get("under", {})

                    line = target.get("displayValue", "")
                    prop_type_clean = prop_type.replace(" ", "_").replace("-", "_")
                    prop_id = f"{game_id}_{athlete_id}_{prop_type_clean}_{line}"

                    if prop_id in props_dict:
                        existing = props_dict[prop_id]
                        if over and not existing.get('over_odds'):
                            existing['over_odds'] = over.get('alternateDisplayValue')
                            existing['over_decimal'] = str(over.get('decimal', ''))
                        if under and not existing.get('under_odds'):
                            existing['under_odds'] = under.get('alternateDisplayValue')
                            existing['under_decimal'] = str(under.get('decimal', ''))
                    else:
                        props_dict[prop_id] = {
                            "prop_id": prop_id,
                            "game_id": game_id,
                            "season": season,
                            "athlete_id": athlete_id,
                            "prop_type": prop_type,
                            "prop_type_id": str(prop_type_id),
                            "line": line,
                            "over_odds": over.get("alternateDisplayValue") if over else None,
                            "under_odds": under.get("alternateDisplayValue") if under else None,
                            "over_decimal": str(over.get("decimal", "")) if over else None,
                            "under_decimal": str(under.get("decimal", "")) if under else None,
                            "provider": PROVIDER_NAME,
                            "provider_id": PROVIDER_ID,
                            "last_updated": item.get("lastUpdated"),
                            "fetch_date": fetch_date
                        }

            return list(props_dict.values())

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return []
            elif attempt < max_retries - 1:
                time.sleep(1)
            else:
                return []
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(1)
            else:
                return []
    return []

def insert_props_to_db(all_props):
    """Insert props into database"""
    if not all_props:
        print("\nNo props to insert")
        return

    conn = sqlite3.connect('../../data/nba.db')
    cursor = conn.cursor()
    
    inserted = 0
    duplicates = 0
    
    for prop in all_props:
        try:
            cursor.execute("""
                INSERT OR REPLACE INTO player_props 
                (prop_id, game_id, season, athlete_id, prop_type, prop_type_id, 
                 line, over_odds, under_odds, over_decimal, under_decimal,
                 provider, provider_id, last_updated, fetch_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                prop['prop_id'], prop['game_id'], prop['season'], prop['athlete_id'],
                prop['prop_type'], prop['prop_type_id'], prop['line'],
                prop['over_odds'], prop['under_odds'], prop['over_decimal'],
                prop['under_decimal'], prop['provider'], prop['provider_id'],
                prop['last_updated'], prop['fetch_date']
            ))
            if cursor.rowcount > 0:
                inserted += 1
            else:
                duplicates += 1
        except Exception as e:
            print(f"Error inserting prop {prop['prop_id']}: {e}")
    
    conn.commit()
    conn.close()
    
    print(f"\n{'='*80}")
    print(f"DATABASE INSERT SUMMARY")
    print(f"{'='*80}")
    print(f"  Inserted: {inserted} props")
    print(f"  Duplicates/Updates: {duplicates} props")
    print(f"  Total processed: {len(all_props)} props")

def main():
    print("="*80)
    print("NBA PLAYER PROPS FETCHER")
    print("="*80)
    print(f"Started at: {datetime.now()}")
    
    # Get all upcoming games
    upcoming_games = get_all_upcoming_games()
    
    if not upcoming_games:
        print("\nNo upcoming games found!")
        return
    
    print(f"\nFetching props for {len(upcoming_games)} games...")
    print(f"{'='*80}\n")
    
    all_props = []
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch_props_for_game, game): game for game in upcoming_games}
        
        for i, future in enumerate(as_completed(futures), 1):
            game = futures[future]
            try:
                props = future.result()
                if props:
                    all_props.extend(props)
                    print(f"  [{i:3d}/{len(upcoming_games)}] {game['name'][:50]:50s} | {len(props):4d} props | {game['date'][:10]}")
                else:
                    print(f"  [{i:3d}/{len(upcoming_games)}] {game['name'][:50]:50s} | No props | {game['date'][:10]}")
            except Exception as e:
                print(f"  [{i:3d}/{len(upcoming_games)}] {game['name'][:50]:50s} | ERROR: {e}")
    
    print(f"\n{'='*80}")
    print(f"TOTAL PROPS FETCHED: {len(all_props)}")
    print(f"{'='*80}")
    
    # Insert into database
    insert_props_to_db(all_props)
    
    # Show summary by prop type
    if all_props:
        from collections import Counter
        prop_types = Counter(p['prop_type'] for p in all_props)
        print(f"\n{'='*80}")
        print("PROPS BY TYPE")
        print(f"{'='*80}")
        for prop_type, count in prop_types.most_common():
            print(f"  {prop_type:40s}: {count:5d} props")
    
    print(f"\n{'='*80}")
    print(f"Completed at: {datetime.now()}")
    print(f"{'='*80}")

if __name__ == "__main__":
    main()
