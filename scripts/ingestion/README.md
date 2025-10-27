# Data Ingestion Scripts

These scripts fetch data from ESPN API and store it in the database.

## Scripts

### `hourly_update.py` ⭐ Main Production Script

**Purpose:** Incremental updates for recent games and upcoming props

**Run frequency:** Every hour (automated via cron)

**What it does:**
1. Fetches completed games from last 7 days
2. Gets boxscores and play-by-play for new games
3. Fetches player props for upcoming games (next 7 days)

**Usage:**
```bash
# Manual run
cd /Users/alexkamer/nba_app
python3 scripts/ingestion/hourly_update.py

# Check logs
tail -f logs/hourly_update.log
```

**Setup cron job:**
```bash
cd /Users/alexkamer/nba_app
./scripts/cron_setup.sh
```

Or manually add to crontab:
```
0 * * * * cd /Users/alexkamer/nba_app && python3 scripts/ingestion/hourly_update.py >> logs/cron.log 2>&1
```

---

### Other Scripts

#### `fetch_upcoming_games_and_props.py`
Fetch upcoming games and their props (comprehensive)

#### `fetch_player_props.py`
Fetch props for next 7 days only

#### `fetch_all_props.py`
Fetch all props for current season

#### `fetch_historical_props.py`
Fetch historical props for past games (if available)

#### `fetch_game_odds.py`
Fetch game-level odds (spreads, totals)

## Logs

All logs are written to:
- `logs/hourly_update.log` - Script output with timestamps
- `logs/cron.log` - Cron execution log

## Database Path

Scripts use: `data/nba.db` (relative to project root)

## Error Handling

- Automatic retries for failed API requests
- Graceful handling of 404s (props not available)
- Detailed error logging with timestamps
- Database transactions for data integrity

## Performance

- Concurrent requests using ThreadPoolExecutor
- Rate limiting to avoid API throttling
- Efficient duplicate checking before inserts
- Optimized for hourly execution (~2-5 minutes)

## Monitoring

Check script health:
```bash
# View recent logs
tail -20 logs/hourly_update.log

# Check for errors
grep ERROR logs/hourly_update.log

# Monitor live
tail -f logs/hourly_update.log
```

Check cron execution:
```bash
# View cron jobs
crontab -l

# Check cron log
tail -f logs/cron.log

# Test cron job manually
cd /Users/alexkamer/nba_app && python3 scripts/ingestion/hourly_update.py
```

## Troubleshooting

**Script fails to connect to database:**
- Check database path: `data/nba.db` exists
- Verify file permissions

**No props fetched:**
- Props only available for upcoming games
- ESPN may not have published odds yet
- Check ESPN API status

**Duplicate key errors:**
- Script uses INSERT OR REPLACE
- Should auto-handle duplicates
- Check database schema

**Memory issues:**
- Reduce max_workers in ThreadPoolExecutor
- Fetch fewer games per batch
