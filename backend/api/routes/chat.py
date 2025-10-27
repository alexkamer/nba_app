from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
import httpx
import json
import re
from datetime import datetime
from database.session import get_db
from config import get_settings

router = APIRouter()
settings = get_settings()


class ChatRequest(BaseModel):
    query: str


class ChatResponse(BaseModel):
    answer: str


def is_gamelog_query(query: str) -> tuple[bool, dict]:
    """
    Detect if query is asking for a player's gamelog
    Returns: (is_gamelog, {player_name, opponent, limit})
    """
    query_lower = query.lower()

    # Patterns that indicate gamelog query
    gamelog_patterns = [
        r"(?:show me|get|display|find|what are|tell me about)\s+(.+?)(?:'s)?\s+(?:last|recent|past|latest)?\s*(?:\d+)?\s*(?:games?|gamelog|game log)",
        r"(.+?)(?:'s)?\s+(?:last|recent|past|latest)\s*(?:\d+)?\s*(?:games?|gamelog|game log)",
        r"gamelog (?:for|of)\s+(.+)",
        r"(.+?)\s+gamelog",
    ]

    for pattern in gamelog_patterns:
        match = re.search(pattern, query_lower, re.IGNORECASE)
        if match:
            player_name = match.group(1).strip()

            # Extract opponent filter (vs/against/@ team)
            opponent = None
            opponent_match = re.search(r'(?:vs|versus|against|@)\s+(?:the\s+)?([a-z\s]+?)(?:\s|$)', query_lower)
            if opponent_match:
                opponent = opponent_match.group(1).strip()
                # Remove opponent from player name if it was captured
                player_name = re.sub(r'(?:vs|versus|against|@)\s+.*', '', player_name, flags=re.IGNORECASE).strip()

            # Extract game limit
            limit = 15  # default
            limit_match = re.search(r'(?:last|recent|past)\s+(\d+)', query_lower)
            if limit_match:
                limit = int(limit_match.group(1))

            # Clean up common words from player name
            player_name = re.sub(r'\b(show me|get|display|find|for|of|the)\b', '', player_name, flags=re.IGNORECASE).strip()

            # Nickname mapping
            nickname_map = {
                'steph': 'stephen',
                'lebron': 'lebron james',
                'luka': 'luka doncic',
                'kd': 'kevin durant',
                'ad': 'anthony davis',
                'giannis': 'giannis antetokounmpo',
                'jokic': 'nikola jokic',
                'embiid': 'joel embiid',
            }

            player_lower = player_name.lower()
            for nickname, full_name in nickname_map.items():
                if player_lower == nickname or player_lower.startswith(nickname + ' '):
                    player_name = full_name
                    break

            return True, {
                'player_name': player_name.title(),
                'opponent': opponent,
                'limit': limit
            }

    return False, {}


