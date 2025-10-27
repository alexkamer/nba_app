# ChatBot Query Planning & User Intent Mapping

## Overview
This document catalogs the types of questions NBA fans will ask the ChatBot, organized by category with expected data requirements and response formats.

---

## 1. GAME QUERIES

### 1.1 Recent Game Results
**User Intent:** Find out who won and how the game played out

**Example Queries:**
- "Who won the Lakers game last night?"
- "Did the Warriors win?"
- "What was the score in the Lakers Warriors game?"
- "Show me the Lakers last game"
- "How did the Celtics do yesterday?"

**Expected Response:**
- Final score with winner highlighted
- Date/time of game
- Top 3-5 performers from each team (PTS/REB/AST)
- Key team stats (FG%, 3PT%, FT%)
- Clickable links to game details and team pages

**Data Required:**
- `team_boxscores` (game_id, scores, team stats)
- `basic_events` (date, teams)
- `player_boxscores` (top performers)
- `athletes` (player names)

**Priority:** 🔴 CRITICAL - Most common query type

---

### 1.2 Specific Game Deep Dive
**User Intent:** Detailed breakdown of a particular game

**Example Queries:**
- "Show me full stats from Lakers vs Warriors Oct 21"
- "What happened in the Lakers game?"
- "Game recap Lakers Warriors"
- "Box score for last Lakers game"

**Expected Response:**
- Complete box score for both teams
- Quarter-by-quarter scoring
- Full player stats for both teams
- Game flow analysis (largest lead, runs)
- Play-by-play highlights

**Data Required:**
- `team_boxscores` (full stats)
- `player_boxscores` (all players)
- `play_by_play` (key plays, runs)

**Priority:** 🟡 HIGH

---

### 1.3 Head-to-Head History
**User Intent:** Compare two teams' recent matchups

**Example Queries:**
- "Lakers vs Warriors last 5 games"
- "Who usually wins Lakers Warriors games?"
- "Head to head Warriors Lakers"
- "Lakers Warriors season series"

**Expected Response:**
- Table of recent matchups with scores
- Win-loss record between teams
- Average stats in matchups
- Notable performances

**Data Required:**
- `team_boxscores` filtered by both teams
- `basic_events` for dates
- `player_boxscores` for standout performances

**Priority:** 🟡 HIGH

---

## 2. PLAYER QUERIES

### 2.1 Player Game Performance
**User Intent:** How did a specific player do in a game?

**Example Queries:**
- "How did LeBron do last night?"
- "Curry stats last game"
- "Did Luka play well?"
- "How many points did Giannis score?"
- "Show me Jokic's stats"

**Expected Response:**
- Full stat line: MIN, PTS, REB, AST, FG, 3PT, FT, +/-
- Comparison to player's season average
- Notable achievements (30+ pts, double-double, triple-double)
- Game context (W/L, opponent)

**Data Required:**
- `player_boxscores` (player stats)
- `athletes` (player name)
- `team_boxscores` (game result)
- `player_season_stats` (averages for comparison)

**Priority:** 🔴 CRITICAL

---

### 2.2 Player Gamelog
**User Intent:** Show a player's performance over multiple games

**Example Queries:**
- "Luka Doncic last 10 games"
- "Show me Curry's gamelog"
- "How has LeBron been playing lately?"
- "Giannis recent games"
- "Stephen Curry stats this week"

**Expected Response:**
- Table with 10-15 recent games
- Columns: Date (link to game), Opp (link to team), Result, MIN, PTS, REB, AST, FG, 3PT, FT, +/-
- Clickable rows/dates for game details
- Shooting stats in "made-attempted" format
- Mobile-responsive design

**Data Required:**
- `player_boxscores` (multiple games)
- `basic_events` (dates)
- `team_boxscores` (game results, opponents)
- `athletes` (player name)

**Priority:** 🔴 CRITICAL - Already implemented

---

### 2.3 Season Stats & Averages
**User Intent:** Overall performance this season

**Example Queries:**
- "Luka Doncic season stats"
- "How is Curry doing this year?"
- "LeBron averages this season"
- "Show me Tatum's stats"

**Expected Response:**
- Season averages: PPG, RPG, APG, FG%, 3P%, FT%
- Total games played
- Shooting splits
- League ranking in key categories
- Trend analysis (improving/declining)

**Data Required:**
- `player_season_stats` or aggregate `player_boxscores`
- League rankings (aggregate all players)

**Priority:** 🟡 HIGH

---

### 2.4 Player Comparisons
**User Intent:** Compare two or more players

