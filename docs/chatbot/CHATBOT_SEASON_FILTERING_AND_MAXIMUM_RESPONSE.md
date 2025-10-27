# ChatBot Season Filtering & Maximum Response Guidelines

## Overview
This document defines:
1. **Season filtering rules** - When to include/exclude preseason and playoffs
2. **Necessary maximum information** - What additional context to provide beyond the direct answer
3. **Response enrichment** - Proactive data to prevent follow-up questions

**Philosophy:** Don't give the bare minimum. Give the "necessary maximum" - everything the user would want to know without overwhelming them.

---

## Season Type Reference

### Database Values (`basic_events.event_season_type`)
- **1** = Preseason
- **2** = Regular Season
- **3** = Playoffs/Postseason

### Season Type Indicators (for responses)
- **(PRE)** = Preseason game
- **(REG)** = Regular season game
- **(PLY)** = Playoff game

---

## SEASON FILTERING RULES BY QUERY TYPE

### 1. TIME-BASED QUERIES (Literal Recency)

**Query Type:** "Last night", "last game", "most recent", "yesterday", "last 10 games", "this week"

**Filtering Rule:** **Include ALL game types** (preseason, regular season, playoffs)

**Rationale:** User is asking about chronological recency, not season quality. Show whatever games actually happened.

**Required Indicators:** MUST mark game type in response with (PRE), (REG), or (PLY)

**Examples:**
```
Q: "Show me Curry's last 10 games"
A: Include ALL recent games regardless of type, mark each with season indicator

Q: "Who won the Lakers game last night?"
A: Show the most recent game even if it's preseason, label it "(PRE) Lakers 116 - 102 Clippers"

Q: "Games this week"
A: All games from past 7 days, indicate which are preseason vs regular season
```

**SQL Pattern:**
```sql
-- NO season_type filter, just date ordering
WHERE athlete_id = 'X'
ORDER BY date DESC
LIMIT 10
```

---

### 2. SEASON AGGREGATE QUERIES

**Query Type:** "Season stats", "season average", "this season", "2025 season", "season leaders"

**Filtering Rule:** **Regular season ONLY** (exclude preseason and playoffs)

**Rationale:** Official NBA season statistics exclude preseason (exhibition) and separate playoffs

**Required Context:** State "Regular Season Stats" or "2024-25 Season"

**Examples:**
```
Q: "Curry season stats"
A: Regular season only, event_season_type = 2

Q: "Show me LeBron's stats this year"
A: Regular season 2025 only

Q: "Who has the best PPG this season?"
A: Regular season leaders only
```

**SQL Pattern:**
```sql
WHERE season = '2025'
AND event_season_type = 2  -- Regular season only
```

---

### 3. LEAGUE-WIDE QUERIES

**Query Type:** "League leaders", "who leads the NBA", "top scorers", "best players", "standings"

**Filtering Rule:** **Regular season ONLY, current season**

**Rationale:** Official NBA rankings and statistics

**Required Context:** Show current season year and "Regular Season"

**Examples:**
```
Q: "Who leads the league in scoring?"
A: Regular season 2025 leaders only

Q: "NBA standings"
A: Regular season records only

Q: "Top 10 rebounders"
A: Regular season stats only
```

**SQL Pattern:**
```sql
WHERE season = '2025'
AND event_season_type = 2
GROUP BY athlete_id
ORDER BY AVG(points) DESC
```

---

### 4. PLAYOFF-SPECIFIC QUERIES

**Query Type:** "Playoff stats", "postseason", "Finals", "playoff performance"

**Filtering Rule:** **Playoffs ONLY** (event_season_type = 3)

**Rationale:** Playoffs are tracked separately from regular season

**Required Context:** State "Playoff Stats" or "2025 Playoffs"

**Examples:**
```
Q: "Curry playoff stats"
A: Playoffs only, may be from multiple years if not specified

Q: "Who won the Finals last year?"
A: Playoff games only, Finals specifically

Q: "Best playoff performers this year"
A: Current season playoffs only
```

**SQL Pattern:**
```sql
WHERE event_season_type = 3  -- Playoffs only
AND season = '2025'
```

---

### 5. CAREER/HISTORICAL QUERIES

