# Comprehensive Gamelog Design

## Vision: Ultra-Detailed, Filterable Gamelog

### **Core Philosophy**
Return ALL available data and metadata, enable powerful filtering both server-side and client-side.

---

## Available Stats

### **Scoring**
- Points (PTS)
- Field Goals Made/Attempted (FGM-FGA)
- 3-Point Field Goals Made/Attempted (3PM-3PA)
- Free Throws Made/Attempted (FTM-FTA)
- Field Goal % (FG%)
- 3-Point % (3P%)
- Free Throw % (FT%)

### **Rebounding**
- Total Rebounds (REB)
- Offensive Rebounds (OREB)
- Defensive Rebounds (DREB)

### **Playmaking**
- Assists (AST)
- Turnovers (TO)
- Assist/Turnover Ratio (AST/TO)

### **Defense**
- Steals (STL)
- Blocks (BLK)
- Personal Fouls (PF)

### **Impact**
- Plus/Minus (+/-)
- Minutes (MIN)

### **Context**
- Home/Away indicator (🏠 / ✈️)
- Starter status (⭐ / bench)
- Game Result (W/L with score)
- Opponent
- Date
- Season Type (PRE/REG/PLY)

---

## Table Design Options

### **Option 1: Compact View (Default)**
Best for mobile and quick overview.

| H/A | Date | Opp | Result | MIN | PTS | REB | AST | STL | BLK | FG | 3PT | FT | +/- |
|-----|------|-----|--------|-----|-----|-----|-----|-----|-----|----|----|----|----|

### **Option 2: Detailed View**
Full stats breakdown.

| H/A | Date | Opp | Result | MIN | PTS | FGM-A | FG% | 3PM-A | 3P% | FTM-A | FT% | REB | OREB | DREB | AST | STL | BLK | TO | PF | +/- |
|-----|------|-----|--------|-----|-----|-------|-----|-------|-----|-------|-----|-----|------|------|-----|-----|-----|----|----|-----|

### **Option 3: Per-36 Adjusted**
Stats normalized to 36 minutes.

| Date | Opp | MIN | PTS/36 | REB/36 | AST/36 | STL/36 | BLK/36 | +/- |
|------|-----|-----|--------|--------|--------|--------|--------|-----|

---

## Filtering Architecture

### **Server-Side Filters** (Fast, via API params)
These reduce the dataset before returning to client.

```python
GET /api/gamelogs/players/{name}/gamelog?
  opponent=lakers          # Filter by opponent
  &min_minutes=20          # Minimum minutes played
  &starters_only=true      # Only games where player started
  &home_away=home          # home/away/both
  &season_type=2           # 1=PRE, 2=REG, 3=PLY
  &result=W                # W/L/both
  &limit=50                # Max games to return
  &date_from=2024-10-01    # Date range
  &date_to=2024-12-31
```

### **Client-Side Filters** (Instant, in ChatBot/React)
Applied after data is returned.

