"""
Enhanced NBA Player Stat Prediction Engine

Incorporates advanced features:
- Home/Away splits
- Starter status impact
- Shot share / usage rate
- Teammate injuries (star player out = usage bump)
- Historical prop lines (Vegas knows!)
- Pace adjustments
"""

import sqlite3
import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional


class EnhancedPlayerStatPredictor:
    def __init__(self, db_path: str = "../../data/nba.db"):
        self.conn = sqlite3.connect(db_path)

    def get_player_game_log(
        self,
        athlete_id: str,
        season: str,
        before_game_id: str = None,
        include_context: bool = True
    ) -> pd.DataFrame:
        """Get player's game log with contextual information."""
        query = """
        SELECT
            pb.game_id,
            pb.season,
            pb.athlete_id,
            pb.team_id,
            pb.athlete_starter,
            pb.minutes,
            CAST(pb.points AS FLOAT) as points,
            CAST(pb.rebounds AS FLOAT) as rebounds,
            CAST(pb.assists AS FLOAT) as assists,
            CAST(pb.steals AS FLOAT) as steals,
            CAST(pb.blocks AS FLOAT) as blocks,
            CAST(pb.turnovers AS FLOAT) as turnovers,
            pb.fieldGoalsMade_fieldGoalsAttempted,
            pb.athlete_didNotPlay,
            be.date,
            tb.home_team_id,
            tb.away_team_id,
            CASE
                WHEN pb.team_id = tb.home_team_id THEN 1
                ELSE 0
            END as is_home
        FROM player_boxscores pb
        JOIN basic_events be ON pb.game_id = be.event_id
        LEFT JOIN team_boxscores tb ON pb.game_id = tb.game_id
        WHERE pb.athlete_id = ?
        AND pb.season = ?
        AND pb.athlete_didNotPlay = '0'
        AND pb.minutes IS NOT NULL
        AND pb.minutes != '0'
        ORDER BY be.date ASC
        """

        df = pd.read_sql_query(query, self.conn, params=(athlete_id, season))

        # Parse FG attempts to calculate shot share
        if include_context and not df.empty:
            df['fga'] = df['fieldGoalsMade_fieldGoalsAttempted'].apply(
                lambda x: int(x.split('-')[1]) if x and '-' in str(x) else 0
            )

        # If before_game_id specified, only include games before that one
        if before_game_id and before_game_id in df['game_id'].values:
            game_idx = df[df['game_id'] == before_game_id].index[0]
            df = df.iloc[:game_idx]

        return df

    def get_team_shot_share(self, game_id: str, team_id: str) -> float:
        """Get total team field goal attempts for a game."""
        query = """
        SELECT SUM(
            CAST(
                CASE
                    WHEN fieldGoalsMade_fieldGoalsAttempted LIKE '%-%'
                    THEN SUBSTR(fieldGoalsMade_fieldGoalsAttempted,
                               INSTR(fieldGoalsMade_fieldGoalsAttempted, '-') + 1)
                    ELSE '0'
                END AS FLOAT
            )
        ) as team_fga
        FROM player_boxscores
        WHERE game_id = ?
        AND team_id = ?
        AND athlete_didNotPlay = '0'
        """

        result = pd.read_sql_query(query, self.conn, params=(game_id, team_id))
        return result['team_fga'].iloc[0] if not result.empty else 100.0

    def get_missing_teammates(self, game_id: str, team_id: str, season: str) -> List[str]:
        """
        Identify star players who were absent from this game.
        Uses season averages to identify 'star' players (>15 PPG starters).
        """
        query = """
        WITH season_averages AS (
            SELECT
                pb.athlete_id,
                AVG(CAST(pb.points AS FLOAT)) as avg_points,
                AVG(CAST(pb.minutes AS FLOAT)) as avg_minutes,
                COUNT(*) as games_played
            FROM player_boxscores pb
            WHERE pb.team_id = ?
            AND pb.season = ?
            AND pb.athlete_didNotPlay = '0'
            AND pb.minutes IS NOT NULL
            GROUP BY pb.athlete_id
            HAVING games_played >= 5
        ),
        game_participants AS (
            SELECT athlete_id
            FROM player_boxscores
            WHERE game_id = ?
            AND team_id = ?
            AND athlete_didNotPlay = '0'
        )
        SELECT sa.athlete_id, sa.avg_points
        FROM season_averages sa
        WHERE sa.avg_points > 15
        AND sa.avg_minutes > 25
        AND sa.athlete_id NOT IN (SELECT athlete_id FROM game_participants)
        """

        result = pd.read_sql_query(
            query,
            self.conn,
            params=(team_id, season, game_id, team_id)
        )

        return result['athlete_id'].tolist() if not result.empty else []

    def get_prop_line_history(
        self,
        athlete_id: str,
        stat_type: str,
        season: str,
        before_date: str = None
    ) -> pd.DataFrame:
        """Get historical prop lines for a player."""
        # Map stat types to prop_type
        prop_type_mapping = {
            'points': 'Total Points',
            'rebounds': 'Total Rebounds',
            'assists': 'Total Assists',
            'steals': 'Total Steals',
            'blocks': 'Total Blocks'
        }

        if stat_type not in prop_type_mapping:
            return pd.DataFrame()

        query = """
        SELECT
            pp.game_id,
            pp.prop_type,
            CAST(pp.line AS FLOAT) as prop_line,
            be.date
        FROM player_props pp
        JOIN basic_events be ON pp.game_id = be.event_id
        WHERE pp.athlete_id = ?
        AND pp.prop_type = ?
        AND pp.season = ?
        ORDER BY be.date ASC
        """

        df = pd.read_sql_query(
            query,
            self.conn,
            params=(athlete_id, prop_type_mapping[stat_type], season)
        )

        if before_date and not df.empty:
            df = df[df['date'] < before_date]

        return df

    def calculate_weighted_average(
        self,
        values: pd.Series,
        weights: str = 'exponential'
    ) -> float:
        """Calculate weighted average with more weight on recent games."""
        if len(values) == 0:
            return 0.0

        values = values.dropna()
        if len(values) == 0:
            return 0.0

        if weights == 'exponential':
            decay = 0.15
            w = np.exp(-decay * np.arange(len(values))[::-1])
        else:
            w = np.arange(1, len(values) + 1)

        w = w / w.sum()
        return np.average(values, weights=w)

    def predict_stat(
        self,
        athlete_id: str,
        game_id: str,
        stat_type: str,
        n_recent_games: int = 10
    ) -> Dict:
        """
        Enhanced prediction incorporating multiple contextual factors.
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
        game_date = game_info['date'].iloc[0]

        # Get player's game log with context
        game_log = self.get_player_game_log(
            athlete_id,
            season,
            before_game_id=game_id,
            include_context=True
        )

        if len(game_log) == 0:
            return {"error": "No prior games found", "prediction": None}

        # Determine if player is on home or away team for this game
        player_team_query = """
        SELECT team_id FROM player_boxscores
        WHERE athlete_id = ? AND game_id = ?
        """
        player_team = pd.read_sql_query(
            player_team_query,
            self.conn,
            params=(athlete_id, game_id)
        )

        if player_team.empty:
            return {"error": "Player not in game", "prediction": None}

        player_team_id = player_team['team_id'].iloc[0]
        is_home_game = player_team_id == game_info['home_team_id'].iloc[0]

        # Get stat values
        stat_values = game_log[stat_type].tail(n_recent_games)

        if len(stat_values) == 0:
            return {"error": "No stat data available", "prediction": None}

        # ===== BASELINE: Weighted average =====
        baseline = self.calculate_weighted_average(stat_values)

        # ===== ADJUSTMENT 1: Recent form =====
        season_avg = game_log[stat_type].mean()
        recent_5 = stat_values.tail(5).mean() if len(stat_values) >= 5 else baseline
        recent_form_adj = (recent_5 - season_avg) * 0.20

        # ===== ADJUSTMENT 2: Home/Away splits =====
        home_games = game_log[game_log['is_home'] == 1][stat_type]
        away_games = game_log[game_log['is_home'] == 0][stat_type]

        home_avg = home_games.mean() if len(home_games) >= 3 else baseline
        away_avg = away_games.mean() if len(away_games) >= 3 else baseline

        if is_home_game and len(home_games) >= 3:
            home_away_adj = (home_avg - season_avg) * 0.15
        elif not is_home_game and len(away_games) >= 3:
            home_away_adj = (away_avg - season_avg) * 0.15
        else:
            home_away_adj = 0

        # ===== ADJUSTMENT 3: Starter status =====
        # Check if player typically starts
        starter_rate = game_log['athlete_starter'].astype(int).mean()
        starter_games = game_log[game_log['athlete_starter'] == '1'][stat_type]
        bench_games = game_log[game_log['athlete_starter'] == '0'][stat_type]

        if len(starter_games) >= 5 and len(bench_games) >= 3:
            starter_avg = starter_games.mean()
            bench_avg = bench_games.mean()
            starter_impact = starter_avg - bench_avg

            # Apply adjustment based on typical role
            if starter_rate > 0.7:  # Regular starter
                starter_adj = starter_impact * 0.10
            elif starter_rate < 0.3:  # Regular bench
                starter_adj = -starter_impact * 0.10
            else:
                starter_adj = 0
        else:
            starter_adj = 0

        # ===== ADJUSTMENT 4: Shot share / Usage =====
        recent_games_with_fga = game_log.tail(n_recent_games)
        shot_shares = []

        for _, game_row in recent_games_with_fga.iterrows():
            team_fga = self.get_team_shot_share(game_row['game_id'], game_row['team_id'])
            if team_fga > 0 and game_row['fga'] > 0:
                shot_share = game_row['fga'] / team_fga
                shot_shares.append(shot_share)

        avg_shot_share = np.mean(shot_shares) if shot_shares else 0.20

        # High usage players get a boost
        if avg_shot_share > 0.25:  # Star player (>25% of team shots)
            usage_adj = baseline * 0.05
        elif avg_shot_share > 0.20:  # Secondary option
            usage_adj = baseline * 0.02
        else:
            usage_adj = 0

        # ===== ADJUSTMENT 5: Missing teammates (injury bump) =====
        missing_teammates = self.get_missing_teammates(
            game_id,
            player_team_id,
            season
        )

        if len(missing_teammates) > 0 and avg_shot_share > 0.15:
            # If star teammates are out, usage goes up
            injury_adj = baseline * 0.08 * len(missing_teammates)
        else:
            injury_adj = 0

        # ===== ADJUSTMENT 6: Historical prop lines (Vegas baseline) =====
        prop_history = self.get_prop_line_history(
            athlete_id,
            stat_type,
            season,
            before_date=game_date
        )

        if not prop_history.empty and len(prop_history) >= 3:
            recent_prop_avg = prop_history.tail(5)['prop_line'].mean()
            # Vegas lines are sharp - use them as a sanity check
            # If our prediction is way off from Vegas, pull it closer
            vegas_adj = (recent_prop_avg - baseline) * 0.15
        else:
            vegas_adj = 0

        # ===== FINAL PREDICTION =====
        prediction = (
            baseline +
            recent_form_adj +
            home_away_adj +
            starter_adj +
            usage_adj +
            injury_adj +
            vegas_adj
        )

        # ===== CONFIDENCE CALCULATION =====
        std_dev = stat_values.std()
        mean = stat_values.mean()
        cv = std_dev / mean if mean > 0 else 1

        # More data = more confidence
        data_confidence = min(len(stat_values) / 15, 1.0)
        consistency_confidence = 1 - min(cv, 1.0)

        overall_confidence = (data_confidence + consistency_confidence) / 2

        if overall_confidence > 0.7:
            confidence = "High"
        elif overall_confidence > 0.5:
            confidence = "Medium"
        else:
            confidence = "Low"

        # ===== BUILD FACTORS EXPLANATION =====
        factors = [
            f"Season avg: {season_avg:.1f} {stat_type}",
            f"Weighted recent avg: {baseline:.1f}",
            f"Recent form (L5): {recent_5:.1f} ({'+' if recent_form_adj > 0 else ''}{recent_form_adj:.1f})",
            f"{'Home' if is_home_game else 'Away'} game: ({'+' if home_away_adj > 0 else ''}{home_away_adj:.1f})",
            f"Usage rate: {avg_shot_share*100:.1f}% shots ({'+' if usage_adj > 0 else ''}{usage_adj:.1f})",
        ]

        if injury_adj != 0:
            factors.append(f"Teammates out: +{injury_adj:.1f}")

        if vegas_adj != 0 and not prop_history.empty:
            recent_prop = prop_history.tail(1)['prop_line'].iloc[0]
            factors.append(f"Vegas line: {recent_prop:.1f} ({'+' if vegas_adj > 0 else ''}{vegas_adj:.1f})")

        return {
            "prediction": round(prediction, 1),
            "confidence": confidence,
            "baseline": round(baseline, 1),
            "season_avg": round(season_avg, 1),
            "is_home": is_home_game,
            "shot_share": round(avg_shot_share * 100, 1),
            "missing_teammates": len(missing_teammates),
            "games_used": len(stat_values),
            "factors": factors,
            "adjustments": {
                "recent_form": round(recent_form_adj, 2),
                "home_away": round(home_away_adj, 2),
                "starter": round(starter_adj, 2),
                "usage": round(usage_adj, 2),
                "injury": round(injury_adj, 2),
                "vegas": round(vegas_adj, 2)
            }
        }

    def test_predictions(self, n_tests: int = 100, stat_type: str = 'points') -> pd.DataFrame:
        """Test enhanced prediction algorithm on historical games."""
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
        AND pb.season = '2024'
        ORDER BY RANDOM()
        LIMIT ?
        """.format(stat_type, stat_type, stat_type)

        test_games = pd.read_sql_query(query, self.conn, params=(n_tests,))
        results = []

        print(f"\n{'='*80}")
        print(f"Testing {len(test_games)} ENHANCED predictions for {stat_type.upper()}")
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
                    'games_used': prediction_result['games_used'],
                    'is_home': prediction_result.get('is_home', None),
                    'shot_share': prediction_result.get('shot_share', 0)
                })

                # Print sample predictions
                if idx < 10:
                    home_away = "H" if prediction_result.get('is_home') else "A"
                    print(f"{row['player_name']:<25} {home_away} | Pred: {predicted:>5.1f} | Actual: {actual:>5.1f} | Err: {error:>4.1f} | {prediction_result['confidence']}")

        return pd.DataFrame(results)

    def analyze_accuracy(self, results_df: pd.DataFrame):
        """Analyze and display accuracy metrics."""
        if len(results_df) == 0:
            print("No results to analyze")
            return

        print(f"\n{'='*80}")
        print("ENHANCED ALGORITHM - ACCURACY METRICS")
        print(f"{'='*80}\n")

        mae = results_df['error'].mean()
        rmse = np.sqrt((results_df['error'] ** 2).mean())
        mape = results_df['percentage_error'].mean()

        print(f"Mean Absolute Error (MAE):       {mae:.2f}")
        print(f"Root Mean Squared Error (RMSE):  {rmse:.2f}")
        print(f"Mean Absolute % Error (MAPE):    {mape:.1f}%")

        within_3 = (results_df['error'] <= 3).sum() / len(results_df) * 100
        within_5 = (results_df['error'] <= 5).sum() / len(results_df) * 100
        within_7 = (results_df['error'] <= 7).sum() / len(results_df) * 100

        print(f"\nPredictions within ±3:           {within_3:.1f}%")
        print(f"Predictions within ±5:           {within_5:.1f}%")
        print(f"Predictions within ±7:           {within_7:.1f}%")

        print(f"\n{'Confidence Level':<20} {'Count':<10} {'Avg Error':<15} {'Within ±5'}")
        print("-" * 60)
        for conf in ['High', 'Medium', 'Low']:
            conf_data = results_df[results_df['confidence'] == conf]
            if len(conf_data) > 0:
                avg_error = conf_data['error'].mean()
                within_5_pct = (conf_data['error'] <= 5).sum() / len(conf_data) * 100
                print(f"{conf:<20} {len(conf_data):<10} {avg_error:<15.2f} {within_5_pct:.1f}%")

        # Home vs Away accuracy
        if 'is_home' in results_df.columns:
            print(f"\n{'Location':<20} {'Count':<10} {'Avg Error':<15} {'Within ±5'}")
            print("-" * 60)
            for is_home, label in [(True, 'Home'), (False, 'Away')]:
                loc_data = results_df[results_df['is_home'] == is_home]
                if len(loc_data) > 0:
                    avg_error = loc_data['error'].mean()
                    within_5_pct = (loc_data['error'] <= 5).sum() / len(loc_data) * 100
                    print(f"{label:<20} {len(loc_data):<10} {avg_error:<15.2f} {within_5_pct:.1f}%")

        print(f"\n{'='*80}")
        print("BEST PREDICTIONS")
        print(f"{'='*80}")
        best = results_df.nsmallest(5, 'error')[['player_name', 'predicted', 'actual', 'error']]
        print(best.to_string(index=False))

        print(f"\n{'='*80}")
        print("WORST PREDICTIONS")
        print(f"{'='*80}")
        worst = results_df.nlargest(5, 'error')[['player_name', 'predicted', 'actual', 'error']]
        print(worst.to_string(index=False))

    def close(self):
        self.conn.close()


def main():
    """Run enhanced prediction tests and compare to baseline."""
    predictor = EnhancedPlayerStatPredictor()

    # Test points
    print("\n" + "="*80)
    print("ENHANCED PLAYER POINTS PREDICTION")
    print("="*80)
    results = predictor.test_predictions(n_tests=100, stat_type='points')
    predictor.analyze_accuracy(results)

    # Test rebounds
    print("\n\n" + "="*80)
    print("ENHANCED PLAYER REBOUNDS PREDICTION")
    print("="*80)
    rebounds_results = predictor.test_predictions(n_tests=100, stat_type='rebounds')
    predictor.analyze_accuracy(rebounds_results)

    # Test assists
    print("\n\n" + "="*80)
    print("ENHANCED PLAYER ASSISTS PREDICTION")
    print("="*80)
    assists_results = predictor.test_predictions(n_tests=100, stat_type='assists')
    predictor.analyze_accuracy(assists_results)

    predictor.close()

    print("\n" + "="*80)
    print("✓ Enhanced prediction testing complete!")
    print("="*80)


if __name__ == "__main__":
    main()