**Query Type:** "Career stats", "all-time", "lifetime", "career high"

**Filtering Rule:** **Regular season across ALL seasons** (exclude preseason, may include playoffs depending on context)

**Rationale:** Career statistics typically track regular season primarily

**Required Context:** Specify time range covered and whether playoffs are included

**Examples:**
```
Q: "LeBron career stats"
A: All regular seasons, optionally show playoff career separately

Q: "Career high"
A: Highest from any regular season or playoff game (mark which)
```

**SQL Pattern:**
```sql
WHERE event_season_type IN (1, 3)  -- Regular + Playoffs
-- Or separate queries for each
```

---

### 6. COMPARISON QUERIES

**Query Type:** "Player X vs Player Y", "compare", "who's better"

**Filtering Rule:** **Regular season current year** (default), can expand to career if relevant

**Rationale:** Fair comparison using official stats

**Required Context:** State comparison scope (this season vs career)

**Examples:**
```
Q: "Curry vs Luka"
A: Current regular season stats as primary comparison, career stats as additional context

Q: "Who's better this year?"
A: Regular season 2025 only
```

---

### 7. HEAD-TO-HEAD GAME QUERIES

**Query Type:** "Lakers vs Warriors history", "last 5 matchups", "season series"

**Filtering Rule:** Depends on scope
- "Season series" = Regular season current year
- "Last 5 games" = All recent games regardless of type
- "Playoff history" = Playoffs only

**Required Context:** Always show which games are included

**Examples:**
```
Q: "Lakers Warriors last 5 games"
A: Most recent 5 including preseason if recent

Q: "Lakers Warriors season series"
A: Current season regular season games only
```

---

## NECESSARY MAXIMUM INFORMATION

### Principle: "What Would They Ask Next?"

For each query, proactively include information that prevents common follow-up questions.

---

### GAME RESULT QUERIES

**User Asks:** "Who won Lakers Warriors?"

**Minimum Answer:** "Warriors won 119-109"

**NECESSARY MAXIMUM:**

1. **Primary Result:**
   - Final score: Warriors 119 - 109 Lakers
   - Date: October 21, 2025
   - Season type: (REG) if relevant

2. **Performance Context:**
   - Top 3-5 performers from EACH team with PTS/REB/AST
   - Notable performances (30+ pts, triple-double, career high)

3. **Team Stats:**
   - Shooting percentages (FG%, 3PT%, FT%)
   - Key differentiators (rebounds, turnovers, bench points)

4. **Series Context:**
   - Season series record: "Warriors lead series 2-1"
   - Next matchup: "Next game: Dec 25 at Lakers"

5. **Storylines (if applicable):**
   - "Luka's 43-point effort not enough"
   - "Warriors shoot 42.5% from three"

6. **Links:**
   - [View Full Game Stats](link)
   - [Warriors](team link) | [Lakers](team link)

---

### PLAYER GAMELOG QUERIES

**User Asks:** "Show me Curry's last 10 games"

**Minimum Answer:** Table with 10 games and basic stats

**NECESSARY MAXIMUM:**

1. **Comprehensive Table:**
   - 10-15 games (not just 10)
   - Columns: Date | Opp | Result | MIN | PTS | REB | AST | FG | 3PT | FT | +/-
   - Season type indicators: (PRE), (REG), (PLY)
   - Clickable dates (game links) and opponents (team links)

2. **Context Above Table:**
   - "Stephen Curry - Last 15 Games (Regular Season + Preseason)"
   - Current averages: "Season Average: 28.5 PPG, 6.2 RPG, 5.8 APG"

3. **Context Below Table:**
   - **Streaks:** "Currently on 3-game winning streak"
   - **Hot/Cold:** "6 of last 10 games with 25+ points"
   - **Notable Games:** "Season high: 43 points vs Lakers (Oct 21)"
   - **Injury Notes:** "Missed 2 games (Oct 5-7) - Rest"

4. **Comparison:**
   - "Averaging 26.8 PPG in last 10 (vs 28.5 season avg)"

5. **Next Game:**
   - "Next: vs Clippers, Oct 24 at 7:30 PM"

---

### SEASON STATS QUERIES

**User Asks:** "Curry season stats"

**Minimum Answer:** PPG, RPG, APG for current season

