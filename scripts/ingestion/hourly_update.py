#!/usr/bin/env python3
"""
Hourly data update script for NBA app
Fetches recent completed games and upcoming props

Run frequency: Every hour
Purpose: Keep database updated with latest games and betting lines
"""

import sys
import os
import sqlite3
import httpx
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(os.path.dirname(__file__), '../../logs/hourly_update.log')),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Database path
DB_PATH = os.path.join(os.path.dirname(__file__), '../../data/nba.db')

# ESPN BET provider
PROVIDER_ID = "58"
PROVIDER_NAME = "ESPN BET"

class NBADataUpdater:
    def __init__(self, db_path):
        self.db_path = db_path
        self.conn = None

    def connect(self):
        """Connect to database"""
        self.conn = sqlite3.connect(self.db_path)
        logger.info(f"Connected to database: {self.db_path}")

    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            logger.info("Database connection closed")

    def fetch_recent_completed_games(self):
        """Fetch games from last 7 days"""
        logger.info("Fetching recent completed games from ESPN API...")

        from datetime import datetime, timedelta
        today = datetime.now()
        games_by_date = {}

        # Check last 7 days
        for days_ago in range(7):
            check_date = today - timedelta(days=days_ago)
            year = check_date.year
            month = f"{check_date.month:02d}"

            url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?limit=1000&dates={year}{month}"

            try:
                response = httpx.get(url, timeout=30.0)
                response.raise_for_status()
                data = response.json()

                for event in data.get('events', []):
                    if event.get('status', {}).get('type', {}).get('completed', False):
                        event_id = event.get('id')
                        season_data = event.get('season', {})
                        season = season_data.get('year', year)
                        status = event.get('status', {})

                        games_by_date[event_id] = {
                            'event_id': event_id,
                            'season': str(season),
                            'event_season_type': season_data.get('type'),
                            'event_season_type_slug': season_data.get('slug'),
                            'date': event.get('date'),
                            'event_name': event.get('name'),
                            'event_shortName': event.get('shortName'),
                            'event_status_period': status.get('period'),
                            'event_status_description': status.get('type', {}).get('name', 'Final')
                        }

            except Exception as e:
                logger.warning(f"Error fetching games for {year}-{month}: {e}")
                continue

        logger.info(f"Found {len(games_by_date)} completed games in last 7 days")
        return list(games_by_date.values())

    def get_games_needing_boxscores(self, recent_games):
        """Check which games don't have boxscores yet"""
        if not recent_games:
            return []

        cursor = self.conn.cursor()
        cursor.execute("SELECT game_id FROM team_boxscores")
        existing_game_ids = {row[0] for row in cursor.fetchall()}

        games_to_fetch = [
            game for game in recent_games
            if game['event_id'] not in existing_game_ids
        ]

        logger.info(f"{len(games_to_fetch)} games need boxscores")
        return games_to_fetch

    def fetch_game_data(self, game_info, max_retries=2):
        """Fetch boxscore and play-by-play for a single game"""
        event_id = game_info['event_id']
        season = game_info['season']

        url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={event_id}"

        for attempt in range(max_retries):
            try:
                response = httpx.get(url, timeout=30.0)
                response.raise_for_status()
                event_data = response.json()

                if event_data.get('meta', {}).get('gameState') != 'post':
                    return None

                # Extract team boxscore
                team_boxscore = self._extract_team_boxscore(event_id, season, event_data)

                # Extract player boxscores
                player_boxscores = self._extract_player_boxscores(event_id, season, event_data)

                # Extract plays
                plays = self._extract_plays(event_id, season, event_data)

                return team_boxscore, player_boxscores, plays

            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep(2)
                else:
                    logger.error(f"Failed to fetch game {event_id}: {e}")
                    return None

        return None

    def _extract_team_boxscore(self, event_id, season, event_data):
        """Extract team boxscore data"""
        team_boxscores = event_data.get('boxscore', {}).get('teams', [])
        team_data = {'game_id': event_id, 'season': season}

        # First, get scores from header.competitions[0].competitors
        header = event_data.get('header', {})
        competitions = header.get('competitions', [])
        if competitions:
            competitors = competitions[0].get('competitors', [])
            for competitor in competitors:
                home_away = competitor.get('homeAway')
                score = competitor.get('score')
                if home_away and score:
                    team_data[f"{home_away}_score"] = int(score)

        # Then get detailed stats from boxscore
        for team in team_boxscores:
            prefix = 'home' if team.get('homeAway') == 'home' else 'away'
            team_data[f"{prefix}_team_id"] = team.get('team', {}).get('id')
            team_data[f"{prefix}_team_name"] = team.get('team', {}).get('displayName')

            for stat in team.get('statistics', []):
                name = stat.get('name', '').replace('-', '_')
                team_data[f"{prefix}_{name}"] = stat.get('displayValue')

        return team_data

    def _extract_player_boxscores(self, event_id, season, event_data):
        """Extract player boxscore data"""
        player_boxscores = event_data.get('boxscore', {}).get('players', [])
        players_data = []

        for team in player_boxscores:
            team_id = team.get('team', {}).get('id')
            stats_dict = team.get('statistics', [{}])[0]
            stat_labels = stats_dict.get('keys', [])

            for athlete in stats_dict.get('athletes', []):
                athlete_data = {
                    'game_id_athlete_id': f"{event_id}_{athlete.get('athlete', {}).get('id')}",
                    'game_id': event_id,
                    'season': season,
                    'team_id': team_id,
                    'athlete_id': athlete.get('athlete', {}).get('id'),
                    'athlete_position': athlete.get('athlete', {}).get('position', {}).get('abbreviation'),
                    'athlete_starter': athlete.get('starter'),
                    'athlete_didNotPlay': athlete.get('didNotPlay'),
                    'athlete_reason': athlete.get('reason'),
                    'athlete_ejected': athlete.get('ejected')
                }

                for i, stat in enumerate(athlete.get('stats', [])):
                    if i < len(stat_labels):
                        key = stat_labels[i].replace('-', '_')
                        athlete_data[key] = stat

                players_data.append(athlete_data)

        return players_data

    def _extract_plays(self, event_id, season, event_data):
        """Extract play-by-play data"""
        plays = event_data.get('plays', [])
        plays_data = []

        for play in plays:
            play_data = {
                'game_id_play_id': f"{event_id}_{play.get('id')}",
                'game_id': event_id,
                'season': season,
                'play_id': play.get('id'),
                'sequenceNumber': play.get('sequenceNumber'),
                'playType_id': play.get('type', {}).get('id'),
                'playType_text': play.get('type', {}).get('text'),
                'text': play.get('text'),
                'awayScore': play.get('awayScore'),
                'homeScore': play.get('homeScore'),
                'quarter_number': play.get('period', {}).get('number'),
                'quarter_display_value': play.get('period', {}).get('displayValue'),
                'clock_display_value': play.get('clock', {}).get('displayValue'),
                'scoring_play': play.get('scoringPlay'),
                'score_value': play.get('scoreValue'),
                'team_id': play.get('team', {}).get('id'),
                'shooting_play': play.get('shootingPlay'),
                'x_coordinate': play.get('coordinate', {}).get('x'),
                'y_coordinate': play.get('coordinate', {}).get('y')
            }

            for i, participant in enumerate(play.get('participants', [])):
                play_data[f'participant_{i+1}_id'] = participant.get('athlete', {}).get('id')

            plays_data.append(play_data)

        return plays_data

    def insert_game_data(self, team_boxscores, player_boxscores, plays, game_events=None):
        """Bulk insert game data into database"""
        cursor = self.conn.cursor()

        # Insert basic_events for completed games
        if game_events:
            logger.info(f"Inserting {len(game_events)} games into basic_events...")
            for game in game_events:
                try:
                    cursor.execute("""
                        INSERT OR REPLACE INTO basic_events
                        (event_id, event_season_type, event_season_type_slug, season, date,
                         event_name, event_shortName, event_status_period, event_status_description)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        game['event_id'],
                        game.get('event_season_type'),
                        game.get('event_season_type_slug'),
                        game['season'],
                        game['date'],
                        game['event_name'],
                        game['event_shortName'],
                        game.get('event_status_period'),
                        game.get('event_status_description', 'Final')
                    ))
                except Exception as e:
                    logger.warning(f"Error inserting game {game['event_id']} into basic_events: {e}")

        # Insert team boxscores
        if team_boxscores:
            logger.info(f"Inserting {len(team_boxscores)} team boxscores...")
            for team in team_boxscores:
                columns = ', '.join(team.keys())
                placeholders = ', '.join(['?' for _ in team])
                query = f"INSERT OR REPLACE INTO team_boxscores ({columns}) VALUES ({placeholders})"
                cursor.execute(query, list(team.values()))

        # Insert player boxscores
        if player_boxscores:
            logger.info(f"Inserting {len(player_boxscores)} player boxscores...")
            for player in player_boxscores:
                columns = ', '.join(player.keys())
                placeholders = ', '.join(['?' for _ in player])
                query = f"INSERT OR REPLACE INTO player_boxscores ({columns}) VALUES ({placeholders})"
                cursor.execute(query, list(player.values()))

        # Insert plays
        if plays:
            logger.info(f"Inserting {len(plays)} plays...")
            for play in plays:
                columns = ', '.join(play.keys())
                placeholders = ', '.join(['?' for _ in play])
                query = f"INSERT OR REPLACE INTO play_by_play ({columns}) VALUES ({placeholders})"
                cursor.execute(query, list(play.values()))

        self.conn.commit()
        logger.info("Game data inserted successfully")

    def fetch_upcoming_games(self):
        """Get upcoming games for next 7 days"""
        cursor = self.conn.cursor()
        query = """
            SELECT DISTINCT event_id, season
            FROM basic_events
            WHERE date >= date('now')
            AND date <= date('now', '+7 days')
        """
        cursor.execute(query)
        games = [{"game_id": row[0], "season": row[1]} for row in cursor.fetchall()]
        logger.info(f"Found {len(games)} upcoming games for props")
        return games

    def fetch_props_for_game(self, game_data, max_retries=2):
        """Fetch player props for a single game"""
        game_id = game_data["game_id"]
        season = game_data["season"]

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

    def insert_props(self, props):
        """Insert player props into database"""
        if not props:
            logger.info("No props to insert")
            return

        cursor = self.conn.cursor()
        logger.info(f"Inserting {len(props)} props...")

        for prop in props:
            columns = ', '.join(prop.keys())
            placeholders = ', '.join(['?' for _ in prop])
            query = f"INSERT OR REPLACE INTO player_props ({columns}) VALUES ({placeholders})"
            cursor.execute(query, list(prop.values()))

        self.conn.commit()
        logger.info("Props inserted successfully")

    def run_hourly_update(self):
        """Main update routine - run this hourly"""
        logger.info("="*80)
        logger.info("STARTING HOURLY NBA DATA UPDATE")
        logger.info("="*80)

        try:
            self.connect()

            # 1. Fetch recent completed games
            recent_games = self.fetch_recent_completed_games()

            # 2. Check which games need boxscores
            games_to_fetch = self.get_games_needing_boxscores(recent_games)

            # 3. Fetch boxscores for new games
            if games_to_fetch:
                logger.info(f"Fetching data for {len(games_to_fetch)} new games...")

                all_team_boxscores = []
                all_player_boxscores = []
                all_plays = []

                with ThreadPoolExecutor(max_workers=5) as executor:
                    futures = {executor.submit(self.fetch_game_data, game): game for game in games_to_fetch}

                    for future in as_completed(futures):
                        result = future.result()
                        if result:
                            team, players, plays = result
                            all_team_boxscores.append(team)
                            all_player_boxscores.extend(players)
                            all_plays.extend(plays)

                # Insert all game data (including basic_events)
                self.insert_game_data(all_team_boxscores, all_player_boxscores, all_plays, games_to_fetch)
            else:
                logger.info("No new games to fetch")

            # 4. Fetch props for upcoming games
            upcoming_games = self.fetch_upcoming_games()

            if upcoming_games:
                logger.info(f"Fetching props for {len(upcoming_games)} upcoming games...")

                all_props = []
                with ThreadPoolExecutor(max_workers=5) as executor:
                    futures = {executor.submit(self.fetch_props_for_game, game): game for game in upcoming_games}

                    for future in as_completed(futures):
                        props = future.result()
                        if props:
                            all_props.extend(props)

                self.insert_props(all_props)
            else:
                logger.info("No upcoming games for props")

            logger.info("="*80)
            logger.info("HOURLY UPDATE COMPLETED SUCCESSFULLY")
            logger.info("="*80)

        except Exception as e:
            logger.error(f"Error during hourly update: {e}", exc_info=True)
            raise
        finally:
            self.close()


if __name__ == "__main__":
    updater = NBADataUpdater(DB_PATH)
    updater.run_hourly_update()
