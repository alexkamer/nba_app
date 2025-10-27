# NBA Player Props Prediction Methodology

## Overview
Our prediction system uses a **Vegas+ Hybrid Model** that combines professional betting lines with statistical analysis to predict player performance.

## How It Works

### Model Architecture

```
Final Prediction = Vegas Line (65%) + Statistical Model (35%)
```

When Vegas lines are not available, we use 100% statistical prediction.

### Statistical Model Components

#### 1. Weighted Moving Average (Baseline)
- Uses last 10 games (configurable)
- **Exponential decay weighting**: Recent games weighted more heavily
- Formula: `weight = e^(-0.15 * games_ago)`
- Most recent game gets ~87% more weight than 10 games ago

**Code Location:** `backend/services/prediction_engine.py:calculate_weighted_average()`

#### 2. Recent Form Adjustment
- Compares last 5 games average to season average
- Weight: 25% of the difference
- Formula: `(Last5Avg - SeasonAvg) × 0.25`
- Captures hot/cold streaks

**Code Location:** `backend/services/prediction_engine.py:calculate_statistical_prediction()`

#### 3. Confidence Scoring
Based on consistency (coefficient of variation):
- **High**: CV < 0.3 (player is consistent)
- **Medium**: CV 0.3-0.5 (moderate variance)
- **Low**: CV > 0.5 (inconsistent performance)

Formula: `CV = std_deviation / mean`

### What Data We Use

#### Included:
✅ Regular season games only (type = 2)
✅ Games where player actually played (DNP = 0)
✅ Games with recorded minutes > 0
✅ Historical prop lines from ESPN BET

#### Excluded:
❌ Preseason games
❌ Playoff games
❌ Play-in tournament games
❌ Games where player did not play
❌ Games with 0 minutes

### Prediction Process (Step-by-Step)

1. **Query player's game log** (regular season only)
2. **Calculate baseline** using weighted moving average
3. **Calculate season average** for comparison
4. **Calculate recent form** (last 5 games)
5. **Apply form adjustment** (25% weight)
6. **Retrieve Vegas prop line** (if available)
7. **Blend predictions**: 65% Vegas + 35% Stats
8. **Calculate edge**: Our prediction - Vegas line
9. **Determine confidence** based on consistency
10. **Generate recommendation**: Over/Under/Pass

### Recommendation Logic

```python
if abs(edge) < 1.0:
    recommendation = "Pass"
elif disagreement < 10%:  # High confidence
    recommendation = "Over" if edge > 0 else "Under"
elif disagreement < 20%:  # Medium confidence
    recommendation = "Over" if edge > 1.5 else ("Under" if edge < -1.5 else "Pass")
else:  # Low confidence (>20% disagreement)
    recommendation = "Pass"  # Don't bet against Vegas with low confidence
```

## Accuracy Metrics (Based on 2024 Season Testing)

### Points Predictions
- **Within ±3 points**: 47%
- **Within ±5 points**: 57%
- **Within ±7 points**: 72%
- **Mean Absolute Error**: 5.2 points
- **High Confidence Accuracy**: 83% within ±5

### Rebounds Predictions
- **Within ±3 rebounds**: 81%
- **Within ±5 rebounds**: 95%
- **Within ±7 rebounds**: 97%
- **Mean Absolute Error**: 2.0 rebounds
- **High Confidence Accuracy**: 92% within ±5

### Assists Predictions
- **Within ±3 assists**: 84%
- **Within ±5 assists**: 98%
- **Within ±7 assists**: 99%
- **Mean Absolute Error**: 1.5 assists
- **High Confidence Accuracy**: 100% within ±5

### Vegas Comparison
We achieve **~47% win rate** against Vegas lines, which is expected since Vegas lines are extremely sharp. The value comes from:
1. **Identifying trends Vegas lags on** (recent form changes)
2. **High confidence predictions** (when stats agree with Vegas)
3. **Large edges** (when we strongly disagree = potential value)

## When Predictions Fail

### Common Failure Cases:
1. **Injury DNPs**: Player injured during game
2. **Blowouts**: Starters sit 4th quarter
3. **Coach's decision**: Unexpected minutes reduction
4. **Rookie/new role**: Limited historical data
5. **Outlier performances**: Career nights or complete duds

### Worst Prediction Examples (from testing):
- Zion Williamson: Predicted 31.0, Actual 4.0 (likely injury)
- Paul Reed: Predicted 4.6, Actual 30.0 (bench player breakout with stars out)
- Dejounte Murray: Predicted 27.0, Actual 44.0 (outlier performance)

## API Endpoints

```
GET /api/predictions/sample
  - Returns: Recent predictions with Vegas lines
  - Use: Quick demonstration of model

GET /api/predictions/edges
  - Returns: Biggest disagreements with Vegas
  - Use: Finding potential betting value

GET /api/predictions/player/{id}/game/{id}
  - Returns: Predictions for specific player in specific game
  - Use: Deep dive on one player

GET /api/predictions/game/{id}
  - Returns: All predictions for a game
  - Use: Game-level analysis
```

## Code Structure

```
backend/
├── services/
│   └── prediction_engine.py       # Core prediction logic
├── api/
│   └── routes/
│       └── predictions.py         # API endpoints
└── alembic_migrations/
    └── versions/
        └── 305401598745_add_predictions_table.py  # Database schema

frontend/
├── src/
│   ├── pages/
│   │   └── Predictions.tsx        # UI
│   └── lib/
│       └── api.ts                 # API client
```

## Future Improvements

### Potential Enhancements:
1. **Home/Away splits**: Adjust for player home court advantage
2. **Opponent defense**: Adjust based on opponent's defensive rating
3. **Pace adjustment**: Account for team pace differences
4. **Usage rate**: Factor in shot share and usage
5. **Teammate injuries**: Boost prediction when stars are out
6. **Machine Learning**: Train models on larger feature sets
7. **Pre-computed predictions**: Cache for faster load times

### Why We Didn't Include These Yet:
- **Home/away split** actually hurt accuracy in testing (away games were more predictable)
- **Opponent defense** requires more complex matchup data
- **Focus on simplicity**: Easier to understand and maintain

## Testing & Validation

All predictions are tested against historical data where we know the actual results. Our testing methodology:

1. **Backtesting**: Use games from 2024 season
2. **Time-series split**: Never use future data to predict past
3. **Random sampling**: Test on 100-150 games per stat type
4. **Accuracy metrics**: MAE, RMSE, within-threshold percentages
5. **Vegas comparison**: Track how often we beat Vegas lines

**Test Scripts:**
- `prediction_poc.py`: Basic model testing
- `prediction_enhanced.py`: Advanced features testing
- `prediction_vegas_plus.py`: Final hybrid model testing

## Responsible Use

### This Tool Is For:
✅ **Educational purposes**: Understanding player performance
✅ **Entertainment**: Analyzing prop betting lines
✅ **Research**: Testing prediction strategies

### Important Disclaimers:
⚠️ **Not financial advice**: These are statistical predictions, not guarantees
⚠️ **Vegas is sharp**: Professional oddsmakers are extremely accurate
⚠️ **Gambling risks**: Never bet more than you can afford to lose
⚠️ **Edge is small**: Even our best predictions have uncertainty

## Questions or Issues?

- See implementation: `backend/services/prediction_engine.py`
- Run tests: `python prediction_vegas_plus.py`
- Check accuracy: Look at test output for detailed metrics
