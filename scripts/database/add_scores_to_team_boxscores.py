"""Add score columns to team_boxscores table and populate from ESPN API"""
import sqlite3
import httpx
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

def add_score_columns():
    """Add home_score and away_score columns to team_boxscores"""
    conn = sqlite3.connect('../../data/nba.db')
    cursor = conn.cursor()

    # Add columns if they don't exist
    try:
        cursor.execute("ALTER TABLE team_boxscores ADD COLUMN home_score INTEGER")
        print("Added home_score column")
    except sqlite3.OperationalError:
        print("home_score column already exists")

    try:
        cursor.execute("ALTER TABLE team_boxscores ADD COLUMN away_score INTEGER")
        print("Added away_score column")
    except sqlite3.OperationalError:
        print("away_score column already exists")

    conn.commit()
    conn.close()

def get_game_scores(game_id, max_retries=3):
    """Fetch scores for a game from ESPN API"""
    url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={game_id}"

    for attempt in range(max_retries):
        try:
            response = httpx.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()

            # Get scores from header
            header = data.get('header', {})
            competitions = header.get('competitions', [{}])[0]
            competitors = competitions.get('competitors', [])

            home_score = None
            away_score = None

            for comp in competitors:
                homeAway = comp.get('homeAway')
                score = comp.get('score')

                if homeAway == 'home':
                    home_score = int(score) if score else None
                elif homeAway == 'away':
                    away_score = int(score) if score else None

            return game_id, home_score, away_score

        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(1)
            else:
                print(f"  Error fetching {game_id}: {e}")
                return game_id, None, None

    return game_id, None, None

def update_scores_batch(scores_batch):
    """Update scores for a batch of games"""
    conn = sqlite3.connect('../../data/nba.db')
    cursor = conn.cursor()

    for game_id, home_score, away_score in scores_batch:
        if home_score is not None and away_score is not None:
            cursor.execute("""
                UPDATE team_boxscores
                SET home_score = ?, away_score = ?
                WHERE game_id = ?
            """, (home_score, away_score, game_id))

    conn.commit()
    conn.close()

def populate_scores():
    """Fetch and populate scores for all games"""
    conn = sqlite3.connect('../../data/nba.db')
    cursor = conn.cursor()

    # Get all game IDs that don't have scores yet
    cursor.execute("""
        SELECT game_id FROM team_boxscores
        WHERE home_score IS NULL OR away_score IS NULL
    """)
    game_ids = [row[0] for row in cursor.fetchall()]
    conn.close()

    if not game_ids:
        print("All games already have scores!")
        return

    print(f"Fetching scores for {len(game_ids)} games...")

    # Fetch scores concurrently
    scores_to_update = []
    with ThreadPoolExecutor(max_workers=50) as executor:
        futures = [executor.submit(get_game_scores, game_id) for game_id in game_ids]

        for i, future in enumerate(as_completed(futures), 1):
            try:
                result = future.result()
                scores_to_update.append(result)

                # Update database in batches of 100
                if len(scores_to_update) >= 100:
                    update_scores_batch(scores_to_update)
                    scores_to_update = []

                if i % 100 == 0:
                    print(f"  Progress: {i}/{len(game_ids)} games processed...")
            except Exception as e:
                print(f"  Error: {e}")

    # Update remaining scores
    if scores_to_update:
        update_scores_batch(scores_to_update)

    print(f"Score population complete!")

if __name__ == "__main__":
    print("Adding score columns to team_boxscores table...")
    add_score_columns()

    print("\nPopulating scores from ESPN API...")
    populate_scores()

    # Verify results
    conn = sqlite3.connect('../../data/nba.db')
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM team_boxscores WHERE home_score IS NOT NULL AND away_score IS NOT NULL")
    count = cursor.fetchone()[0]
    print(f"\nGames with scores: {count}")
    conn.close()