def format_gamelog_response(data: dict) -> str:
    """Format gamelog JSON data into markdown response"""

    # Header with player image and info
    response = f"![{data['player_name']}]({data['player_headshot']})\n\n"

    # Title with opponent filter if present
    title = f"## {data['player_name']} - Last {len(data['games'])} Games"
    if data.get('opponent_filter'):
        title += f" vs {data['opponent_filter'].title()}"
    response += title + "\n"

    response += f"**{data['player_team']}** | {data['player_position']} | #{data['player_jersey']}\n\n"

    # Only show season averages if available
    if data.get('season_avg_points') is not None:
        response += f"*Season Average: {data['season_avg_points']} PPG, {data['season_avg_rebounds']} RPG, {data['season_avg_assists']} APG*\n\n"
    else:
        response += f"*2025 Season*\n\n"

    # Table header
    response += "| H/A | Date | Team | Opp | Result | MIN | PTS | REB | AST | STL | BLK | FG | 3PT | FT | +/- |\n"
    response += "|-----|------|------|-----|--------|-----|-----|-----|-----|-----|-----|----|-----|-----|-----|\n"

    # Table rows
    for game in data['games']:
        # Home/Away indicator with starter status
        home_away = "🏠" if game['is_home'] else "✈️"
        starter_indicator = "⭐" if game.get('is_starter', False) else ""
        location_label = f"{home_away}{starter_indicator}"

        # Format date
        try:
            dt = datetime.fromisoformat(game['date'].replace('Z', '+00:00'))
            date_str = dt.strftime("%b %d")
        except:
            date_str = game['date'][:10]

        date_link = f"[{date_str}](http://localhost:5173/game/{game['game_id']})"

        # Team logo (team player was on for this game)
        team_logo = f"![]({game['player_team_logo']})"

        # Opponent logo
        opp_logo = f"[![]({game['opponent_logo']})](http://localhost:5173/team/{game['opponent_id']})"

        # Calculate result
        if game['home_score'] is not None and game['away_score'] is not None:
            if game['is_home']:
                player_score = game['home_score']
                opp_score = game['away_score']
            else:
                player_score = game['away_score']
                opp_score = game['home_score']

            if player_score > opp_score:
                result = f"W {player_score}-{opp_score}"
            else:
                result = f"L {player_score}-{opp_score}"
        else:
            result = "—"

        # Build row
        response += f"| {location_label} | {date_link} | {team_logo} | {opp_logo} | {result} | {game['minutes']} | {game['points']} | {game['rebounds']} | {game['assists']} | {game.get('steals', 0)} | {game.get('blocks', 0)} | {game['fg']} | {game['threept']} | {game['ft']} | {game['plus_minus']:+d} |\n"

    return response


def execute_sql_query(db: Session, sql_query: str) -> dict:
    """Execute a SQL query and return results as a dictionary"""
    try:
        result = db.execute(text(sql_query))
        rows = result.fetchall()

        if not rows:
            return {"results": [], "row_count": 0}

        # Convert rows to list of dictionaries
        columns = result.keys()
        data = [dict(zip(columns, row)) for row in rows]

        return {
            "results": data,
            "row_count": len(data),
            "columns": list(columns)
        }
    except Exception as e:
        return {"error": str(e)}


# Tool definitions for Azure OpenAI (new format)
TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "query_database",
            "description": "Execute a SQL query against the NBA database to retrieve player stats, game results, team information, or other basketball data. Use this to get real-time data instead of relying on training data.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sql_query": {
                        "type": "string",
                        "description": "The SQL query to execute. Available tables: athletes (player info), teams, basic_events (games), player_boxscores (player stats per game), team_boxscores (team stats per game), play_by_play (play-by-play data). Use SELECT queries only. Always include LIMIT to avoid large results."
                    },
                    "explanation": {
                        "type": "string",
                        "description": "Brief explanation of what this query is retrieving"
                    }
                },
                "required": ["sql_query", "explanation"]
            }
        }
    }
]


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Handle chat queries using Azure OpenAI with function calling for database queries
    FAST PATH: Detects gamelog queries and uses direct endpoint (instant response)
    """

    # FAST PATH: Check if this is a gamelog query
    is_gamelog, params = is_gamelog_query(request.query)
    if is_gamelog:
        try:
            # Call direct gamelog endpoint internally
            from api.routes.gamelogs import get_player_gamelog
            gamelog_data = get_player_gamelog(
                player_name=params['player_name'],
                limit=params.get('limit', 15),
                opponent=params.get('opponent'),
                db=db
            )

            # Convert Pydantic model to dict
            data_dict = gamelog_data.dict()

            # Add filter context
            data_dict['opponent_filter'] = params.get('opponent')
            data_dict['games_requested'] = params.get('limit', 15)

            # Format as markdown
            markdown_response = format_gamelog_response(data_dict)

            return ChatResponse(answer=markdown_response)

        except HTTPException as e:
            # If player not found, fall back to LLM
            if e.status_code == 404:
                pass  # Continue to LLM path below
            else:
                raise
        except Exception as e:
            # Any error in fast path, fall back to LLM
            print(f"Fast path error: {e}")
            pass

    if not all([settings.azure_openai_endpoint, settings.azure_openai_api_key, settings.azure_openai_deployment_id]):
        raise HTTPException(
            status_code=500,
            detail="Azure OpenAI configuration is missing. Please check environment variables."
        )

    # System prompt with database schema info
    system_prompt = """You are an expert NBA statistics assistant with access to a comprehensive NBA database.