**NECESSARY MAXIMUM:**

1. **Complete Stat Line:**
   ```
   Stephen Curry - 2024-25 Regular Season
   Games: 8 | Minutes: 31.2 MPG
   Points: 28.5 PPG | Rebounds: 6.2 RPG | Assists: 5.8 APG
   Shooting: 47.2% FG | 41.8% 3PT | 91.2% FT
   Advanced: 2.1 STL | 0.5 BLK | 2.8 TO | +8.2 +/-
   ```

2. **League Context:**
   - "Ranks #3 in NBA in PPG"
   - "Ranks #2 in 3PT%"
   - "#1 in FT% among guards"

3. **Comparison to Career:**
   - "Shooting career-high 47.2% from field"
   - "On pace for 2,275 points (would be 4th best career season)"

4. **Recent Trend:**
   - "Last 5 games: 32.4 PPG (Up from season average)"
   - "Shooting 44.7% from three in last 5"

5. **Team Context:**
   - "Warriors are 6-2 this season"
   - "Team is 5-1 when Curry scores 25+"

6. **Availability:**
   - "Played in 8 of 8 games (100% availability)"

---

### LEAGUE LEADERS QUERIES

**User Asks:** "Who leads the league in scoring?"

**Minimum Answer:** Top 10 list with PPG

**NECESSARY MAXIMUM:**

1. **Extended Rankings:**
   - Show top 20 (not just 10)
   - More comprehensive view

2. **Rich Table:**
   ```
   | Rank | Player | Team | GP | PPG | FG% | 3PT% | Trend |
   ```
   - Include games played (context for averages)
   - Shooting efficiency
   - Trend indicator (↑ ↓ —)

3. **Notable Mentions:**
   - "Closest race: #1 and #2 separated by 0.3 PPG"
   - "Rising: Player X up from #15 to #8 this month"
   - "Notable: Player Y despite missing 3 games"

4. **Context:**
   - "As of October 22, 2025 (8 games played)"
   - "Regular Season 2024-25"

5. **Related Leaders:**
   - "See also: [Rebounds Leaders] [Assists Leaders] [Efficiency Leaders]"

6. **Filtering Options:**
   - "Qualified players: 70% games played minimum"

---

### PLAYER COMPARISON QUERIES

**User Asks:** "Curry vs Luka"

**Minimum Answer:** Side-by-side stats table

**NECESSARY MAXIMUM:**

1. **Current Season Stats:**
   ```
   | Stat | Stephen Curry | Luka Doncic |
   |------|--------------|-------------|
   | PPG  | 28.5         | 32.1        |
   | RPG  | 6.2          | 9.8         |
   | AST  | 5.8          | 8.4         |
   | FG%  | 47.2%        | 48.9%       |
   | 3PT% | 41.8%        | 38.2%       |
   | PER  | 24.8         | 28.3        |
   ```

2. **Career Comparison:**
   - Career PPG, major achievements
   - All-Star appearances, MVPs

3. **Head-to-Head Games:**
   ```
   When Curry vs Luka (last 5 matchups):
   | Date | Result | Curry | Luka | Winner |
   ```

4. **Advanced Metrics:**
   - Usage rate, True Shooting %, PER, Win Shares
   - Efficiency comparison

5. **Team Context:**
   - Warriors record: 6-2
   - Lakers record: 4-4
   - Team success rates

6. **Age/Experience:**
   - Curry: 36 years, 15th season
   - Luka: 25 years, 6th season
   - Context for comparison

7. **Recent Form:**
   - Last 5 games comparison
   - Who's hot/cold right now

---

### TEAM QUERIES

**User Asks:** "How are the Lakers doing?"

**Minimum Answer:** "Lakers are 4-4"

**NECESSARY MAXIMUM:**

1. **Record & Standing:**
   - Record: 4-4 (0.500)
   - Conference rank: 8th in West
   - Games behind leader: 3.5 GB
   - Playoff position: Currently 8th seed

2. **Recent Form:**
   - Last 5 games: 3-2
   - Last 10 games: 5-5
   - Current streak: Won 2

