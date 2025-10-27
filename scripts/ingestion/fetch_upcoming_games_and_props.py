#!/usr/bin/env python3
"""
Fetch upcoming NBA games AND their props
This should be run daily to keep props updated
"""

import sqlite3
import httpx
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
import time

def fetch_upcoming_games_from_espn(days_ahead=30):
    """Fetch upcoming games from ESPN scoreboard API"""
    print(f"Fetching upcoming games for next {days_ahead} days...")
    
    games = []
    today = datetime.now()
    
    for day_offset in range(days_ahead):
        date = today + timedelta(days=day_offset)
        date_str = date.strftime("%Y%m%d")
        
        url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={date_str}"
        
        try:
            response = httpx.get(url, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            for event in data.get('events', []):
                game_info = {
                    'event_id': event.get('id'),
                    'season': event.get('season', {}).get('year'),
                    'date': event.get('date'),
                    'event_name': event.get('name'),
                    'event_shortName': event.get('shortName'),
                    'status': event.get('status', {}).get('type', {}).get('name')
                }
                games.append(game_info)
            
            time.sleep(0.5)  # Be nice to the API
            
        except Exception as e:
            print(f"  Error fetching {date_str}: {e}")
    
    print(f"Found {len(games)} upcoming games")
    return games

def insert_games_to_db(games):
    """
    DEPRECATED: basic_events should only contain completed games.
    This function is kept for backward compatibility but does nothing.
    Props can be fetched without storing upcoming games in basic_events.
    """
    print(f"Skipping game insertion - basic_events is for completed games only\n")

def fetch_props_for_game(game):
    """Fetch props for a single game"""
    game_id = game['event_id']
    season = game['season']
    
    PROVIDER_ID = "58"
    PROVIDER_NAME = "ESPN BET"
    
    props_dict = {}
    fetch_date = datetime.utcnow().isoformat()
    
    base_url = f"https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/{game_id}/competitions/{game_id}/odds/{PROVIDER_ID}/propBets?lang=en&region=us&limit=500"
    
    try:
        response = httpx.get(base_url, timeout=30.0)
        response.raise_for_status()
        data = response.json()
        
        if not data.get("items"):
            return []
        
        page_count = data.get("pageCount", 1)
        
        for page_index in range(1, page_count + 1):
            if page_index == 1:
                page_data = data
            else:
                page_url = f"{base_url}&page={page_index}"
                page_response = httpx.get(page_url, timeout=30.0)
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
            return []
        return []
    except Exception:
        return []

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
    print("NBA UPCOMING GAMES & PROPS FETCHER")
    print("="*80)
    print(f"Started: {datetime.now()}\n")
    
    # Step 1: Fetch upcoming games from ESPN
    upcoming_games = fetch_upcoming_games_from_espn(days_ahead=30)
    
    if not upcoming_games:
        print("No upcoming games found!")
        return
    
    # Step 2: Insert games into database
    insert_games_to_db(upcoming_games)
    
    # Step 3: Fetch props for each game
    print(f"Fetching props for {len(upcoming_games)} games...")
    print("="*80 + "\n")
    
    all_props = []
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch_props_for_game, game): game for game in upcoming_games}
        
        for i, future in enumerate(as_completed(futures), 1):
            game = futures[future]
            try:
                props = future.result()
                if props:
                    all_props.extend(props)
                    print(f"  [{i:3d}/{len(upcoming_games)}] {game['event_name'][:45]:45s} | {len(props):4d} props")
                else:
                    print(f"  [{i:3d}/{len(upcoming_games)}] {game['event_name'][:45]:45s} | No props yet")
            except Exception as e:
                print(f"  [{i:3d}/{len(upcoming_games)}] ERROR: {e}")
    
    # Step 4: Insert props into database
    print(f"\n{'='*80}")
    print(f"FETCHED {len(all_props)} TOTAL PROPS")
    
    if all_props:
        inserted = insert_props_to_db(all_props)
        print(f"INSERTED {inserted} PROPS INTO DATABASE")
        
        # Show breakdown
        from collections import Counter
        prop_types = Counter(p['prop_type'] for p in all_props)
        print(f"\nTop prop types:")
        for prop_type, count in prop_types.most_common(10):
            print(f"  {prop_type:40s}: {count:4d}")
    
    print(f"\n{'='*80}")
    print(f"Completed: {datetime.now()}")
    print(f"{'='*80}")

if __name__ == "__main__":
    main()