**Example Queries:**
- "Luka vs Curry"
- "Who's better LeBron or Giannis?"
- "Compare Tatum and Brown"
- "Jokic vs Embiid stats"

**Expected Response:**
- Side-by-side comparison table
- Key stats: PPG, RPG, APG, FG%, 3P%, PER, +/-
- Advanced metrics if available
- Season records, efficiency ratings

**Data Required:**
- `player_season_stats` for multiple players
- `team_boxscores` for team context

**Priority:** 🟡 HIGH

---

### 2.5 Career/Historical Stats
**User Intent:** Long-term performance

**Example Queries:**
- "LeBron career stats"
- "Curry all-time threes"
- "Has LeBron scored 40,000 points?"
- "Luka career high"

**Expected Response:**
- Career totals and averages
- Notable milestones
- Career highs
- Historical context

**Data Required:**
- Historical data across seasons (may not be in current DB)
- Career aggregates

**Priority:** 🟢 MEDIUM - Requires historical data

---

## 3. TEAM QUERIES

### 3.1 Team Performance
**User Intent:** How is a team doing?

**Example Queries:**
- "How are the Lakers doing?"
- "Warriors record this season"
- "Are the Celtics good this year?"
- "Show me the Heat stats"

**Expected Response:**
- Win-loss record
- Recent form (last 5-10 games)
- Team averages (PPG, Opp PPG, etc.)
- Current standing/ranking
- Top performers on team

**Data Required:**
- `team_boxscores` (aggregate)
- `basic_events` (W/L record)
- `player_boxscores` (top players)

**Priority:** 🟡 HIGH

---

### 3.2 Team Schedule
**User Intent:** Upcoming or past games

**Example Queries:**
- "When do the Lakers play next?"
- "Lakers schedule this week"
- "Who are the Warriors playing?"
- "Show me Celtics upcoming games"

**Expected Response:**
- List of upcoming games with dates, opponents, times
- Recent past games for context
- Win-loss predictions if available

**Data Required:**
- `basic_events` filtered by team, future dates
- `predictions` table for projections

**Priority:** 🟡 HIGH

---

### 3.3 Team Stats Leaders
**User Intent:** Who leads the team in various categories?

**Example Queries:**
- "Who's the Lakers leading scorer?"
- "Warriors best defender"
- "Most assists on the Celtics"
- "Lakers top rebounder"

**Expected Response:**
- Table of team leaders in PPG, RPG, APG, FG%, etc.
- Stats for each leader
- Links to player profiles

**Data Required:**
- `player_boxscores` aggregated by team
- `athletes` for names
- `rosters` for current team

**Priority:** 🟡 HIGH

---

## 4. LEAGUE-WIDE QUERIES

### 4.1 League Leaders
**User Intent:** Who's the best in the league?

**Example Queries:**
- "Who leads the league in scoring?"
- "Top 10 scorers NBA"
- "Best rebounders this season"
- "Most assists in the league"
- "Who has the most triple doubles?"

**Expected Response:**
- Table of top 10-20 players in category
- Stats with player names (linked)
- Team affiliation
- Rank numbers

**Data Required:**
- `player_season_stats` or aggregate `player_boxscores`
- Sorted by desired stat
- `athletes` for names

**Priority:** 🟡 HIGH

---

### 4.2 Standings & Rankings
**User Intent:** Team rankings

**Example Queries:**
- "NBA standings"
- "Who's first in the West?"
- "Top 5 teams in the league"
- "Playoff standings"

**Expected Response:**
- Table of teams with W-L records
- Conference breakdown
- Games behind leader
- Playoff positioning

**Data Required:**
- Aggregate `basic_events` for W-L records
- Conference/division from `teams`

**Priority:** 🟡 HIGH

---

### 4.3 Trending Players/Storylines
**User Intent:** What's hot in the NBA?

**Example Queries:**
- "Who's playing well this week?"
- "Hot players right now"
- "Best performances this month"
- "Who's on a hot streak?"

**Expected Response:**
- List of players with exceptional recent performance
- Key stats from recent games
- Context (winning streak, career highs, etc.)

**Data Required:**
- Recent `player_boxscores` (last 7-14 days)
- Identify outliers/exceptional performances

**Priority:** 🟢 MEDIUM

---

## 5. PREDICTIONS & BETTING

### 5.1 Game Predictions
**User Intent:** Who will win an upcoming game?

**Example Queries:**
- "Who will win Lakers Warriors tomorrow?"
- "Predictions for tonight's games"
- "Should I bet on the Celtics?"
- "What's the spread on Lakers game?"