3. **Team Stats:**
   ```
   | Stat | Lakers | Rank |
   |------|--------|------|
   | PPG  | 112.5  | 12th |
   | Opp  | 108.8  | 15th |
   | Diff | +3.7   | 11th |
   | FG%  | 46.2%  | 8th  |
   ```

4. **Top Performers:**
   - Leading scorer: Luka Doncic (32.1 PPG)
   - Leading rebounder: Deandre Ayton (9.2 RPG)
   - Leading assists: Austin Reaves (6.8 APG)

5. **Schedule Context:**
   - Next 3 games: vs GSW, @ PHX, vs LAC
   - Recent: 2-1 on homestand
   - Upcoming: 4-game road trip

6. **Injury Report:**
   - Healthy: All players available
   - Or: OUT: Player X (ankle), DTD: Player Y

7. **Notable:**
   - "Won 5 straight home games"
   - "0-3 on back-to-backs"
   - "Luka averaging 35+ in last 5"

---

### PREDICTION QUERIES

**User Asks:** "Who will win Lakers Warriors tomorrow?"

**Minimum Answer:** "Warriors favored"

**NECESSARY MAXIMUM:**

1. **Prediction:**
   - Predicted winner: Warriors
   - Confidence: 67%
   - Projected score: Warriors 118 - Lakers 112

2. **Betting Odds:**
   ```
   Spread: Warriors -4.5
   Moneyline: Warriors -180 / Lakers +150
   Over/Under: 225.5
   ```

3. **Key Factors:**
   - Warriors: 5-1 at home this season
   - Lakers: 1-3 on road
   - Head-to-head: Warriors won last 2
   - Rest advantage: Both teams on 2 days rest

4. **Player Props:**
   - Curry O/U: 28.5 points
   - Luka O/U: 31.5 points
   - [View all props]

5. **Injury Impact:**
   - Warriors: All players probable
   - Lakers: Player X questionable

6. **Historical Context:**
   - Warriors are 8-2 vs Lakers last 10 games
   - Average margin: Warriors by 6.8

7. **Expert Pick:**
   - "Take Warriors to cover -4.5"
   - "Lean Over 225.5 in shootout"

---

### PLAYER PROPS QUERIES

**User Asks:** "Will Curry score over 30 tonight?"

**Minimum Answer:** "Line is 28.5, he's averaging 28.5"

**NECESSARY MAXIMUM:**

1. **Prop Line:**
   - Over/Under: 28.5 points
   - Odds: Over -110 / Under -110

2. **Recent Performance:**
   - Last 5 games vs opponent: 32.4 PPG average
   - Last 10 games overall: 30.2 PPG
   - Season average: 28.5 PPG

3. **Hit Rate:**
   - Has scored 30+ in 4 of last 10 games (40%)
   - Has scored 30+ in 3 of last 5 vs this opponent (60%)

4. **Matchup Analysis:**
   - Opponent allows 29.8 PPG to guards (18th in NBA)
   - Opponent's perimeter defense: Below average
   - Pace of game: Fast (favors scoring)

5. **Other Props:**
   ```
   Curry Props Tonight:
   - Points: O/U 28.5
   - Rebounds: O/U 5.5
   - Assists: O/U 6.5
   - Threes: O/U 4.5
   ```

6. **Recommendation:**
   - "LEAN: Over 28.5 points"
   - "Reasoning: Curry averaging 32+ vs this opponent, Warriors at home"

7. **Context:**
   - Minutes expectation: 32-34 (normal)
   - Injury status: Healthy
   - Rest: 2 days since last game

---

## PROACTIVE CONTEXT ADDITIONS

### Always Include When Relevant:

1. **Season Type Indicators**
   - (PRE), (REG), (PLY) for any game data
   - "Regular Season 2024-25" for aggregates

2. **Hyperlinks**
   - Player names → player profiles
   - Team names → team pages
   - Dates → game detail pages
   - "View more" → expanded views

3. **Current Date Context**
   - "As of October 22, 2025"
   - "Through 8 games"
   - "Updated daily"

4. **Comparison Baselines**
   - vs season average
   - vs league average
   - vs opponent average
   - vs career average

5. **Next Game Info**
   - Opponent, date, time
   - TV broadcast if available
   - Betting line if available

