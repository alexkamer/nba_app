# NBA App Data Architecture

## Critical Understanding: Database vs ESPN API

This document explains the **fundamental data boundary** in the NBA app. Understanding this is essential for all development work.

---

## The Data Boundary Rule

### Database (nba.db) → Historical Completed Games ONLY

The database contains **ONLY data from completed games**. It is a historical record that does not change once games are finished.

**What's in the Database:**
- ✅ Completed game results and final scores
- ✅ Player statistics from finished games
- ✅ Team boxscores from past games
- ✅ Historical player props (captured BEFORE games were played)
- ✅ Season statistics and aggregates
- ✅ Career statistics and historical records
- ✅ Play-by-play data from completed games

**What's NOT in the Database:**
- ❌ Live/in-progress game data
- ❌ Upcoming game schedules (future events)
- ❌ Current betting lines and odds
- ❌ Real-time player props for upcoming games
- ❌ Live scores or game status

### ESPN API → Live & Future Data ONLY

The ESPN API provides **real-time and future data** that changes constantly.

**What to Fetch from ESPN API:**
- ✅ Live game scores and status
- ✅ In-progress game data
- ✅ Upcoming game schedules
- ✅ Current betting lines (change constantly)
- ✅ Current player props for upcoming games
- ✅ Real-time odds and spreads
- ✅ Game previews and predictions

**What NOT to Fetch from ESPN API:**
- ❌ Historical game results (use database)
- ❌ Season statistics (use database aggregates)
- ❌ Completed game boxscores (use database)
- ❌ Historical player props after games complete (ESPN deletes them)

---

## Decision Tree: Where to Get Data?

```
Is the game completed?
├─ YES → Query DATABASE
│   └─ All stats, boxscores, props available
│
└─ NO (future or in-progress) → Call ESPN API
    └─ Live scores, current odds, upcoming props
```

---

## Special Case: Player Props

Player props are unique because they exist in **both** places but serve different purposes:

### Props in Database
- Props that were captured **before** games were played
- Used for historical analysis and predictions
- Example: "LeBron over 25.5 points" captured before Lakers vs Celtics on 2024-10-15
- These props never change once stored

### Props from ESPN API
- **Current** props for **upcoming** games
- Must be fetched in real-time (they change constantly)
- ESPN API **deletes** props after games complete
- Example: "LeBron over 27.5 points" for tonight's game

**Important:** You cannot fetch historical props from ESPN API after games complete. Props must be captured proactively before games are played.

---

## Implementation Guidelines

### For API Endpoints

When building API endpoints, follow this pattern:

```python
# Good: Query database for historical data
@app.get("/api/games/{game_id}/stats")
async def get_game_stats(game_id: str):
    # Game is completed, query database
    return db.query("SELECT * FROM player_boxscores WHERE game_id = ?", game_id)

# Good: Fetch from ESPN for upcoming games
@app.get("/api/games/upcoming")
async def get_upcoming_games():
    # Future games, call ESPN API
    return fetch_espn("https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events")

# Good: Hybrid approach for props
@app.get("/api/games/{game_id}/props")
async def get_game_props(game_id: str):
    game = db.query("SELECT date FROM basic_events WHERE event_id = ?", game_id)

    if game.date < today:
        # Historical: query database
        return db.query("SELECT * FROM player_props WHERE game_id = ?", game_id)
    else:
        # Upcoming: fetch from ESPN API
        return fetch_espn_props(game_id)
```

### For Data Ingestion Scripts

Scripts in `scripts/ingestion/` should:
1. Fetch data from ESPN API
2. Transform and validate
3. Insert into database
4. Run on a schedule (daily/hourly) to capture data before games complete

### For Predictions & Analysis

When building predictions:
1. **Training data** → Always from database (historical games)
2. **Current props to predict** → Fetch from ESPN API for upcoming games
3. **Vegas lines for analysis** → Database has historical lines; API has current lines

---

## Database Schema Reference

**Key Tables:**
- `basic_events` - Game events (completed and upcoming if recently added)
- `player_boxscores` - Player stats from completed games
- `team_boxscores` - Team stats from completed games
- `player_props` - Historical props captured before games
- `game_odds` - Historical game odds/spreads
- `athletes` - Player information
- `teams` - Team information

**Check Game Status:**
```sql
-- Get game date to determine if completed
SELECT date, season FROM basic_events WHERE event_id = ?

-- If date < today → Query database for stats
-- If date >= today → Call ESPN API for live/future data
```

---

## ESPN API Endpoints

**Base URL:** `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/`

**Common Endpoints:**
- Events: `/events` - List of games
- Live Scores: `/events/{game_id}/competitions/{game_id}/situation`
- Player Props: `/events/{game_id}/competitions/{game_id}/odds/58/propBets`
- Game Odds: `/events/{game_id}/competitions/{game_id}/odds`

**Important Limitations:**
- ESPN API has no date range parameters for historical data
- Props are deleted after games complete
- Historical data must be captured proactively
- Rate limiting may apply

---

## Common Mistakes to Avoid

❌ **Don't query database for live scores**
```python
# BAD: Database won't have live scores
current_score = db.query("SELECT score FROM games WHERE date = today()")
```

✅ **Do fetch from ESPN API**
```python
# GOOD: Get live scores from API
current_score = fetch_espn(f"/events/{game_id}/competitions/{game_id}/situation")
```

---

❌ **Don't try to fetch historical props from ESPN**
```python
# BAD: ESPN deletes props after games complete
old_props = fetch_espn(f"/events/{old_game_id}/odds/58/propBets")  # Returns 404
```

✅ **Do query database for historical props**
```python
# GOOD: Historical props are in database
old_props = db.query("SELECT * FROM player_props WHERE game_id = ?", old_game_id)
```

---

❌ **Don't hardcode date filters that exclude current season**
```python
# BAD: Excludes 2025 games
query = "SELECT * FROM basic_events WHERE date < '2025-01-01'"
```

✅ **Do use dynamic date filtering or no filter**
```python
# GOOD: Query all completed games
query = "SELECT * FROM basic_events WHERE date < date('now')"
```

---

## When in Doubt

**Ask yourself:** *"Has this game been played yet?"*

- **Played** → Database
- **Not played** → ESPN API
- **Playing now** → ESPN API

This simple rule will guide 99% of data access decisions.

---

## Data Flow Diagram

```
┌─────────────────┐
│   ESPN API      │ (Live & Future Data)
│  - Live scores  │
│  - Upcoming     │
│  - Current odds │
└────────┬────────┘
         │
         │ Ingestion Scripts (scheduled)
         │ - fetch_upcoming_games_and_props.py
         │ - fetch_player_props.py
         ▼
┌─────────────────┐
│   Database      │ (Historical Data)
│  - Completed    │
│  - Past stats   │
│  - Historical   │
└────────┬────────┘
         │
         │ Backend API queries
         ▼
┌─────────────────┐
│   Frontend      │
│   Users         │
└─────────────────┘
```

---

## Summary

**Golden Rule:** Database = Past, ESPN API = Present/Future

This architecture ensures:
- Fast queries for historical analysis (database)
- Real-time data for live games (API)
- Proper data boundaries and responsibilities
- No confusion about data sources

When building features or fixing bugs, always start by asking: *"Is this historical or live/future data?"* The answer determines your data source.
