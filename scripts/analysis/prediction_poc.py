"""
Proof of Concept: NBA Player Stat Prediction Engine

This script tests a statistical prediction algorithm against historical data
to validate accuracy before building the full production system.
"""

import sqlite3
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, List, Tuple


class PlayerStatPredictor:
    def __init__(self, db_path: str = "../../data/nba.db"):
        self.conn = sqlite3.connect(db_path)

    def get_player_game_log(self, athlete_id: str, season: str, before_game_id: str = None) -> pd.DataFrame:
        """Get player's game log for a season, optionally up to a specific game."""
        query = """
        SELECT
            pb.game_id,
            pb.season,
            pb.athlete_id,
            pb.minutes,
            CAST(pb.points AS FLOAT) as points,
            CAST(pb.rebounds AS FLOAT) as rebounds,
            CAST(pb.assists AS FLOAT) as assists,
            CAST(pb.steals AS FLOAT) as steals,
            CAST(pb.blocks AS FLOAT) as blocks,
            CAST(pb.turnovers AS FLOAT) as turnovers,
            pb.athlete_didNotPlay,
            be.date
        FROM player_boxscores pb
        JOIN basic_events be ON pb.game_id = be.event_id
        WHERE pb.athlete_id = ?
        AND pb.season = ?
        AND pb.athlete_didNotPlay = '0'
        AND pb.minutes IS NOT NULL
        AND pb.minutes != '0'
        ORDER BY be.date ASC
        """

        df = pd.read_sql_query(query, self.conn, params=(athlete_id, season))

        # If before_game_id specified, only include games before that one
        if before_game_id and before_game_id in df['game_id'].values:
            game_idx = df[df['game_id'] == before_game_id].index[0]
            df = df.iloc[:game_idx]

        return df

    def get_opponent_defensive_rating(self, game_id: str, opponent_team_id: str, stat_type: str) -> float:
        """Get opponent's defensive rating for specific stat type."""
        # Map stat types to defensive columns
        stat_mapping = {
            'points': 'points',
            'rebounds': 'totalRebounds',
            'assists': 'assists',
            'steals': 'steals',
            'blocks': 'blocks'
        }

        if stat_type not in stat_mapping:
            return 1.0  # neutral adjustment

        # Get opponent's season average for allowed stats
        query = f"""
        SELECT
            AVG(CAST(CASE
                WHEN tb.home_team_id = ? THEN tb.away_{stat_mapping[stat_type]}
                WHEN tb.away_team_id = ? THEN tb.home_{stat_mapping[stat_type]}
            END AS FLOAT)) as avg_allowed
        FROM team_boxscores tb
        WHERE (tb.home_team_id = ? OR tb.away_team_id = ?)
        AND tb.season = (SELECT season FROM basic_events WHERE event_id = ?)
        """

        result = pd.read_sql_query(
            query,
            self.conn,
            params=(opponent_team_id, opponent_team_id, opponent_team_id, opponent_team_id, game_id)
        )

        # Return relative to league average (normalized)
        return result['avg_allowed'].iloc[0] if not result.empty else 100.0

    def calculate_weighted_average(self, values: pd.Series, weights: str = 'exponential') -> float:
        """Calculate weighted average with more weight on recent games."""
        if len(values) == 0:
            return 0.0

        values = values.dropna()
        if len(values) == 0:
            return 0.0

        if weights == 'exponential':
            # Exponential decay: more recent games weighted much more heavily
            decay = 0.15
            w = np.exp(-decay * np.arange(len(values))[::-1])
        else:  # linear
            w = np.arange(1, len(values) + 1)

        w = w / w.sum()  # normalize
        return np.average(values, weights=w)

    def predict_stat(
        self,
        athlete_id: str,
        game_id: str,
        stat_type: str,
        n_recent_games: int = 10
    ) -> Dict:
        """
        Predict a player's stat for a specific game.

        Returns:
            Dict with prediction, confidence, and factors
        """
        # Get the game details
        game_query = """
        SELECT be.season, be.date, tb.home_team_id, tb.away_team_id
        FROM basic_events be
        LEFT JOIN team_boxscores tb ON be.event_id = tb.game_id
        WHERE be.event_id = ?
        """
        game_info = pd.read_sql_query(game_query, self.conn, params=(game_id,))

        if game_info.empty:
            return {"error": "Game not found"}

        season = game_info['season'].iloc[0]

        # Get player's game log before this game
        game_log = self.get_player_game_log(athlete_id, season, before_game_id=game_id)

        if len(game_log) == 0:
            return {"error": "No prior games found", "prediction": None}

        # Get the stat values
        stat_values = game_log[stat_type].tail(n_recent_games)

        if len(stat_values) == 0:
            return {"error": "No stat data available", "prediction": None}

        # Calculate baseline (weighted average of recent games)
        baseline = self.calculate_weighted_average(stat_values)

        # Calculate season average for comparison
        season_avg = game_log[stat_type].mean()

        # Recent form adjustment (last 5 games vs season average)
        recent_5 = stat_values.tail(5).mean()
        recent_form_adj = (recent_5 - season_avg) * 0.25 if len(stat_values) >= 5 else 0

        # Confidence calculation based on consistency
        std_dev = stat_values.std()
        mean = stat_values.mean()
        coefficient_of_variation = std_dev / mean if mean > 0 else 1

        # Confidence: Low CV = high confidence
        if coefficient_of_variation < 0.3:
            confidence = "High"
        elif coefficient_of_variation < 0.5:
            confidence = "Medium"
        else:
            confidence = "Low"

        # Final prediction
        prediction = baseline + recent_form_adj

        # Build factors explanation
        factors = [
            f"Season average: {season_avg:.1f}",
            f"Last {min(len(stat_values), n_recent_games)} games: {baseline:.1f}",
            f"Recent form (L5): {recent_5:.1f} ({'+' if recent_form_adj > 0 else ''}{recent_form_adj:.1f})",
            f"Consistency: {confidence} (CV: {coefficient_of_variation:.2f})"
        ]

        return {
            "prediction": round(prediction, 1),
            "confidence": confidence,
            "baseline": round(baseline, 1),
            "season_avg": round(season_avg, 1),
            "recent_5_avg": round(recent_5, 1),
            "games_used": len(stat_values),
            "factors": factors
        }

    def test_predictions(self, n_tests: int = 100, stat_type: str = 'points') -> pd.DataFrame:
        """
        Test prediction algorithm on historical games.

        Args:
            n_tests: Number of random games to test
            stat_type: Stat to predict (points, rebounds, assists, etc.)
        """
        # Get random sample of games with player stats
        query = """
        SELECT
            pb.game_id,
            pb.athlete_id,
            pb.season,
            CAST(pb.{} AS FLOAT) as actual_value,
            be.date,
            a.athlete_display_name as player_name
        FROM player_boxscores pb
        JOIN basic_events be ON pb.game_id = be.event_id
        JOIN athletes a ON pb.athlete_id = a.athlete_id
        WHERE pb.athlete_didNotPlay = '0'
        AND pb.minutes IS NOT NULL
        AND pb.minutes != '0'
        AND pb.{} IS NOT NULL
        AND CAST(pb.{} AS FLOAT) > 0
        AND pb.season = '2024'  -- Focus on recent season
        ORDER BY RANDOM()
        LIMIT ?
        """.format(stat_type, stat_type, stat_type)

        test_games = pd.read_sql_query(query, self.conn, params=(n_tests,))

        results = []

        print(f"\n{'='*80}")
        print(f"Testing {len(test_games)} predictions for {stat_type.upper()}")
        print(f"{'='*80}\n")

        for idx, row in test_games.iterrows():
            prediction_result = self.predict_stat(
                row['athlete_id'],
                row['game_id'],
                stat_type
            )

            if 'error' not in prediction_result and prediction_result['prediction'] is not None:
                actual = row['actual_value']
                predicted = prediction_result['prediction']
                error = abs(actual - predicted)

                results.append({
                    'player_name': row['player_name'],
                    'game_id': row['game_id'],
                    'date': row['date'],
                    'actual': actual,
                    'predicted': predicted,
                    'error': error,
                    'percentage_error': (error / actual * 100) if actual > 0 else 0,
                    'confidence': prediction_result['confidence'],
                    'games_used': prediction_result['games_used']
                })

                # Print sample predictions
                if idx < 10:
                    print(f"{row['player_name']:<25} | Predicted: {predicted:>5.1f} | Actual: {actual:>5.1f} | Error: {error:>4.1f} | {prediction_result['confidence']}")

        results_df = pd.DataFrame(results)
        return results_df

    def analyze_accuracy(self, results_df: pd.DataFrame):
        """Analyze and display accuracy metrics."""
        if len(results_df) == 0:
            print("No results to analyze")
            return

        print(f"\n{'='*80}")
        print("ACCURACY METRICS")
        print(f"{'='*80}\n")

        # Overall metrics
        mae = results_df['error'].mean()
        rmse = np.sqrt((results_df['error'] ** 2).mean())
        mape = results_df['percentage_error'].mean()

        print(f"Mean Absolute Error (MAE):       {mae:.2f}")
        print(f"Root Mean Squared Error (RMSE):  {rmse:.2f}")
        print(f"Mean Absolute % Error (MAPE):    {mape:.1f}%")

        # Within X points accuracy
        within_3 = (results_df['error'] <= 3).sum() / len(results_df) * 100
        within_5 = (results_df['error'] <= 5).sum() / len(results_df) * 100
        within_7 = (results_df['error'] <= 7).sum() / len(results_df) * 100

        print(f"\nPredictions within ±3:           {within_3:.1f}%")
        print(f"Predictions within ±5:           {within_5:.1f}%")
        print(f"Predictions within ±7:           {within_7:.1f}%")

        # By confidence level
        print(f"\n{'Confidence Level':<20} {'Count':<10} {'Avg Error':<15} {'Within ±5'}")
        print("-" * 60)
        for conf in ['High', 'Medium', 'Low']:
            conf_data = results_df[results_df['confidence'] == conf]
            if len(conf_data) > 0:
                avg_error = conf_data['error'].mean()
                within_5_pct = (conf_data['error'] <= 5).sum() / len(conf_data) * 100
                print(f"{conf:<20} {len(conf_data):<10} {avg_error:<15.2f} {within_5_pct:.1f}%")

        # Best and worst predictions
        print(f"\n{'='*80}")
        print("BEST PREDICTIONS (Smallest Error)")
        print(f"{'='*80}")
        best = results_df.nsmallest(5, 'error')[['player_name', 'predicted', 'actual', 'error']]
        print(best.to_string(index=False))

        print(f"\n{'='*80}")
        print("WORST PREDICTIONS (Largest Error)")
        print(f"{'='*80}")
        worst = results_df.nlargest(5, 'error')[['player_name', 'predicted', 'actual', 'error']]
        print(worst.to_string(index=False))

    def close(self):
        """Close database connection."""
        self.conn.close()


def main():
    """Run the proof of concept test."""
    predictor = PlayerStatPredictor()

    # Test points predictions
    print("\n" + "="*80)
    print("PLAYER POINTS PREDICTION - PROOF OF CONCEPT")
    print("="*80)

    results = predictor.test_predictions(n_tests=100, stat_type='points')
    predictor.analyze_accuracy(results)

    # Test rebounds predictions
    print("\n\n" + "="*80)
    print("PLAYER REBOUNDS PREDICTION - PROOF OF CONCEPT")
    print("="*80)

    rebounds_results = predictor.test_predictions(n_tests=100, stat_type='rebounds')
    predictor.analyze_accuracy(rebounds_results)

    # Test assists predictions
    print("\n\n" + "="*80)
    print("PLAYER ASSISTS PREDICTION - PROOF OF CONCEPT")
    print("="*80)

    assists_results = predictor.test_predictions(n_tests=100, stat_type='assists')
    predictor.analyze_accuracy(assists_results)

    predictor.close()

    print("\n" + "="*80)
    print("✓ Proof of concept complete!")
    print("="*80)


if __name__ == "__main__":
    main()