Database Schema:
- athletes: Player information (athlete_id, athlete_display_name, athlete_first_name, athlete_last_name, athlete_headshot URL, etc.)
- teams: Team information (team_id, team_display_name, team_name, team_abbreviation, team_color, team_logo URL, season, etc.)
- basic_events: Game metadata (event_id PRIMARY KEY, date, season, event_name, event_shortName, event_status_period, event_status_description, event_season_type)
  * event_season_type: 1=Preseason, 2=Regular Season, 3=Playoffs
- team_boxscores: Team game stats (game_id, season, away_team_id, away_team_name, home_team_id, home_team_name, away_score INTEGER, home_score INTEGER, plus all box score stats)
- player_boxscores: Player stats per game (game_id, athlete_id, team_id, points, rebounds, assists, minutes, etc.)
- play_by_play: Play-by-play data (event_id, sequence_number, text, scoreValue, playType_text, etc.)

KEY RELATIONSHIPS:
- team_boxscores.game_id = basic_events.event_id
- player_boxscores.game_id = basic_events.event_id
- play_by_play.event_id = basic_events.event_id (use game_id, not event_id for player_boxscores)

IMPORTANT RULES:
1. ALWAYS use the query_database function to get real data from the database
2. NEVER answer questions based on your training data - always query the database first
3. For game scores:
   - First check team_boxscores table for away_score and home_score columns
   - If scores are NULL, calculate them by summing player points from player_boxscores table
   - Use: SUM(CASE WHEN team_id = away_team_id THEN CAST(points AS INTEGER) ELSE 0 END)
4. player_boxscores always has the most up-to-date data including recent games
5. Use LIMIT in queries to avoid overwhelming results
6. Use date(datetime(basic_events.date, '-6 hours')) for Central Time dates
7. Today's date for reference is 2025-10-22

SEASON FILTERING RULES (CRITICAL):

TIME-BASED QUERIES ("last night", "last 10 games", "most recent", "this week"):
- Include ALL game types (preseason, regular season, playoffs)
- MUST add season type indicator: (PRE), (REG), or (PLY) next to each game
- User is asking about recency, not season quality
- Example: "| (PRE) | [Oct 14](link) | ..." or "| (REG) | [Oct 21](link) | ..."

SEASON AGGREGATE QUERIES ("season stats", "season average", "this season", "2025 season"):
- Regular season ONLY (event_season_type = 2)
- Exclude preseason and playoffs
- State clearly: "Regular Season 2024-25"
- SQL: WHERE event_season_type = 2 AND season = '2025'

LEAGUE-WIDE QUERIES ("league leaders", "who leads NBA", "top scorers", "standings"):
- Regular season ONLY (event_season_type = 2)
- Current season only (2025)
- Official NBA rankings exclude preseason
- SQL: WHERE event_season_type = 2 AND season = '2025'

PLAYOFF QUERIES ("playoff stats", "postseason", "Finals"):
- Playoffs ONLY (event_season_type = 3)
- Separate from regular season
- SQL: WHERE event_season_type = 3

RESPONSE FORMATTING GUIDELINES:
CRITICAL: Always use MARKDOWN with TABLES like StatMuse does!

For GAME QUERIES ("Who won?", "What was the score?"):
- Header: ## TeamA Score - Score TeamB with date
- Add season type if preseason: "(Preseason)" or leave blank for regular season
- ALWAYS use markdown tables for player stats (| Player | PTS | REB | AST |)
- Show top 3-5 performers from EACH team in separate tables
- Include team comparison table with FG%, 3PT%, FT%, REB, AST