**Expected Response:**
- Prediction with probability
- Key factors (home/away, recent form, injuries)
- Betting odds if available
- Historical matchup context

**Data Required:**
- `predictions` table
- `game_odds` table
- `basic_events` for upcoming games

**Priority:** 🟡 HIGH - We have predictions table!

---

### 5.2 Player Props
**User Intent:** Player performance betting

**Example Queries:**
- "Will Luka score over 30 tonight?"
- "Curry points prop"
- "Player props for tonight's game"
- "Betting odds for LeBron points"

**Expected Response:**
- Player prop lines (over/under)
- Recent performance context
- Matchup analysis
- Recommendation

**Data Required:**
- `player_props` table
- Recent `player_boxscores` for context

**Priority:** 🟡 HIGH - We have player_props table!

---

### 5.3 Betting Odds
**User Intent:** Current betting lines

**Example Queries:**
- "Odds for tonight's games"
- "Lakers Warriors spread"
- "Over under for Celtics game"
- "Moneyline odds"

**Expected Response:**
- Table of odds (spread, moneyline, over/under)
- Movement/changes in odds
- Public betting percentages if available

**Data Required:**
- `game_odds` table

**Priority:** 🟡 HIGH - We have game_odds table!

---

## 6. ADVANCED ANALYTICS

### 6.1 Efficiency & Advanced Metrics
**User Intent:** Deep statistical analysis

**Example Queries:**
- "Who has the best PER?"
- "True shooting percentage leaders"
- "Most efficient scorers"
- "Best defensive rating"
- "Usage rate leaders"

**Expected Response:**
- Table with advanced metrics
- Explanation of what the stat means
- Context for interpretation

**Data Required:**
- Calculate from `player_boxscores` or `team_boxscores`
- May need formulas for advanced stats

**Priority:** 🟢 MEDIUM - Nice to have

---

### 6.2 Shooting Splits
**User Intent:** Detailed shooting analysis

**Example Queries:**
- "Curry shooting splits"
- "LeBron 3-point percentage by game"
- "Home vs away shooting"
- "Clutch shooting stats"

**Expected Response:**
- Table breaking down FG%, 3P%, FT% by situation
- Visualize shooting trends
- Hot/cold zones if shot chart data available

**Data Required:**
- `player_boxscores` with situational filters
- `play_by_play` for clutch situations

**Priority:** 🟢 MEDIUM

---

### 6.3 Plus/Minus Analysis
**User Intent:** Impact on game

**Example Queries:**
- "Best plus minus this season"
- "Who has the worst plus minus?"
- "Lakers plus minus by player"

**Expected Response:**
- Plus/minus leaderboard
- Context (minutes played, role)
- Team impact analysis

**Data Required:**
- `player_boxscores.plusMinus`
- Aggregate and analyze

**Priority:** 🟢 MEDIUM

---

## 7. TIME-BASED QUERIES

### 7.1 Relative Time References
**User Intent:** Questions using relative time

**Example Queries:**
- "Games last night"
- "This week's games"
- "Last 7 days stats"
- "This month's leaders"
- "Yesterday's scores"

**Expected Response:**
- Calculated date range
- Relevant results for that timeframe

**Data Required:**
- Date calculations based on current date
- Filter `basic_events` by date range

**Priority:** 🔴 CRITICAL - Common language pattern

**Technical Note:** Need current date context (today is 2025-10-22)

---

### 7.2 Season Context
**User Intent:** This season vs last season vs all-time

**Example Queries:**
- "This season leaders"
- "Last season stats"
- "All-time leaders"
- "Career best"

**Expected Response:**
- Filtered by appropriate season
- Historical context when relevant

**Data Required:**
- Season year filtering
- Historical data for "all-time" queries

**Priority:** 🟡 HIGH

---

## 8. INJURY & ROSTER QUERIES

### 8.1 Injury Status
**User Intent:** Is a player playing?

**Example Queries:**
- "Is LeBron playing tonight?"
- "Curry injury update"
- "Who's out for the Lakers?"
- "Injury report"

**Expected Response:**
- Player status (playing/out/questionable)
- Injury details if available
- Expected return date

**Data Required:**
- `player_boxscores.athlete_didNotPlay`
- `player_boxscores.athlete_reason`
- Roster status updates

**Priority:** 🟡 HIGH

---

### 8.2 Roster Information
**User Intent:** Team roster questions

**Example Queries:**
- "Lakers roster"
- "Who plays for the Warriors?"
- "Celtics starting lineup"
- "Show me the Heat roster"

