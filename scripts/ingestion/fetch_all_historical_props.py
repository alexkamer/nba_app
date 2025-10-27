#!/usr/bin/env python3
"""Fetch ALL historical props for 2024-2025 seasons"""

import sqlite3
import httpx
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
import time

PROVIDER_ID = "58"
PROVIDER_NAME = "ESPN BET"

def get_all_completed_games_without_props():
    """Get ALL completed games that don't have props"""
    conn = sqlite3.connect('../../data/nba.db')
    cursor = conn.cursor()
    
    query = """
        SELECT DISTINCT be.event_id, be.season, be.date, be.event_name
        FROM basic_events be
        LEFT JOIN player_props pp ON be.event_id = pp.game_id
        WHERE be.season IN ('2024', '2025')
        AND be.date < datetime('now')
        AND be.event_status_description = 'Final'
        AND pp.game_id IS NULL
        ORDER BY be.date DESC
    """
    
    cursor.execute(query)
    games = [{"game_id": row[0], "season": row[1], "date": row[2], "name": row[3]} for row in cursor.fetchall()]
    conn.close()
    
    return games

def fetch_props_for_game(game):
    """Fetch props for a game"""
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
            return None
        
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
        
    except:
        return None

def insert_props_batch(props_batch):
    """Insert a batch of props"""
    if not props_batch:
        return 0
    
    conn = sqlite3.connect('../../data/nba.db')
    cursor = conn.cursor()
    
    inserted = 0
    for prop in props_batch:
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
        except:
            pass
    
    conn.commit()
    conn.close()
    return inserted

def main():
    print("="*80)
    print("FETCH ALL HISTORICAL PROPS")
    print("="*80)
    print(f"Started: {datetime.now()}\n")
    
    games = get_all_completed_games_without_props()
    print(f"Found {len(games)} games to check\n")
    
    all_props = []
    success_count = 0
    batch_size = 100
    
    with ThreadPoolExecutor(max_workers=30) as executor:
        futures = {executor.submit(fetch_props_for_game, game): game for game in games}
        
        for i, future in enumerate(as_completed(futures), 1):
            game = futures[future]
            try:
                props = future.result()
                if props:
                    all_props.extend(props)
                    success_count += 1
                    print(f"  [{i:4d}/{len(games)}] ✓ {game['name'][:55]:55s} | {len(props):4d} props")
                    
                    # Insert in batches
                    if len(all_props) >= batch_size:
                        inserted = insert_props_batch(all_props[:batch_size])
                        all_props = all_props[batch_size:]
                        
                elif i % 50 == 0:
                    print(f"  [{i:4d}/{len(games)}] Progress... ({success_count} games with props so far)")
            except:
                pass
    
    # Insert remaining props
    if all_props:
        insert_props_batch(all_props)
    
    print(f"\n{'='*80}")
    print(f"SUCCESS: Found props for {success_count} games")
    print(f"{'='*80}")

if __name__ == "__main__":
    main()
