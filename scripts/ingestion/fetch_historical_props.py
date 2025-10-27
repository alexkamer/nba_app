#!/usr/bin/env python3
"""
Attempt to fetch historical player props for completed games
NOTE: Most historical props are not available via ESPN API
"""

import sqlite3
import httpx
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
import time

PROVIDER_ID = "58"
PROVIDER_NAME = "ESPN BET"

def get_completed_games_without_props(seasons=['2024', '2025'], limit=None):
    """Get completed games that don't have props yet"""
    conn = sqlite3.connect('../../data/nba.db')
    cursor = conn.cursor()
    
    query = """
        SELECT DISTINCT be.event_id, be.season, be.date, be.event_name
        FROM basic_events be
        LEFT JOIN player_props pp ON be.event_id = pp.game_id
        WHERE be.season IN ({})
        AND be.date < datetime('now')
        AND be.event_status_description = 'Final'
        AND pp.game_id IS NULL
        ORDER BY be.date DESC
    """.format(','.join('?' * len(seasons)))
    
    if limit:
        query += f" LIMIT {limit}"
    
    cursor.execute(query, seasons)
    games = [{"game_id": row[0], "season": row[1], "date": row[2], "name": row[3]} for row in cursor.fetchall()]
    conn.close()
    
    print(f"Found {len(games)} completed games without props")
    return games

def fetch_props_for_game(game):
    """Try to fetch props for a game (likely to fail for old games)"""
    game_id = game['game_id']
    season = game['season']
    
    props_dict = {}
    fetch_date = datetime.now().isoformat()
    
    base_url = f"https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/{game_id}/competitions/{game_id}/odds/{PROVIDER_ID}/propBets?lang=en&region=us&limit=500"
    
    try:
        response = httpx.get(base_url, timeout=10.0)
        response.raise_for_status()
        data = response.json()
        
        if not data.get("items"):
            return None  # No props available
        
        page_count = data.get("pageCount", 1)
        
        for page_index in range(1, page_count + 1):
            if page_index == 1:
                page_data = data
            else:
                page_url = f"{base_url}&page={page_index}"
                page_response = httpx.get(page_url, timeout=10.0)
                page_response.raise_for_status()
                page_data = page_response.json()
            
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
                
                if prop_id not in props_dict:
                    props_dict[prop_id] = {
                        "prop_id": prop_id,
                        "game_id": game_id,
                        "season": str(season),
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
            return None  # Props not available
        return None
    except Exception:
        return None

def insert_props_to_db(all_props):
    """Insert props into database"""
    if not all_props:
        return 0
    
    conn = sqlite3.connect('../../data/nba.db')
    cursor = conn.cursor()
    
    inserted = 0
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
            inserted += 1
        except Exception as e:
            print(f"Error inserting prop: {e}")
    
    conn.commit()
    conn.close()
    return inserted

def main():
    print("="*80)
    print("HISTORICAL PROPS FETCHER")
    print("="*80)
    print("NOTE: ESPN typically removes props after games complete")
    print("This script will attempt to fetch historical props, but success is unlikely")
    print("="*80)
    print(f"Started: {datetime.now()}\n")
    
    # Get completed games without props
    # Start with most recent 100 games as a test
    completed_games = get_completed_games_without_props(seasons=['2024', '2025'], limit=100)
    
    if not completed_games:
        print("No completed games without props!")
        return
    
    print(f"\nAttempting to fetch props for {len(completed_games)} recent completed games...")
    print("="*80 + "\n")
    
    all_props = []
    success_count = 0
    fail_count = 0
    
    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = {executor.submit(fetch_props_for_game, game): game for game in completed_games}
        
        for i, future in enumerate(as_completed(futures), 1):
            game = futures[future]
            try:
                props = future.result()
                if props:
                    all_props.extend(props)
                    success_count += 1
                    print(f"  [{i:3d}/{len(completed_games)}] ✓ {game['name'][:50]:50s} | {len(props):4d} props | {game['date'][:10]}")
                else:
                    fail_count += 1
                    if i % 10 == 0:  # Only print every 10th failure to reduce spam
                        print(f"  [{i:3d}/{len(completed_games)}] ✗ {game['name'][:50]:50s} | No props  | {game['date'][:10]}")
            except Exception as e:
                fail_count += 1
    
    print(f"\n{'='*80}")
    print(f"RESULTS:")
    print(f"  Success: {success_count} games with props")
    print(f"  Failed:  {fail_count} games (props not available)")
    print(f"  Total props fetched: {len(all_props)}")
    print(f"{'='*80}")
    
    if all_props:
        inserted = insert_props_to_db(all_props)
        print(f"\nInserted {inserted} props into database")
        
        # Show breakdown
        from collections import Counter
        prop_types = Counter(p['prop_type'] for p in all_props)
        print(f"\nTop prop types:")
        for prop_type, count in prop_types.most_common(10):
            print(f"  {prop_type:40s}: {count:4d}")
    else:
        print("\n⚠️  No historical props were available")
        print("This is expected - ESPN removes betting props after games complete")
        print("\nRECOMMENDATION:")
        print("  Run 'fetch_upcoming_games_and_props.py' daily BEFORE games")
        print("  to capture props while they're still available")
    
    print(f"\n{'='*80}")
    print(f"Completed: {datetime.now()}")
    print(f"{'='*80}")

if __name__ == "__main__":
    main()