**Expected Response:**
- List of players with positions
- Starter status
- Key stats for each player

**Data Required:**
- `rosters` table
- `player_boxscores.athlete_starter`
- `athletes` for names

**Priority:** 🟢 MEDIUM

---

## 9. NATURAL LANGUAGE COMPLEXITY

### 9.1 Vague/Ambiguous Queries
**User Intent:** Unclear or broad questions

**Example Queries:**
- "Tell me about the Lakers"
- "How's basketball going?"
- "What's happening in the NBA?"
- "Give me some stats"

**Expected Response:**
- Ask clarifying questions OR
- Provide most relevant/recent information
- Offer suggestions for more specific queries

**Strategy:** Context-aware responses, suggest popular queries

**Priority:** 🟢 MEDIUM

---

### 9.2 Multi-Part Questions
**User Intent:** Complex queries with multiple components

**Example Queries:**
- "Who scored the most points last night and did they win?"
- "Show me Curry's stats against the Lakers this season"
- "Which team has the best offense and defense?"

**Expected Response:**
- Break down into sub-queries
- Answer each component
- Synthesize into coherent response

**Data Required:** Multiple queries/joins

**Priority:** 🟢 MEDIUM

---

### 9.3 Conversational Follow-Ups
**User Intent:** Context from previous question

**Example Queries:**
- "What about his rebounds?" (after asking about points)
- "Show me more games" (after gamelog)
- "How does that compare to Curry?" (after showing LeBron stats)

**Expected Response:**
- Maintain conversation context
- Reference previous query results
- Seamless follow-up answers

**Technical Note:** Would require conversation history/context management

**Priority:** 🟢 LOW - Future enhancement

---

## 10. IMPLEMENTATION PRIORITIES

### Phase 1 - CRITICAL (Already Working)
- ✅ Game results with scores
- ✅ Player gamelog with full stats
- ✅ Top performers in games
- ✅ Team shooting stats

### Phase 2 - HIGH PRIORITY (Next)
- 🔲 Season averages and league leaders
- 🔲 Player comparisons
- 🔲 Team performance and records
- 🔲 Predictions integration (we have the data!)
- 🔲 Betting odds and player props (we have the data!)

### Phase 3 - MEDIUM PRIORITY
- 🔲 Head-to-head matchups
- 🔲 Advanced analytics (PER, efficiency)
- 🔲 Shooting splits
- 🔲 Injury reports

### Phase 4 - NICE TO HAVE
- 🔲 Historical/career stats
- 🔲 Conversational follow-ups
- 🔲 Complex multi-part queries
- 🔲 Trend analysis

---

## RESPONSE FORMAT STANDARDS

### Tables for:
- Gamelogs (player games over time)
- League leaders (multiple players ranked)
- Team stats comparisons
- Head-to-head history
- Shooting splits

### Cards/Sections for:
- Single game results
- Individual player performance
- Team overview

### Formatting Rules:
- **Always use markdown tables** for multi-row data
- **Include hyperlinks** for players, teams, games
- **Use short date formats**: "Oct 21" not "October 21, 2025"
- **Team abbreviations**: 3 letters (GSW, LAL, BOS)
- **Shooting format**: "8-15" not "8/15"
- **Center-align numbers**, left-align text
- **Mobile-responsive**: horizontal scroll on small screens

---

## DATABASE TABLES REFERENCE

Available tables and their uses:
- `athletes` - Player names, info
- `teams` - Team names, colors, abbreviations
- `basic_events` - Game metadata, dates
- `team_boxscores` - Team game stats, scores
- `player_boxscores` - Player game stats
- `player_season_stats` - Season averages
- `team_season_stats` - Team season averages
- `play_by_play` - Play-by-play data
- `game_odds` - Betting lines, spreads **✨ USE THIS!**
- `player_props` - Player betting props **✨ USE THIS!**
- `predictions` - Game predictions **✨ USE THIS!**
- `rosters` - Team rosters
- `seasons` - Season information

---

## NEXT STEPS

1. **Enhance system prompt** with examples for each major query type
2. **Add prediction queries** - leverage game_odds and predictions tables
3. **Add player props queries** - leverage player_props table
4. **Improve league leaders** - aggregate queries for rankings
5. **Season averages** - calculate or use player_season_stats
6. **Better error handling** - when data is missing or queries fail
7. **Query suggestions** - when query is vague, suggest specific options
8. **Performance optimization** - cache common queries, optimize SQL

---

**Document Version:** 1.0
**Last Updated:** 2025-10-22
**Status:** Living document - update as ChatBot evolves