6. **Streak Information**
   - Win/loss streaks
   - Performance streaks (5 straight 30+ pt games)
   - Shooting streaks (4 straight games over 50% FG)

7. **Milestones & Notable**
   - Approaching milestones (98 away from 1,000 threes)
   - Recent achievements (career high last game)
   - Historical context (best start since 2016)

8. **Injury/Availability**
   - Current status for players
   - Games missed
   - Expected return

---

## RESPONSE FORMATTING STANDARDS

### Tables Get:
- Season type column when mixing types: `Type` column with (PRE)/(REG)/(PLY)
- Links in Date and Opponent columns
- Comparison columns when relevant
- Mobile-responsive design

### Context Sections:
- **Bold** for emphasis on key numbers
- Bullet points for lists
- Short paragraphs (2-3 lines max)
- Clear section headers

### Example Enhanced Gamelog:
```markdown
## Stephen Curry - Last 15 Games
*Season Average: 28.5 PPG, 6.2 RPG, 5.8 APG | Warriors: 6-2*

| Type | Date | Opp | Result | MIN | PTS | REB | AST | FG | 3PT | FT | +/- |
|------|------|-----|--------|-----|-----|-----|-----|----|-----|-----|-----|
| (REG) | [Oct 21](link) | [LAL](link) | W 119-109 | 32 | 23 | 1 | 4 | 6-14 | 3-9 | 8-8 | +1 |
| (REG) | [Oct 19](link) | [LAC](link) | W 116-102 | 30 | 28 | 4 | 5 | 10-18 | 4-8 | 4-4 | +12 |
...

**Recent Trends:**
- **Hot Streak:** 6 of last 10 games with 25+ points
- Averaging 30.2 PPG in last 10 games (↑ from 28.5 season avg)
- Shooting 44.7% from three in last 5 games

**Notable Games:**
- **Season High:** 43 points vs Suns (Oct 14) [View Game](link)
- **Efficient:** 10-15 FG, 6-8 3PT vs Clippers (Oct 19)

**Next Game:** vs Clippers, Oct 24 at 7:30 PM PST
```

---

## SQL PATTERNS FOR SEASON FILTERING

### Time-Based (No Season Filter):
```sql
SELECT pb.*, be.date, be.event_season_type
FROM player_boxscores pb
JOIN basic_events be ON pb.game_id = be.event_id
WHERE pb.athlete_id = 'CURRY_ID'
ORDER BY be.date DESC
LIMIT 15
```

### Regular Season Only:
```sql
WHERE be.event_season_type = 2  -- Regular season
AND be.season = '2025'          -- Current season
```

### Season Aggregates:
```sql
SELECT
  AVG(pb.points) as ppg,
  AVG(pb.rebounds) as rpg,
  COUNT(*) as games
FROM player_boxscores pb
JOIN basic_events be ON pb.game_id = be.event_id
WHERE pb.athlete_id = 'CURRY_ID'
AND be.season = '2025'
AND be.event_season_type = 2  -- Regular season only
```

### Playoffs Only:
```sql
WHERE be.event_season_type = 3  -- Playoffs
AND be.season = '2025'
```

---

## IMPLEMENTATION CHECKLIST

### System Prompt Updates Needed:
- [ ] Add season type filtering rules for each query category
- [ ] Add season type indicator requirements (PRE/REG/PLY)
- [ ] Add "necessary maximum" context requirements
- [ ] Add streak calculation instructions
- [ ] Add comparison baseline requirements
- [ ] Add next game inclusion rules
- [ ] Add milestone detection logic
- [ ] Add series record instructions (head-to-head)

### Database Query Enhancements:
- [ ] Include event_season_type in all game queries
- [ ] Add season type to response formatting
- [ ] Calculate streaks from game results
- [ ] Join to get next scheduled game
- [ ] Calculate season series records
- [ ] Aggregate for trend analysis

### Response Format Updates:
- [ ] Add Type column to gamelog tables
- [ ] Add "Season Average" context line
- [ ] Add "Recent Trends" section
- [ ] Add "Next Game" footer
- [ ] Add "Notable" callouts
- [ ] Add season series context to game results

---

## EXAMPLES: BEFORE vs AFTER

### Example 1: Gamelog Query