**Interactive Controls:**
```
┌─────────────────────────────────────────────────────────┐
│ Filters:                                                 │
│                                                          │
│ Games:     [Last 10 ▼] [15] [20] [30] [All]            │
│ Location:  [⚪ All] [🏠 Home] [✈️ Away]                  │
│ Starter:   [⚪ All] [⭐ Started] [Bench]                 │
│ Minutes:   [────●────────] 20+ min                      │
│ Result:    [⚪ All] [W Wins] [L Losses]                 │
│ Opponent:  [Select Team ▼]                              │
│ Date:      [Oct 1 ─●─ Dec 31]                           │
│                                                          │
│ [Reset Filters] [Apply]                                 │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### **Phase 1: Expand Backend Data** ✅
1. Update `GamelogEntry` model to include all stats
2. Update SQL query to fetch all available columns
3. Add server-side filter parameters
4. Return richer metadata

### **Phase 2: Enhanced Markdown Response**
1. Add home/away indicators
2. Add starter indicators
3. Expand table columns
4. Add summary stats below table

### **Phase 3: React Gamelog Component** (Future)
For true interactive filtering:
1. Create `/gamelog/{player}` page
2. Fetch all games (50-100)
3. Client-side filtering with instant updates
4. Sortable columns
5. Export to CSV
6. Compare multiple gamelogs

---

## Enhanced Data Model

```python
class GamelogEntry(BaseModel):
    # Identifiers
    game_id: str
    date: str
    season_type: int  # 1=PRE, 2=REG, 3=PLY

    # Context
    opponent_id: str
    opponent_name: str
    opponent_logo: str
    is_home: bool
    is_starter: bool

    # Score
    home_score: Optional[int]
    away_score: Optional[int]
    result: str  # "W 119-109" or "L 109-119"

    # Basic Stats
    minutes: str
    points: int
    rebounds: int
    assists: int

    # Shooting
    fg_made: int
    fg_attempted: int
    fg_pct: Optional[float]
    three_made: int
    three_attempted: int
    three_pct: Optional[float]
    ft_made: int
    ft_attempted: int
    ft_pct: Optional[float]

    # Rebounding
    offensive_rebounds: int
    defensive_rebounds: int

    # Defense/Playmaking
    steals: int
    blocks: int
    turnovers: int
    fouls: int

    # Impact
    plus_minus: int
```

---

## Query Enhancements

### **Current Query:**
Returns: player info + 15 games + basic stats

### **Enhanced Query:**
```sql
SELECT DISTINCT
    -- Player info
    a.athlete_display_name, a.athlete_headshot,
    COALESCE(r.athlete_position, 'G') as athlete_position,
    a.athlete_jersey,
    pt.team_display_name as player_team,
    pt.team_logo as player_team_logo,

    -- Season averages
    ss.avg_pts, ss.avg_reb, ss.avg_ast,

    -- Game context
    pb.game_id, be.date, be.event_season_type,
    pb.team_id, pb.athlete_starter,
    CASE WHEN tb.home_team_id = pb.team_id THEN 1 ELSE 0 END as is_home,

    -- Opponent
    CASE WHEN tb.home_team_id = pb.team_id THEN tb.away_team_id ELSE tb.home_team_id END as opp_id,
    CASE WHEN tb.home_team_id = pb.team_id THEN tb.away_team_name ELSE tb.home_team_name END as opp_name,
    ot.team_logo as opp_logo,

    -- Scores
    tb.home_score, tb.away_score,

    -- All Stats (NEW!)
    pb.minutes,
    pb.points, pb.rebounds, pb.assists,
    pb.offensiveRebounds, pb.defensiveRebounds,
    pb.steals, pb.blocks, pb.turnovers, pb.fouls,
    pb.fieldGoalsMade_fieldGoalsAttempted as fg,
    pb.threePointFieldGoalsMade_threePointFieldGoalsAttempted as thr,
    pb.freeThrowsMade_freeThrowsAttempted as ft,
    pb.plusMinus

FROM player_boxscores pb
-- [existing joins]
WHERE a.athlete_display_name LIKE :player_search
AND pb.athlete_didNotPlay IS NOT 1

-- NEW FILTERS
AND (:min_minutes IS NULL OR CAST(pb.minutes AS INTEGER) >= :min_minutes)
AND (:starters_only IS NULL OR pb.athlete_starter = 1)
AND (:home_away IS NULL OR
     (:home_away = 'home' AND tb.home_team_id = pb.team_id) OR
     (:home_away = 'away' AND tb.away_team_id = pb.team_id))
AND (:season_type IS NULL OR be.event_season_type = :season_type)