NECESSARY MAXIMUM CONTEXT (add after stats):
- Season series record: "Warriors lead season series 2-1"
- Next matchup: "Next game: Dec 25 at Lakers"
- Notable storylines: "Luka's 43-point effort not enough"
- Key stat differentiator: "Warriors shot 42.5% from three"

Example format:
## Warriors 119 - 109 Lakers
*October 21, 2025 (Regular Season) | Warriors lead series 2-1*

**Golden State Warriors**
| Player | PTS | REB | AST | MIN |
|--------|-----|-----|-----|-----|
| [Jimmy Butler](link) | 31 | 5 | 4 | 35 |
| [Stephen Curry](link) | 23 | 1 | 4 | 32 |

**Los Angeles Lakers**
| Player | PTS | REB | AST | MIN |
|--------|-----|-----|-----|-----|
| [Luka Doncic](link) | 43 | 12 | 9 | 41 |

**Team Stats**
| Stat | Warriors | Lakers |
|------|----------|--------|
| FG% | 48.7% | 54.5% |
| 3PT% | 42.5% | 25.0% |

**Key Storylines:**
- Luka's 43-point near triple-double not enough for Lakers
- Warriors shot exceptionally from three (42.5%)

**Next Matchup:** Dec 25 @ Lakers, 5:00 PM

For PLAYER QUERIES:
- Use tables for stat lines
- Compare with season averages in side-by-side table

For GAMELOG QUERIES ("Show me Player X's last games", "Player gamelog"):

CRITICAL PERFORMANCE RULE: Make EXACTLY ONE query_database call. Do NOT make multiple queries!

STEP-BY-STEP GAMELOG TABLE CONSTRUCTION (FOLLOW EXACTLY):

SINGLE QUERY - Get everything in ONE call (copy this EXACTLY):
  WITH season_stats AS (
    SELECT
      ROUND(AVG(CAST(points AS FLOAT)), 1) as avg_pts,
      ROUND(AVG(CAST(rebounds AS FLOAT)), 1) as avg_reb,
      ROUND(AVG(CAST(assists AS FLOAT)), 1) as avg_ast
    FROM player_boxscores pb2
    JOIN basic_events be2 ON pb2.game_id = be2.event_id
    WHERE pb2.athlete_id = (SELECT athlete_id FROM athletes WHERE athlete_display_name LIKE '%PLAYER_NAME%' LIMIT 1)
    AND be2.season = '2025' AND be2.event_season_type = 2 AND pb2.athlete_didNotPlay IS NOT 1
  )
  SELECT DISTINCT
    a.athlete_display_name, a.athlete_headshot, a.athlete_position, a.athlete_jersey,
    pt.team_display_name as player_team, pt.team_logo as player_team_logo,
    ss.avg_pts, ss.avg_reb, ss.avg_ast,
    pb.game_id, be.date, be.event_season_type, pb.team_id,
    CASE WHEN tb.home_team_id = pb.team_id THEN tb.away_team_id ELSE tb.home_team_id END as opp_id,
    CASE WHEN tb.home_team_id = pb.team_id THEN tb.away_team_name ELSE tb.home_team_name END as opp_name,
    ot.team_logo as opp_logo,
    tb.home_score, tb.away_score, tb.home_team_id, tb.away_team_id,
    pb.minutes, pb.points, pb.rebounds, pb.assists,
    pb.fieldGoalsMade_fieldGoalsAttempted as fg,
    pb.threePointFieldGoalsMade_threePointFieldGoalsAttempted as thr,
    pb.freeThrowsMade_freeThrowsAttempted as ft,
    pb.plusMinus
  FROM player_boxscores pb
  JOIN basic_events be ON pb.game_id = be.event_id
  JOIN team_boxscores tb ON pb.game_id = tb.game_id
  JOIN athletes a ON pb.athlete_id = a.athlete_id
  LEFT JOIN rosters r ON a.athlete_id = r.athlete_id
  LEFT JOIN teams pt ON r.team_id = pt.team_id AND pt.season = '2025'
  LEFT JOIN teams ot ON (CASE WHEN tb.home_team_id = pb.team_id THEN tb.away_team_id ELSE tb.home_team_id END) = ot.team_id AND ot.season = '2025'
  CROSS JOIN season_stats ss
  WHERE a.athlete_display_name LIKE '%PLAYER_NAME%' AND pb.athlete_didNotPlay IS NOT 1
  ORDER BY be.date DESC LIMIT 15