**BEFORE (Minimum):**
```
| Date | Opp | PTS | REB | AST |
|------|-----|-----|-----|-----|
| Oct 21 | LAL | 23 | 1 | 4 |
| Oct 19 | LAC | 28 | 4 | 5 |
```

**AFTER (Necessary Maximum):**
```
## Stephen Curry - Last 15 Games
*Season Average: 28.5 PPG | Warriors: 6-2 | Currently on 2-game win streak*

| Type | Date | Opp | Result | MIN | PTS | REB | AST | FG | 3PT | FT | +/- |
|------|------|-----|--------|-----|-----|-----|-----|----|-----|-----|-----|
| (REG) | [Oct 21](link) | [LAL](link) | W 119-109 | 32 | 23 | 1 | 4 | 6-14 | 3-9 | 8-8 | +1 |
| (REG) | [Oct 19](link) | [LAC](link) | W 116-102 | 30 | 28 | 4 | 5 | 10-18 | 4-8 | 4-4 | +12 |
| (PRE) | [Oct 14](link) | [POR](link) | W 118-111 | 27 | 28 | 6 | 5 | 6-15 | 4-11 | 12-13 | +13 |
...

**Recent Trends:**
- Averaging 30.2 PPG in last 10 (↑ from 28.5 season avg)
- 6 of last 10 games with 25+ points
- Shooting 44.7% from three in last 5 games

**Season High:** 43 points vs Suns (Oct 14)

**Next Game:** vs Clippers, Oct 24 at 7:30 PM
```

---

### Example 2: Game Result Query

**BEFORE (Minimum):**
```
Warriors won 119-109
```

**AFTER (Necessary Maximum):**
```
## Warriors 119 - 109 Lakers
*October 21, 2025 (Regular Season) | Warriors lead season series 2-1*

**Golden State Warriors**
| Player | PTS | REB | AST | FG | 3PT | +/- |
|--------|-----|-----|-----|----|-----|-----|
| [Jimmy Butler](link) | 31 | 5 | 4 | 10-15 | 3-6 | +8 |
| [Stephen Curry](link) | 23 | 1 | 4 | 6-14 | 3-9 | +1 |
| [Jonathan Kuminga](link) | 17 | 9 | 6 | 8-12 | 1-3 | +12 |

**Los Angeles Lakers**
| Player | PTS | REB | AST | FG | 3PT | +/- |
|--------|-----|-----|-----|----|-----|-----|
| [Luka Doncic](link) | 43 | 12 | 9 | 17-31 | 4-10 | -8 |
| [Austin Reaves](link) | 26 | 5 | 9 | 10-18 | 3-7 | -5 |
| [Deandre Ayton](link) | 10 | 6 | 0 | 4-8 | 0-0 | -12 |

**Team Stats**
| Stat | Warriors | Lakers |
|------|----------|--------|
| FG% | 48.7% | 54.5% |
| 3PT% | 42.5% | 25.0% |
| FT% | 89.7% | 60.7% |
| REB | 40 | 39 |

**Key Storylines:**
- Luka Doncic's 43-point near triple-double not enough for Lakers
- Warriors shot exceptionally well from three (42.5%)
- Warriors improve to 6-2, Lakers fall to 4-4

**Next Matchup:** December 25 @ Lakers, 5:00 PM PST

[View Full Game Stats](link)
```

---

## KEY TAKEAWAYS

1. **Season Filtering is Query-Dependent:**
   - Time-based queries: ALL game types (mark with indicators)
   - Season stats: Regular season ONLY
   - League rankings: Regular season ONLY
   - Playoffs: Separate tracking

2. **Necessary Maximum = Prevent Follow-Ups:**
   - Include context they'd ask about next
   - Comparisons, trends, next game, series records
   - Enriched but not overwhelming

3. **Always Indicate Season Type:**
   - (PRE), (REG), (PLY) markers
   - State scope clearly: "Regular Season 2024-25"

4. **Proactive Context:**
   - Streaks, milestones, rankings
   - Recent form vs season average
   - Team success when player performs well

5. **Rich Linking:**
   - Make everything clickable
   - Easy navigation to related info

---

**Document Version:** 1.0
**Last Updated:** 2025-10-22
**Related:** CHATBOT_QUERY_PLANNING.md
