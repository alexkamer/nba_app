"""
Vegas+ Hybrid Prediction Model

Strategy: Trust Vegas lines as the foundation, add value with statistical trends
- When prop line exists: 65% Vegas + 35% Stats
- When no prop line: 100% Stats (basic model)
- Focus on finding "edges" where we have an information advantage
"""

import sqlite3
import pandas as pd
import numpy as np
from typing import Dict, Optional


class VegasPlusPredictor:
    def __init__(self, db_path: str = "../../data/nba.db"):
        self.conn = sqlite3.connect(db_path)

    def get_player_game_log(
        self,
        athlete_id: str,
        season: str,
        before_game_id: str = None
    ) -> pd.DataFrame:
        """Get player's recent game performance."""
        query = """
        SELECT
            pb.game_id,
            pb.season,
            pb.athlete_id,
            CAST(pb.points AS FLOAT) as points,
            CAST(pb.rebounds AS FLOAT) as rebounds,
            CAST(pb.assists AS FLOAT) as assists,
            CAST(pb.steals AS FLOAT) as steals,
            CAST(pb.blocks AS FLOAT) as blocks,
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

        if before_game_id and before_game_id in df['game_id'].values:
            game_idx = df[df['game_id'] == before_game_id].index[0]
            df = df.iloc[:game_idx]

        return df

    def get_prop_line(
        self,
        athlete_id: str,
        game_id: str,
        stat_type: str
    ) -> Optional[float]:
        """Get Vegas prop line for this game."""
        prop_type_mapping = {
            'points': 'Total Points',
            'rebounds': 'Total Rebounds',
            'assists': 'Total Assists',
            'steals': 'Total Steals',
            'blocks': 'Total Blocks'
        }

        if stat_type not in prop_type_mapping:
            return None

        query = """
        SELECT CAST(line AS FLOAT) as prop_line
        FROM player_props
        WHERE athlete_id = ?
        AND game_id = ?
        AND prop_type = ?
        LIMIT 1
        """

        result = pd.read_sql_query(
            query,
            self.conn,
            params=(athlete_id, game_id, prop_type_mapping[stat_type])
        )

        return result['prop_line'].iloc[0] if not result.empty else None

    def calculate_weighted_average(
        self,
        values: pd.Series,
        n_recent: int = 10
    ) -> float:
        """Calculate weighted average favoring recent games."""
        if len(values) == 0:
            return 0.0

        values = values.dropna().tail(n_recent)
        if len(values) == 0:
            return 0.0

        # Exponential decay weighting
        decay = 0.15
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
        """Pure statistical prediction (no Vegas)."""
        game_log = self.get_player_game_log(athlete_id, season, before_game_id=game_id)

        if len(game_log) < 3:
            return {
                "prediction": None,
                "confidence": "Low",
                "error": "Insufficient data"
            }

        stat_values = game_log[stat_type]

        # Baseline: weighted average of last 10 games
        baseline = self.calculate_weighted_average(stat_values, n_recent=10)

        # Recent trend: last 5 vs season average
        season_avg = stat_values.mean()
        recent_5 = stat_values.tail(5).mean() if len(stat_values) >= 5 else baseline
        trend_adj = (recent_5 - season_avg) * 0.25  # 25% weight on hot/cold streaks

        prediction = baseline + trend_adj

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
            "games_used": len(stat_values)
        }

    def predict_stat(
        self,
        athlete_id: str,
        game_id: str,
        stat_type: str
    ) -> Dict:
        """
        Vegas+ Hybrid Prediction

        Returns prediction, confidence, and edge vs Vegas
        """
        # Get game info
        game_query = """
        SELECT season FROM basic_events WHERE event_id = ?
        """
        game_info = pd.read_sql_query(game_query, self.conn, params=(game_id,))

        if game_info.empty:
            return {"error": "Game not found"}

        season = game_info['season'].iloc[0]

        # Get Vegas line
        vegas_line = self.get_prop_line(athlete_id, game_id, stat_type)

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
        if vegas_line is not None:
            # Vegas+ Model: Trust Vegas but adjust for recent trends
            vegas_weight = 0.65
            stat_weight = 0.35

            final_prediction = (vegas_line * vegas_weight) + (stat_pred_value * stat_weight)

            # Calculate edge: how much do we differ from Vegas?
            edge = final_prediction - vegas_line

            # Confidence: High if stats agree with Vegas, Low if major disagreement
            disagreement = abs(edge) / vegas_line if vegas_line > 0 else 0

            if disagreement < 0.10:  # Within 10%
                confidence = "High"
                recommendation = "Pass" if abs(edge) < 1.0 else ("Over" if edge > 0 else "Under")
            elif disagreement < 0.20:  # 10-20% difference
                confidence = "Medium"
                recommendation = "Over" if edge > 1.5 else ("Under" if edge < -1.5 else "Pass")
            else:  # >20% difference
                confidence = "Low"
                recommendation = "Pass"  # Don't bet against Vegas with low confidence

            factors = [
                f"Vegas line: {vegas_line:.1f}",
                f"Statistical prediction: {stat_pred_value:.1f}",
                f"Recent form (L5): {stat_prediction['recent_5']:.1f}",
                f"Season average: {stat_prediction['season_avg']:.1f}",
                f"Edge vs Vegas: {'+' if edge > 0 else ''}{edge:.1f}"
            ]

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
            # No Vegas line: fall back to pure statistical model
            return {
                "prediction": round(stat_pred_value, 1),
                "vegas_line": None,
                "stat_prediction": round(stat_pred_value, 1),
                "edge": None,
                "confidence": stat_prediction["confidence"],
                "recommendation": "No Line Available",
                "model_type": "Statistical Only",
                "factors": [
                    f"Statistical prediction: {stat_pred_value:.1f}",
                    f"Recent form (L5): {stat_prediction['recent_5']:.1f}",
                    f"Season average: {stat_prediction['season_avg']:.1f}",
                ],
                "games_used": stat_prediction["games_used"]
            }

    def test_predictions(self, n_tests: int = 100, stat_type: str = 'points') -> pd.DataFrame:
        """Test Vegas+ model on historical games with prop lines."""
        query = """
        SELECT
            pp.game_id,
            pp.athlete_id,
            CAST(pb.{} AS FLOAT) as actual_value,
            be.date,
            be.season,
            a.athlete_display_name as player_name,
            CAST(pp.line AS FLOAT) as vegas_line
        FROM player_props pp
        JOIN player_boxscores pb ON pp.game_id = pb.game_id AND pp.athlete_id = pb.athlete_id
        JOIN basic_events be ON pp.game_id = be.event_id
        JOIN athletes a ON pp.athlete_id = a.athlete_id
        WHERE pp.prop_type = ?
        AND pb.athlete_didNotPlay = '0'
        AND pb.{} IS NOT NULL
        AND CAST(pb.{} AS FLOAT) > 0
        AND be.season = '2024'
        ORDER BY RANDOM()
        LIMIT ?
        """.format(stat_type, stat_type, stat_type)

        prop_type_mapping = {
            'points': 'Total Points',
            'rebounds': 'Total Rebounds',
            'assists': 'Total Assists'
        }

        test_games = pd.read_sql_query(
            query,
            self.conn,
            params=(prop_type_mapping[stat_type], n_tests)
        )

        results = []

        print(f"\n{'='*90}")
        print(f"Testing {len(test_games)} VEGAS+ predictions for {stat_type.upper()}")
        print(f"{'='*90}\n")
        print(f"{'Player':<25} | {'Vegas':<6} | {'Pred':<6} | {'Actual':<6} | {'Edge':<6} | {'Err':<5} | Conf")
        print("-" * 90)

        for idx, row in test_games.iterrows():
            prediction_result = self.predict_stat(
                row['athlete_id'],
                row['game_id'],
                stat_type
            )

            if 'error' not in prediction_result and prediction_result['prediction'] is not None:
                actual = row['actual_value']
                predicted = prediction_result['prediction']
                vegas = row['vegas_line']
                error = abs(actual - predicted)
                vegas_error = abs(actual - vegas)
                edge = prediction_result.get('edge', 0)

                # Did we beat Vegas?
                beat_vegas = error < vegas_error

                results.append({
                    'player_name': row['player_name'],
                    'game_id': row['game_id'],
                    'date': row['date'],
                    'actual': actual,
                    'predicted': predicted,
                    'vegas_line': vegas,
                    'error': error,
                    'vegas_error': vegas_error,
                    'beat_vegas': beat_vegas,
                    'edge': edge,
                    'confidence': prediction_result['confidence'],
                    'recommendation': prediction_result.get('recommendation', 'N/A')
                })

                # Print sample
                if idx < 15:
                    beat_indicator = "✓" if beat_vegas else " "
                    print(f"{row['player_name']:<25} | {vegas:<6.1f} | {predicted:<6.1f} | {actual:<6.1f} | {edge:<+6.1f} | {error:<5.1f} | {prediction_result['confidence']:<6} {beat_indicator}")

        return pd.DataFrame(results)

    def analyze_accuracy(self, results_df: pd.DataFrame):
        """Analyze Vegas+ performance and compare to Vegas."""
        if len(results_df) == 0:
            print("No results to analyze")
            return

        print(f"\n{'='*90}")
        print("VEGAS+ MODEL PERFORMANCE")
        print(f"{'='*90}\n")

        # Our model accuracy
        our_mae = results_df['error'].mean()
        our_rmse = np.sqrt((results_df['error'] ** 2).mean())

        # Vegas accuracy
        vegas_mae = results_df['vegas_error'].mean()
        vegas_rmse = np.sqrt((results_df['vegas_error'] ** 2).mean())

        # How often we beat Vegas
        beat_vegas_pct = (results_df['beat_vegas'].sum() / len(results_df)) * 100

        print(f"{'Metric':<30} {'Vegas+ Model':<15} {'Vegas Baseline':<15} {'Improvement'}")
        print("-" * 90)
        print(f"{'Mean Absolute Error':<30} {our_mae:<15.2f} {vegas_mae:<15.2f} {vegas_mae - our_mae:+.2f}")
        print(f"{'Root Mean Squared Error':<30} {our_rmse:<15.2f} {vegas_rmse:<15.2f} {vegas_rmse - our_rmse:+.2f}")
        print(f"{'Beat Vegas %':<30} {beat_vegas_pct:<15.1f}%")

        # Accuracy thresholds
        print(f"\n{'Threshold':<20} {'Vegas+ Model':<20} {'Vegas Baseline':<20}")
        print("-" * 60)
        for threshold in [3, 5, 7]:
            our_pct = (results_df['error'] <= threshold).sum() / len(results_df) * 100
            vegas_pct = (results_df['vegas_error'] <= threshold).sum() / len(results_df) * 100
            print(f"{'Within ±' + str(threshold):<20} {our_pct:<20.1f}% {vegas_pct:<20.1f}%")

        # By confidence level
        print(f"\n{'Confidence':<20} {'Count':<10} {'Avg Error':<15} {'Beat Vegas %':<15}")
        print("-" * 60)
        for conf in ['High', 'Medium', 'Low']:
            conf_data = results_df[results_df['confidence'] == conf]
            if len(conf_data) > 0:
                avg_error = conf_data['error'].mean()
                beat_pct = (conf_data['beat_vegas'].sum() / len(conf_data)) * 100
                print(f"{conf:<20} {len(conf_data):<10} {avg_error:<15.2f} {beat_pct:<15.1f}%")

        # Edge analysis
        print(f"\n{'='*90}")
        print("EDGE ANALYSIS (When to bet)")
        print(f"{'='*90}\n")

        # Positive edge (we predict over Vegas)
        positive_edge = results_df[results_df['edge'] > 2.0]
        if len(positive_edge) > 0:
            pos_edge_win_rate = (positive_edge['actual'] > positive_edge['vegas_line']).sum() / len(positive_edge) * 100
            print(f"Positive Edge (+2.0 or more): {len(positive_edge)} cases")
            print(f"  'Over' hit rate: {pos_edge_win_rate:.1f}%")

        # Negative edge (we predict under Vegas)
        negative_edge = results_df[results_df['edge'] < -2.0]
        if len(negative_edge) > 0:
            neg_edge_win_rate = (negative_edge['actual'] < negative_edge['vegas_line']).sum() / len(negative_edge) * 100
            print(f"Negative Edge (-2.0 or less): {len(negative_edge)} cases")
            print(f"  'Under' hit rate: {neg_edge_win_rate:.1f}%")

        print(f"\n{'='*90}")
        print("BEST PREDICTIONS (Smallest Error)")
        print(f"{'='*90}")
        best = results_df.nsmallest(5, 'error')[['player_name', 'vegas_line', 'predicted', 'actual', 'error']]
        print(best.to_string(index=False))

        print(f"\n{'='*90}")
        print("BIGGEST EDGES (Where we disagreed most with Vegas)")
        print(f"{'='*90}")
        results_df['abs_edge'] = results_df['edge'].abs()
        biggest_edges = results_df.nlargest(5, 'abs_edge')[['player_name', 'vegas_line', 'predicted', 'actual', 'edge']]
        print(biggest_edges.to_string(index=False))

    def close(self):
        self.conn.close()


def main():
    """Run Vegas+ tests."""
    predictor = VegasPlusPredictor()

    # Test points
    print("\n" + "="*90)
    print("VEGAS+ MODEL: POINTS PREDICTIONS")
    print("="*90)
    points_results = predictor.test_predictions(n_tests=150, stat_type='points')
    predictor.analyze_accuracy(points_results)

    # Test rebounds
    print("\n\n" + "="*90)
    print("VEGAS+ MODEL: REBOUNDS PREDICTIONS")
    print("="*90)
    rebounds_results = predictor.test_predictions(n_tests=150, stat_type='rebounds')
    predictor.analyze_accuracy(rebounds_results)

    # Test assists
    print("\n\n" + "="*90)
    print("VEGAS+ MODEL: ASSISTS PREDICTIONS")
    print("="*90)
    assists_results = predictor.test_predictions(n_tests=150, stat_type='assists')
    predictor.analyze_accuracy(assists_results)

    predictor.close()

    print("\n" + "="*90)
    print("✓ Vegas+ testing complete!")
    print("="*90)


if __name__ == "__main__":
    main()