ORDER BY be.date DESC
LIMIT :limit
```

---

## Markdown Enhancements

### **Current:**
| Type | Date | Opp | Result | MIN | PTS | REB | AST | FG | 3PT | FT | +/- |

### **Enhanced - Compact:**
| H/A | Date | Opp | Result | MIN | PTS | REB | AST | STL | BLK | FG% | 3P% | +/- |
|-----|------|-----|--------|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| 🏠⭐ | Oct 21 | LAL | W 119-109 | 32 | 28 | 5 | 4 | 2 | 1 | 55.6% | 37.5% | +12 |

Legend:
- 🏠 = Home, ✈️ = Away
- ⭐ = Started, (blank) = Bench

### **Enhanced - Detailed:**
| H/A | Date | Opp | Result | MIN | PTS | FGM-A | FG% | 3PM-A | 3P% | FTM-A | FT% | REB | OREB | DREB | AST | STL | BLK | TO | PF | +/- |
|-----|------|-----|--------|-----|-----|-------|-----|-------|-----|-------|-----|-----|------|------|-----|-----|-----|----|----|-----|
| 🏠⭐ | Oct 21 | LAL | W 119-109 | 32 | 28 | 10-18 | 55.6 | 3-8 | 37.5 | 5-5 | 100 | 5 | 1 | 4 | 4 | 2 | 1 | 2 | 3 | +12 |

### **Summary Stats Below Table:**
```markdown
**Performance Summary:**
- Games: 15 (Started: 12, Bench: 3)
- Home: 8-2 (30.5 PPG), Away: 3-4 (26.8 PPG)
- 20+ PTS: 10 games (66.7%)
- Double-Doubles: 3 (PTS-REB)
- Best Game: 43 PTS vs LAL (Oct 21)
- Shooting: 47.2% FG, 38.9% 3PT, 85.4% FT
```

---

## API Query Examples

### **Basic:**
```
GET /api/gamelogs/players/Luka Doncic/gamelog
```

### **Home Games Only:**
```
GET /api/gamelogs/players/Luka Doncic/gamelog?home_away=home
```

### **Started with 25+ minutes:**
```
GET /api/gamelogs/players/Luka Doncic/gamelog?starters_only=true&min_minutes=25
```

### **Regular Season vs Lakers:**
```
GET /api/gamelogs/players/Luka Doncic/gamelog?opponent=lakers&season_type=2
```

### **Playoff games:**
```
GET /api/gamelogs/players/Luka Doncic/gamelog?season_type=3&limit=30
```

---

## ChatBot Query Parsing

Detect advanced filters in natural language:

### **Current:**
- ✅ "luka gamelog"
- ✅ "luka vs lakers"
- ✅ "luka last 10 games"

### **New:**
- ✅ "luka home games"
- ✅ "luka games as a starter"
- ✅ "luka games with 25+ minutes"
- ✅ "luka playoff games"
- ✅ "luka road games vs warriors"
- ✅ "luka games this month"

Parse patterns:
- `home|road|away` → home_away filter
- `starter|starting` → starters_only=true
- `\d+\+? minutes` → min_minutes filter
- `playoff|postseason` → season_type=3
- `preseason` → season_type=1
- `this month|last week` → date range

---

## Implementation Priority

### **Immediate (Phase 1):**
1. ✅ Add STL, BLK, TO, PF, OREB, DREB to query
2. ✅ Add home/away indicator
3. ✅ Add starter indicator
4. ✅ Add server-side filters (home_away, min_minutes, starters_only, season_type)
5. ✅ Update markdown formatter

### **Soon (Phase 2):**
6. Parse advanced filters from natural language
7. Add shooting percentages
8. Add summary stats below table
9. Add "view options" (compact/detailed/per-36)

### **Future (Phase 3):**
10. React component with interactive filters
11. Sortable columns
12. Export to CSV
13. Compare multiple players
14. Visualizations (shot charts, trend graphs)

---

## Mobile Considerations

### **Responsive Table:**
- Horizontal scroll on mobile
- Sticky first column (Date/Opp)
- Reduced font size
- Collapsible columns

### **Compact Mode Auto:**
```javascript
if (window.innerWidth < 768) {
  // Show compact table (fewer columns)
} else {
  // Show detailed table
}
```

---

**Document Version:** 1.0
**Last Updated:** 2025-10-22
**Status:** 📋 Design Document
