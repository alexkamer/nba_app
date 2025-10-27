"""
Vegas+ Prediction Engine for Production

Provides player stat predictions using hybrid Vegas + statistical model
"""

import sqlite3
from typing import Dict, Optional, List
from datetime import datetime
import pandas as pd
import numpy as np


class PredictionEngine:
    """Vegas+ hybrid prediction engine."""

    def __init__(self, db_path: str = "/Users/alexkamer/nba_app/nba.db"):
        self.db_path = db_path

    def get_connection(self):
        """Get database connection."""
        return sqlite3.connect(self.db_path)

    def get_player_game_log(
        self,
        athlete_id: str,
        season: str,
        before_game_id: str = None
    ) -> pd.DataFrame:
        """Get player's recent game performance."""
        conn = self.get_connection()

        query = """
        SELECT
            pb.game_id,
            pb.season,
            pb.athlete_id,
            pb.team_id,
            CAST(pb.points AS FLOAT) as points,
            CAST(pb.rebounds AS FLOAT) as rebounds,
            CAST(pb.assists AS FLOAT) as assists,
            CAST(pb.steals AS FLOAT) as steals,
            CAST(pb.blocks AS FLOAT) as blocks,
            pb.athlete_didNotPlay,
            pb.athlete_starter,
            pb.fieldGoalsMade_fieldGoalsAttempted,
            be.date
        FROM player_boxscores pb
        JOIN basic_events be ON pb.game_id = be.event_id
        WHERE pb.athlete_id = ?
        AND pb.season = ?
        AND pb.athlete_didNotPlay = '0'
        AND pb.minutes IS NOT NULL
        AND pb.minutes != '0'
        AND be.event_season_type = 2
        ORDER BY be.date ASC
        """

        df = pd.read_sql_query(query, conn, params=(athlete_id, season))
        conn.close()

        if before_game_id and before_game_id in df['game_id'].values:
            game_idx = df[df['game_id'] == before_game_id].index[0]
            df = df.iloc[:game_idx]

        return df

    def get_prop_line(
        self,
        athlete_id: str,
        game_id: str,
        stat_type: str
    ) -> Optional[Dict]:
        """
        Get Vegas prop line for this game.

        Returns dict with 'line', 'has_odds' (True if main line with valid odds, False if alt line)
        """
        prop_type_mapping = {
            'points': 'Total Points',
            'rebounds': 'Total Rebounds',
            'assists': 'Total Assists',
            'steals': 'Total Steals',
            'blocks': 'Total Blocks'
        }

        if stat_type not in prop_type_mapping:
            return None

        conn = self.get_connection()

        # Get the line with odds closest to -110 (main line), not alt lines
        query = """
        SELECT
            CAST(line AS FLOAT) as prop_line,
            over_odds,
            under_odds
        FROM player_props
        WHERE athlete_id = ?
        AND game_id = ?
        AND prop_type = ?
        AND over_odds IS NOT NULL
        AND under_odds IS NOT NULL
        ORDER BY ABS(CAST(REPLACE(over_odds, '+', '') AS INTEGER) - 110) ASC
        LIMIT 1
        """

        result = pd.read_sql_query(
            query,
            conn,
            params=(athlete_id, game_id, prop_type_mapping[stat_type])
        )

        conn.close()

        if result.empty:
            return None

        # Check if this is a main line (odds around -110 to -150) or an alt line
        over_odds = result['over_odds'].iloc[0]
        under_odds = result['under_odds'].iloc[0]

        # Parse odds (remove + sign, convert to int)
        try:
            over_val = int(over_odds.replace('+', ''))
            under_val = int(under_odds.replace('+', ''))

            # Main lines typically have odds between -200 and +200
            # Alt lines have much more extreme odds
            has_valid_odds = (-200 <= over_val <= 200) and (-200 <= under_val <= 200)
        except:
            has_valid_odds = False

        return {
            'line': result['prop_line'].iloc[0],
            'has_odds': has_valid_odds,
            'over_odds': over_odds,
            'under_odds': under_odds
        }

    def get_opponent_recent_defense(
        self,
        opponent_team_id: str,
        game_id: str,
        season: str,
        stat_type: str,
        n_recent: int = 10
    ) -> Dict:
        """
        Calculate opponent's recent defensive performance.

        Returns how many points/rebounds/assists the opponent has allowed
        compared to league average in their last N games.
        """
        conn = self.get_connection()

        # Get opponent's recent games before this game
        query = """
        SELECT
            tb.game_id,
            be.date,
            tb.away_team_id,
            tb.home_team_id,
            CASE
                WHEN tb.away_team_id = ? THEN CAST(tb.home_score AS FLOAT)
                ELSE CAST(tb.away_score AS FLOAT)
            END as points_allowed,
            CASE
                WHEN tb.away_team_id = ? THEN CAST(tb.home_totalRebounds AS FLOAT)
                ELSE CAST(tb.away_totalRebounds AS FLOAT)
            END as rebounds_allowed,
            CASE
                WHEN tb.away_team_id = ? THEN CAST(tb.home_assists AS FLOAT)
                ELSE CAST(tb.away_assists AS FLOAT)
            END as assists_allowed
        FROM team_boxscores tb
        JOIN basic_events be ON tb.game_id = be.event_id
        WHERE (tb.away_team_id = ? OR tb.home_team_id = ?)
        AND be.season = ?
        AND be.event_season_type = 2
        AND be.date < (SELECT date FROM basic_events WHERE event_id = ?)
        ORDER BY be.date DESC
        LIMIT ?
        """

        df = pd.read_sql_query(
            query,
            conn,
            params=(
                opponent_team_id, opponent_team_id, opponent_team_id,
                opponent_team_id, opponent_team_id, season, game_id, n_recent
            )
        )
        conn.close()

        if len(df) < 3:
            return {
                "adjustment": 0.0,
                "opponent_avg": None,
                "league_avg": None,
                "games_analyzed": len(df)
            }

        # Calculate opponent's average allowed
        stat_column = f"{stat_type}_allowed"
        opponent_avg = df[stat_column].mean()

        # League average estimates (2024 season approximate)
        league_averages = {
            'points': 114.5,  # Team points per game
            'rebounds': 44.0,  # Team rebounds per game
            'assists': 27.0    # Team assists per game
        }

        league_avg = league_averages.get(stat_type, 0)

        # Calculate adjustment (70% of the difference from league average)
        # If opponent allows more than league avg = easier matchup = positive adjustment
        adjustment = (opponent_avg - league_avg) * 0.70

        return {
            "adjustment": adjustment,
            "opponent_avg": round(opponent_avg, 1),
            "league_avg": league_avg,
            "games_analyzed": len(df)
        }

    def get_usage_change(
        self,
        game_log: pd.DataFrame
    ) -> Dict:
        """
        Detect significant usage changes by analyzing field goal attempts.

        Returns usage adjustment and whether to increase recent game weighting.
        """
        if len(game_log) < 5:
            return {
                "usage_change": 0.0,
                "increase_recent_weight": False,
                "recent_fga": None,
                "season_fga": None
            }

        # Parse FGA from "made-attempted" format
        def parse_fga(fga_string):
            if pd.isna(fga_string) or fga_string == '':
                return np.nan
            try:
                parts = str(fga_string).split('-')
                return float(parts[1]) if len(parts) == 2 else np.nan
            except:
                return np.nan

        game_log['fga'] = game_log['fieldGoalsMade_fieldGoalsAttempted'].apply(parse_fga)

        # Calculate recent vs season FGA
        season_fga = game_log['fga'].mean()
        recent_fga = game_log['fga'].tail(5).mean()

        if pd.isna(season_fga) or season_fga == 0:
            return {
                "usage_change": 0.0,
                "increase_recent_weight": False,
                "recent_fga": None,
                "season_fga": None
            }

        # Calculate percentage change
        pct_change = (recent_fga - season_fga) / season_fga

        # If >20% change, we should weight recent games more heavily
        increase_recent_weight = abs(pct_change) > 0.20

        return {
            "usage_change": pct_change,
            "increase_recent_weight": increase_recent_weight,
            "recent_fga": round(recent_fga, 1),
            "season_fga": round(season_fga, 1)
        }

    def get_teammate_context(
        self,
        athlete_id: str,
        game_id: str,
        team_id: str,
        season: str
    ) -> Dict:
        """
        Analyze teammate injuries/absences and their impact.

        Identifies star teammates (>15 PPG) and checks if they're playing.
        """
        conn = self.get_connection()

        # Get team's star players (>15 PPG) in this season
        query = """
        SELECT
            pb.athlete_id,
            a.athlete_display_name,
            AVG(CAST(pb.points AS FLOAT)) as avg_points
        FROM player_boxscores pb
        JOIN athletes a ON pb.athlete_id = a.athlete_id
        JOIN basic_events be ON pb.game_id = be.event_id
        WHERE pb.team_id = ?
        AND pb.season = ?
        AND pb.athlete_didNotPlay = '0'
        AND pb.athlete_id != ?
        AND be.event_season_type = 2
        AND be.date < (SELECT date FROM basic_events WHERE event_id = ?)
        GROUP BY pb.athlete_id, a.athlete_display_name
        HAVING AVG(CAST(pb.points AS FLOAT)) > 15.0
        ORDER BY avg_points DESC
        """

        stars = pd.read_sql_query(
            query,
            conn,
            params=(team_id, season, athlete_id, game_id)
        )

        if stars.empty:
            conn.close()
            return {
                "missing_stars": [],
                "adjustment": 0.0,
                "stars_playing": 0,
                "stars_total": 0
            }

        # Check which stars are playing in this game
        star_ids = stars['athlete_id'].tolist()
        placeholders = ','.join('?' * len(star_ids))

        playing_query = f"""
        SELECT athlete_id
        FROM player_boxscores
        WHERE game_id = ?
        AND team_id = ?
        AND athlete_id IN ({placeholders})
        AND athlete_didNotPlay = '0'
        """

        playing_stars = pd.read_sql_query(
            playing_query,
            conn,
            params=[game_id, team_id] + star_ids
        )
        conn.close()

        playing_ids = set(playing_stars['athlete_id'].tolist())
        star_ids_set = set(star_ids)

        missing_star_ids = star_ids_set - playing_ids
        missing_stars = stars[stars['athlete_id'].isin(missing_star_ids)]['athlete_display_name'].tolist()

        # Boost prediction by 10-15% per missing star
        stars_missing_count = len(missing_stars)
        adjustment = stars_missing_count * 0.125  # 12.5% boost per missing star

        return {
            "missing_stars": missing_stars,
            "adjustment": adjustment,
            "stars_playing": len(playing_ids),
            "stars_total": len(star_ids)
        }

    def calculate_weighted_average(
        self,
        values: pd.Series,
        n_recent: int = 10,
        decay: float = 0.15
    ) -> float:
        """Calculate weighted average favoring recent games."""
        if len(values) == 0:
            return 0.0

        values = values.dropna().tail(n_recent)
        if len(values) == 0:
            return 0.0

        # Exponential decay weighting
        # Lower decay = more recent weighting (e.g., 0.05 for usage changes)
        weights = np.exp(-decay * np.arange(len(values))[::-1])
        weights = weights / weights.sum()

        return np.average(values, weights=weights)

    def calculate_statistical_prediction(
        self,
        athlete_id: str,
        game_id: str,
        season: str,
        stat_type: str
    ) -> Dict:
        """Enhanced statistical prediction with opponent defense, usage, and teammate context."""
        game_log = self.get_player_game_log(athlete_id, season, before_game_id=game_id)

        if len(game_log) < 3:
            return {
                "prediction": None,
                "confidence": "Low",
                "error": "Insufficient data (need at least 3 games)"
            }

        stat_values = game_log[stat_type]

        # === FEATURE 1: Usage Change Detection ===
        usage_info = self.get_usage_change(game_log)
        decay_rate = 0.05 if usage_info['increase_recent_weight'] else 0.15

        # Baseline: weighted average with dynamic decay
        baseline = self.calculate_weighted_average(stat_values, n_recent=10, decay=decay_rate)

        # Recent trend: last 5 vs season average
        season_avg = stat_values.mean()
        recent_5 = stat_values.tail(5).mean() if len(stat_values) >= 5 else baseline
        trend_adj = (recent_5 - season_avg) * 0.25

        prediction = baseline + trend_adj

        # === FEATURE 2: Opponent Recent Defense ===
        # Get opponent team ID for this game
        conn = self.get_connection()
        opponent_query = """
        SELECT
            tb.away_team_id,
            tb.home_team_id,
            pb.team_id
        FROM player_boxscores pb
        JOIN team_boxscores tb ON pb.game_id = tb.game_id
        WHERE pb.game_id = ?
        AND pb.athlete_id = ?
        LIMIT 1
        """
        opponent_result = pd.read_sql_query(opponent_query, conn, params=(game_id, athlete_id))
        conn.close()

        opponent_adj = 0.0
        opponent_info = {}

        if not opponent_result.empty:
            player_team = opponent_result['team_id'].iloc[0]
            away_team = opponent_result['away_team_id'].iloc[0]
            home_team = opponent_result['home_team_id'].iloc[0]
            opponent_team = home_team if player_team == away_team else away_team

            opponent_defense = self.get_opponent_recent_defense(
                opponent_team, game_id, season, stat_type
            )
            opponent_adj = opponent_defense['adjustment']
            opponent_info = opponent_defense

        prediction += opponent_adj

        # === FEATURE 3: Teammate Injury Context ===
        teammate_info = {"missing_stars": [], "adjustment": 0.0}

        if not opponent_result.empty:
            player_team = opponent_result['team_id'].iloc[0]
            teammate_context = self.get_teammate_context(
                athlete_id, game_id, player_team, season
            )
            # Apply multiplicative boost for missing stars
            teammate_boost = 1.0 + teammate_context['adjustment']
            prediction *= teammate_boost
            teammate_info = teammate_context

        # Confidence based on consistency
        std_dev = stat_values.tail(10).std()
        cv = std_dev / baseline if baseline > 0 else 1.0

        if cv < 0.3 and len(stat_values) >= 10:
            confidence = "High"
        elif cv < 0.5 and len(stat_values) >= 5:
            confidence = "Medium"
        else:
            confidence = "Low"

        return {
            "prediction": prediction,
            "confidence": confidence,
            "baseline": baseline,
            "season_avg": season_avg,
            "recent_5": recent_5,
            "trend_adj": trend_adj,
            "games_used": len(stat_values),
            # Enhanced features
            "usage_info": usage_info,
            "opponent_defense": opponent_info,
            "teammate_context": teammate_info,
            "opponent_adj": round(opponent_adj, 1),
            "teammate_boost": round((teammate_info.get('adjustment', 0) * 100), 1)
        }

    def predict_stat(
        self,
        athlete_id: str,
        game_id: str,
        stat_type: str
    ) -> Dict:
        """
        Vegas+ Hybrid Prediction.

        Returns prediction with confidence, edge vs Vegas, and recommendation.
        """
        conn = self.get_connection()

        # Get game info
        game_query = """
        SELECT season FROM basic_events WHERE event_id = ?
        """
        game_info = pd.read_sql_query(game_query, conn, params=(game_id,))
        conn.close()

        if game_info.empty:
            # For future games not in basic_events, default to current season
            season = "2025"
        else:
            season = game_info['season'].iloc[0]

        # Get Vegas line
        vegas_data = self.get_prop_line(athlete_id, game_id, stat_type)

        # Get statistical prediction
        stat_prediction = self.calculate_statistical_prediction(
            athlete_id,
            game_id,
            season,
            stat_type
        )

        if stat_prediction["prediction"] is None:
            return stat_prediction

        stat_pred_value = stat_prediction["prediction"]

        # HYBRID MODEL
        if vegas_data is not None:
            vegas_line = vegas_data['line']
            has_valid_odds = vegas_data['has_odds']

            # Vegas+ Model: 65% Vegas, 35% Stats
            vegas_weight = 0.65
            stat_weight = 0.35

            final_prediction = (vegas_line * vegas_weight) + (stat_pred_value * stat_weight)
            edge = final_prediction - vegas_line

            # Confidence based on agreement with Vegas
            disagreement = abs(edge) / vegas_line if vegas_line > 0 else 0

            # Only recommend Over/Under if we have valid betting odds (not alt lines)
            if disagreement < 0.10:
                confidence = "High"
                if has_valid_odds:
                    # High confidence: recommend with edge >= 0.5 points
                    recommendation = "Pass" if abs(edge) < 0.5 else ("Over" if edge > 0 else "Under")
                else:
                    recommendation = "Pass (Alt Line)"
            elif disagreement < 0.20:
                confidence = "Medium"
                if has_valid_odds:
                    # Medium confidence: recommend with edge >= 1.0 points
                    recommendation = "Over" if edge >= 1.0 else ("Under" if edge <= -1.0 else "Pass")
                else:
                    recommendation = "Pass (Alt Line)"
            else:
                confidence = "Low"
                if has_valid_odds:
                    # Low confidence: recommend with edge >= 2.0 points (rare)
                    recommendation = "Over" if edge >= 2.0 else ("Under" if edge <= -2.0 else "Pass")
                else:
                    recommendation = "Pass"

            factors = [
                f"Vegas line: {vegas_line:.1f}",
                f"Statistical prediction: {stat_pred_value:.1f}",
                f"Recent form (L5): {stat_prediction['recent_5']:.1f}",
                f"Season average: {stat_prediction['season_avg']:.1f}",
                f"Edge vs Vegas: {'+' if edge > 0 else ''}{edge:.1f}"
            ]

            # Add enhanced feature info to factors
            if stat_prediction.get('opponent_adj'):
                opp_info = stat_prediction.get('opponent_defense', {})
                if opp_info.get('opponent_avg'):
                    factors.append(
                        f"Opponent defense: {opp_info['opponent_avg']} {stat_type}/gm "
                        f"(League avg: {opp_info['league_avg']}, Adj: {stat_prediction['opponent_adj']:+.1f})"
                    )

            if stat_prediction.get('teammate_boost'):
                tm_info = stat_prediction.get('teammate_context', {})
                if tm_info.get('missing_stars'):
                    factors.append(
                        f"Missing stars: {', '.join(tm_info['missing_stars'])} "
                        f"(Boost: +{stat_prediction['teammate_boost']:.1f}%)"
                    )

            usage_info = stat_prediction.get('usage_info', {})
            if usage_info.get('recent_fga') and usage_info.get('season_fga'):
                usage_change = usage_info['usage_change'] * 100
                factors.append(
                    f"Usage: {usage_info['recent_fga']:.1f} FGA/gm recent vs "
                    f"{usage_info['season_fga']:.1f} season ({usage_change:+.0f}%)"
                )

            return {
                "prediction": round(final_prediction, 1),
                "vegas_line": vegas_line,
                "stat_prediction": round(stat_pred_value, 1),
                "edge": round(edge, 1),
                "confidence": confidence,
                "recommendation": recommendation,
                "model_type": "Vegas+ Hybrid",
                "factors": factors,
                "games_used": stat_prediction["games_used"]
            }
        else:
            # No Vegas line: pure statistical model
            factors_no_vegas = [
                f"Statistical prediction: {stat_pred_value:.1f}",
                f"Recent form (L5): {stat_prediction['recent_5']:.1f}",
                f"Season average: {stat_prediction['season_avg']:.1f}",
            ]

            # Add enhanced features
            if stat_prediction.get('opponent_adj'):
                opp_info = stat_prediction.get('opponent_defense', {})
                if opp_info.get('opponent_avg'):
                    factors_no_vegas.append(
                        f"Opponent defense: {opp_info['opponent_avg']} {stat_type}/gm "
                        f"(Adj: {stat_prediction['opponent_adj']:+.1f})"
                    )

            if stat_prediction.get('teammate_boost'):
                tm_info = stat_prediction.get('teammate_context', {})
                if tm_info.get('missing_stars'):
                    factors_no_vegas.append(
                        f"Missing stars: {', '.join(tm_info['missing_stars'])} "
                        f"(Boost: +{stat_prediction['teammate_boost']:.1f}%)"
                    )

            usage_info = stat_prediction.get('usage_info', {})
            if usage_info.get('recent_fga') and usage_info.get('season_fga'):
                usage_change = usage_info['usage_change'] * 100
                factors_no_vegas.append(
                    f"Usage: {usage_info['recent_fga']:.1f} FGA/gm recent vs "
                    f"{usage_info['season_fga']:.1f} season ({usage_change:+.0f}%)"
                )

            return {
                "prediction": round(stat_pred_value, 1),
                "vegas_line": None,
                "stat_prediction": round(stat_pred_value, 1),
                "edge": None,
                "confidence": stat_prediction["confidence"],
                "recommendation": "No Line Available",
                "model_type": "Enhanced Statistical",
                "factors": factors_no_vegas,
                "games_used": stat_prediction["games_used"]
            }

    def get_game_predictions(
        self,
        game_id: str,
        stat_types: List[str] = None
    ) -> List[Dict]:
        """Get predictions for all players in a game."""
        if stat_types is None:
            stat_types = ['points', 'rebounds', 'assists']

        conn = self.get_connection()

        # Try to get players from boxscores (for completed games)
        query = """
        SELECT DISTINCT
            pb.athlete_id,
            a.athlete_display_name as player_name,
            pb.team_id,
            t.team_display_name as team_name
        FROM player_boxscores pb
        JOIN athletes a ON pb.athlete_id = a.athlete_id
        JOIN teams t ON pb.team_id = t.team_id
        WHERE pb.game_id = ?
        AND pb.athlete_didNotPlay = '0'
        """

        players = pd.read_sql_query(query, conn, params=(game_id,))
        conn.close()

        predictions = []

        for _, player in players.iterrows():
            for stat_type in stat_types:
                prediction = self.predict_stat(
                    player['athlete_id'],
                    game_id,
                    stat_type
                )

                if 'error' not in prediction:
                    predictions.append({
                        "athlete_id": player['athlete_id'],
                        "player_name": player['player_name'],
                        "team_id": player['team_id'],
                        "team_name": player['team_name'],
                        "game_id": game_id,
                        "stat_type": stat_type,
                        **prediction
                    })

        return predictions

    def save_prediction(self, prediction: Dict) -> str:
        """Save prediction to database."""
        conn = self.get_connection()
        cursor = conn.cursor()

        prediction_id = f"{prediction['game_id']}_{prediction['athlete_id']}_{prediction['stat_type']}"

        cursor.execute("""
            INSERT OR REPLACE INTO predictions (
                prediction_id, athlete_id, game_id, season, stat_type,
                predicted_value, stat_prediction, vegas_line, edge,
                confidence, recommendation, model_type, factors, games_used,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            prediction_id,
            prediction['athlete_id'],
            prediction['game_id'],
            prediction.get('season', '2024'),
            prediction['stat_type'],
            prediction['prediction'],
            prediction.get('stat_prediction'),
            prediction.get('vegas_line'),
            prediction.get('edge'),
            prediction['confidence'],
            prediction.get('recommendation'),
            prediction['model_type'],
            str(prediction.get('factors', [])),
            prediction.get('games_used'),
            datetime.now().isoformat()
        ))

        conn.commit()
        conn.close()

        return prediction_id