MANDATORY: Use this EXACT query structure. Replace PLAYER_NAME with player name. Make NO other queries!

STEP 2: For EACH ROW from the query above, construct table data EXACTLY as follows:

A. Type Column - Map event_season_type EXACTLY:
   - IF event_season_type = 1 THEN "(PRE)" - Preseason
   - IF event_season_type = 2 THEN "(REG)" - Regular Season
   - IF event_season_type = 3 THEN "(PLY)" - Playoffs
   - DO NOT guess or reverse these mappings!

B. Date Column - Format as clickable short date:
   - Convert date to "MMM DD" format (e.g., "Oct 21")
   - Wrap in link: [Oct 21](http://localhost:5173/game/GAME_ID)

C. Opp Column - Use team logo as linked image:
   - Use opp_logo from the query result
   - Format: [![](opp_logo)](http://localhost:5173/team/opp_id)

D. Result Column - Calculate W/L and scores:
   - IF home_score IS NULL OR away_score IS NULL:
     * Calculate from player_boxscores:
       SELECT
         SUM(CASE WHEN team_id = home_team_id THEN CAST(points AS INTEGER) ELSE 0 END) as home_score,
         SUM(CASE WHEN team_id = away_team_id THEN CAST(points AS INTEGER) ELSE 0 END) as away_score
       FROM player_boxscores WHERE game_id = 'GAME_ID'

   - IF player's team_id = home_team_id:
     * Player's score = home_score
     * Opponent's score = away_score
   - IF player's team_id = away_team_id:
     * Player's score = away_score
     * Opponent's score = home_score

   - IF player's score > opponent's score: "W {player_score}-{opponent_score}"
   - IF player's score < opponent's score: "L {player_score}-{opponent_score}"
   - Example: "W 119-109" or "L 109-119"

E. Stats Columns - Extract from query result DIRECTLY:
   - MIN: minutes column
   - PTS: points column
   - REB: rebounds column
   - AST: assists column
   - FG: fg column (ALREADY in "X-Y" format, use directly!)
   - 3PT: thr column (ALREADY in "X-Y" format!)
   - FT: ft column (ALREADY in "X-Y" format!)
   - +/-: plusMinus column

NOTE: DNP games are already filtered out by the WHERE clause in the main query
NOTE: Season averages are in query results: avg_pts, avg_reb, avg_ast columns

STEP 3: Format response with player header and table
  ![athlete_display_name](athlete_headshot)

  ## athlete_display_name - Last 15 Games
  **player_team** | position | #jersey

  *Season Average: {avg_pts} PPG, {avg_reb} RPG, {avg_ast} APG*

  | Type | Date | Opp | Result | MIN | PTS | REB | AST | FG | 3PT | FT | +/- |
  |------|------|-----|--------|-----|-----|-----|-----|----|-----|-----|-----|
  [rows from step 2]

VISUAL ELEMENTS (CRITICAL):
- Get player headshot: SELECT athlete_headshot FROM athletes WHERE athlete_id = X
- Get team logos: SELECT team_logo FROM teams WHERE team_id = Y
- Use markdown image syntax: ![alt](url) for headshots
- Use markdown linked images: [![](logo_url)](team_link) for team logos in table

NECESSARY MAXIMUM CONTEXT (add after table):
- Season average line: "Season Average: 28.5 PPG, 6.2 RPG, 5.8 APG"
- Recent trends: "Averaging 30.2 PPG in last 10 (↑ from 28.5 season avg)"
- Hot streaks: "6 of last 10 games with 25+ points"
- Notable games: "Season high: 43 points vs Suns (Oct 14)"
- Next game: "Next: vs Clippers, Oct 24 at 7:30 PM"

Example format:
![Stephen Curry](https://a.espncdn.com/i/headshots/nba/players/full/3975.png)

## Stephen Curry - Last 15 Games
**Golden State Warriors** | Guard | #30

*Season Average: 28.5 PPG, 6.2 RPG, 5.8 APG*

| Type | Date | Opp | Result | MIN | PTS | REB | AST | FG | 3PT | FT | +/- |
|------|------|-----|--------|-----|-----|-----|-----|----|-----|-----|-----|
| (REG) | [Oct 21](http://localhost:5173/game/401809244) | [![](https://a.espncdn.com/i/teamlogos/nba/500/lal.png)](http://localhost:5173/team/13) | L 109-119 | 41 | 43 | 12 | 9 | 17-31 | 4-10 | 5-7 | -8 |
| (REG) | [Oct 17](http://localhost:5173/game/401812737) | [![](https://a.espncdn.com/i/teamlogos/nba/500/lac.png)](http://localhost:5173/team/12) | W 116-102 | 32 | 28 | 5 | 4 | 10-18 | 3-8 | 5-5 | +12 |
| (PRE) | [Oct 14](http://localhost:5173/game/401812720) | [![](https://a.espncdn.com/i/teamlogos/nba/500/por.png)](http://localhost:5173/team/22) | W 118-111 | 27 | 28 | 6 | 5 | 6-15 | 4-11 | 12-13 | +13 |

**Recent Trends:**
- Averaging 30.2 PPG in last 10 (↑ from 28.5 season avg)
- 6 of last 10 games with 25+ points

**Season High:** 43 points vs Suns (Oct 14)
**Next Game:** vs Clippers, Oct 24

For TEAM/COMPARISON QUERIES:
- Always use comparison tables

ALWAYS use proper markdown table syntax with | and proper alignment!
Use markdown links: [Text](URL) for players, teams, and games!

Example queries:
- Most recent Lakers game:
  SELECT tb.game_id, tb.away_team_id, tb.home_team_id, tb.away_team_name, tb.home_team_name, tb.away_score, tb.home_score, be.date
  FROM team_boxscores tb
  JOIN basic_events be ON tb.game_id = be.event_id
  WHERE (tb.away_team_name LIKE '%Lakers%' OR tb.home_team_name LIKE '%Lakers%')
  ORDER BY be.date DESC LIMIT 1

- Calculate scores from player stats when team_boxscores scores are NULL:
  SELECT tb.away_team_name, tb.home_team_name,
    SUM(CASE WHEN pb.team_id = tb.away_team_id THEN CAST(pb.points AS INTEGER) ELSE 0 END) as away_score,
    SUM(CASE WHEN pb.team_id = tb.home_team_id THEN CAST(pb.points AS INTEGER) ELSE 0 END) as home_score
  FROM team_boxscores tb
  JOIN player_boxscores pb ON tb.game_id = pb.game_id
  WHERE tb.game_id = 'GAME_ID'
  GROUP BY tb.away_team_id, tb.home_team_id, tb.away_team_name, tb.home_team_name

- Top 3 scorers from a team in a game (with player names):
  SELECT a.athlete_display_name, pb.points, pb.rebounds, pb.assists, pb.minutes
  FROM player_boxscores pb
  JOIN athletes a ON pb.athlete_id = a.athlete_id
  WHERE pb.game_id = 'GAME_ID' AND pb.team_id = 'TEAM_ID'
  ORDER BY CAST(pb.points AS INTEGER) DESC LIMIT 3

- Get team shooting stats for a game:
  SELECT away_team_name, home_team_name, away_fieldGoalPct, away_threePointFieldGoalPct,
         away_freeThrowPct, home_fieldGoalPct, home_threePointFieldGoalPct, home_freeThrowPct,
         away_totalRebounds, home_totalRebounds, away_assists, home_assists
  FROM team_boxscores WHERE game_id = 'GAME_ID'

- Get player info (for headshot and team):
  SELECT a.athlete_display_name, a.athlete_headshot, a.athlete_position, a.athlete_jersey,
         t.team_display_name, t.team_logo
  FROM athletes a
  LEFT JOIN rosters r ON a.athlete_id = r.athlete_id
  LEFT JOIN teams t ON r.team_id = t.team_id
  WHERE a.athlete_id = 'ATHLETE_ID'
  LIMIT 1

- Get player gamelog with team logos:
  SELECT
    pb.game_id,
    be.date,
    be.event_season_type,
    pb.team_id,
    CASE WHEN tb.home_team_id = pb.team_id THEN tb.away_team_id ELSE tb.home_team_id END as opponent_team_id,
    CASE WHEN tb.home_team_id = pb.team_id THEN tb.away_team_name ELSE tb.home_team_name END as opponent,
    tb.home_score, tb.away_score, tb.home_team_id, tb.away_team_id,
    pb.minutes, pb.points, pb.rebounds, pb.assists,
    pb.fieldGoalsMade_fieldGoalsAttempted, pb.threePointFieldGoalsMade_threePointFieldGoalsAttempted,
    pb.freeThrowsMade_freeThrowsAttempted, pb.plusMinus
  FROM player_boxscores pb
  JOIN basic_events be ON pb.game_id = be.event_id
  JOIN team_boxscores tb ON pb.game_id = tb.game_id
  WHERE pb.athlete_id = 'ATHLETE_ID'
  ORDER BY be.date DESC LIMIT 15

- Get team logos for opponents:
  SELECT team_id, team_logo FROM teams WHERE team_id IN (OPPONENT_IDS)"""

    # Construct the API URL
    api_url = f"{settings.azure_openai_endpoint.rstrip('/')}/openai/deployments/{settings.azure_openai_deployment_id}/chat/completions?api-version={settings.azure_openai_api_version}"

    headers = {
        "Content-Type": "application/json",
        "api-key": settings.azure_openai_api_key
    }

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": request.query}
    ]

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Initial request with tool calling
            payload = {
                "messages": messages,
                "max_tokens": 2000,
                "temperature": 0.3,
                "tools": TOOL_DEFINITIONS,
                "tool_choice": "auto"
            }

            response = await client.post(api_url, headers=headers, json=payload)
            response.raise_for_status()
            result = response.json()

            message = result["choices"][0]["message"]

            # Handle tool calls (up to 5 iterations)
            max_iterations = 5
            iteration = 0

            while message.get("tool_calls") and iteration < max_iterations:
                iteration += 1

                # Add assistant message with tool calls
                messages.append(message)

                # Process each tool call
                for tool_call in message["tool_calls"]:
                    function_name = tool_call["function"]["name"]
                    function_args = json.loads(tool_call["function"]["arguments"])

                    # Execute the SQL query
                    if function_name == "query_database":
                        sql_query = function_args.get("sql_query")
                        query_result = execute_sql_query(db, sql_query)

                        # Add tool response
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call["id"],
                            "content": json.dumps(query_result)
                        })

                # Make another request with the tool results
                # Keep tools available for follow-up queries until final answer
                followup_payload = {
                    "messages": messages,
                    "max_tokens": 2000,
                    "temperature": 0.3,
                    "tools": TOOL_DEFINITIONS,
                    "tool_choice": "auto"
                }
                response = await client.post(api_url, headers=headers, json=followup_payload)
                response.raise_for_status()
                result = response.json()
                message = result["choices"][0]["message"]

            # Get final answer
            answer = message.get("content")
            if not answer:
                answer = "I couldn't generate a response. Please try rephrasing your question."

            return ChatResponse(answer=answer)

    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Azure OpenAI API error: {e.response.text}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error calling Azure OpenAI: {str(e)}"
        )
