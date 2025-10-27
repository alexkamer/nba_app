# Hourly Update Script Setup

## Overview

The `hourly_update.py` script automatically keeps your NBA database fresh with:
- Recent completed games (last 7 days)
- Boxscores and play-by-play for new games
- Player props for upcoming games (next 7 days)

## Quick Start

### 1. Test the Script

```bash
cd /Users/alexkamer/nba_app
uv run python scripts/ingestion/hourly_update.py
```

You should see output like:
```
================================================================================
STARTING HOURLY NBA DATA UPDATE
================================================================================
Connected to database: .../data/nba.db
Fetching recent completed games from ESPN API...
Found 85 completed games in last 7 days
12 games need boxscores
Fetching data for 12 new games...
Inserting 12 team boxscores...
Inserting 334 player boxscores...
Inserting 6198 plays...
Game data inserted successfully
Found 55 upcoming games for props
Fetching props for 55 upcoming games...
Inserting 5937 props...
Props inserted successfully
================================================================================
HOURLY UPDATE COMPLETED SUCCESSFULLY
================================================================================
```

### 2. Setup Cron Job

#### Option A: Automated Setup (Recommended)
```bash
cd /Users/alexkamer/nba_app
./scripts/cron_setup.sh
```

#### Option B: Manual Setup
```bash
crontab -e
```

Add this line:
```
0 * * * * cd /Users/alexkamer/nba_app && uv run python scripts/ingestion/hourly_update.py >> logs/cron.log 2>&1
```

This runs the script **every hour at minute 0** (1:00, 2:00, 3:00, etc.)

### 3. Verify Cron Job

```bash
# List current cron jobs
crontab -l

# Monitor live execution
tail -f /Users/alexkamer/nba_app/logs/hourly_update.log

# Check cron execution log
tail -f /Users/alexkamer/nba_app/logs/cron.log
```

## Performance

**Test Run Results:**
- Duration: ~20 seconds
- Games processed: 12 new completed games
- Props fetched: 5,937 props for 55 upcoming games
- Concurrent requests: 5 workers
- Memory efficient: Streaming inserts

## What Gets Updated

### Completed Games
- Scans last 7 days for completed games
- Checks which games don't have boxscores in DB
- Fetches team/player boxscores and play-by-play
- Only fetches NEW games (skips existing)

### Player Props
- Fetches props for games in next 7 days
- Updates existing props if lines change
- Handles pagination (500 props per page)
- Skips games with no props available (404s are normal)

## Logs

Two log files are created:

1. **`logs/hourly_update.log`** - Detailed script output
   - Timestamps for each operation
   - API requests and responses
   - Errors and warnings
   - Success confirmations

2. **`logs/cron.log`** - Cron execution log
   - When cron ran the script
   - Exit codes
   - Any cron-specific errors

## Error Handling

The script is robust with:
- ✅ Automatic retries (2 attempts) for failed API requests
- ✅ Graceful handling of 404s (props not yet available)
- ✅ Database transaction rollback on errors
- ✅ Detailed error logging with stack traces
- ✅ No crashes - continues even if some games fail

## Monitoring

### Check Script Health
```bash
# View last 50 lines
tail -50 logs/hourly_update.log

# Search for errors
grep ERROR logs/hourly_update.log

# Search for successful completions
grep "COMPLETED SUCCESSFULLY" logs/hourly_update.log

# Count games processed today
grep "Inserting.*boxscores" logs/hourly_update.log | grep "$(date +%Y-%m-%d)"
```

### Check Database Growth
```bash
# Connect to database
sqlite3 data/nba.db

# Check recent games
SELECT COUNT(*) FROM team_boxscores
WHERE game_id IN (
  SELECT event_id FROM basic_events
  WHERE date >= date('now', '-7 days')
);

# Check props for upcoming games
SELECT COUNT(*) FROM player_props
WHERE game_id IN (
  SELECT event_id FROM basic_events
  WHERE date >= date('now') AND date <= date('now', '+7 days')
);

# View latest updates
SELECT MAX(fetch_date) as last_prop_update FROM player_props;
```

## Troubleshooting

### Script Not Running
```bash
# Check cron is running
pgrep cron || sudo service cron start

# Check cron logs for errors
grep CRON /var/log/syslog

# Test manually
cd /Users/alexkamer/nba_app && uv run python scripts/ingestion/hourly_update.py
```

### No New Data
- **Normal during off-season** - No games to fetch
- **Check ESPN API** - May be down or rate limiting
- **Verify database** - Games may already be in DB

### Permission Errors
```bash
# Ensure logs directory exists
mkdir -p /Users/alexkamer/nba_app/logs

# Check file permissions
chmod +x /Users/alexkamer/nba_app/scripts/ingestion/hourly_update.py
chmod 664 /Users/alexkamer/nba_app/data/nba.db
```

### Database Locked
- Close any open connections to nba.db
- Check if notebook is running
- Restart the script

## Customization

### Change Update Frequency

**Every 30 minutes:**
```
0,30 * * * * cd /Users/alexkamer/nba_app && uv run python scripts/ingestion/hourly_update.py >> logs/cron.log 2>&1
```

**Every 2 hours:**
```
0 */2 * * * cd /Users/alexkamer/nba_app && uv run python scripts/ingestion/hourly_update.py >> logs/cron.log 2>&1
```

**Only during NBA games (7 PM - 1 AM ET):**
```
0 19-23,0-1 * * * cd /Users/alexkamer/nba_app && uv run python scripts/ingestion/hourly_update.py >> logs/cron.log 2>&1
```

### Adjust Concurrency

Edit `scripts/ingestion/hourly_update.py`:

```python
# Line ~359 - Game data fetching
with ThreadPoolExecutor(max_workers=5) as executor:  # Change 5 to desired number

# Line ~376 - Props fetching
with ThreadPoolExecutor(max_workers=5) as executor:  # Change 5 to desired number
```

Higher = faster but more API load. Keep under 10.

## Integration with Backend

The backend automatically reads from `data/nba.db`, so new data appears immediately:

```bash
# Start backend
cd backend
uv run uvicorn api.main:app --reload

# Test API
curl http://localhost:8000/api/stats/recent-games
curl http://localhost:8000/api/predictions/sample?prop_type=totalPoints
```

No restart needed - SQLite updates are instant!

## Summary

✅ Script tested and working
✅ Fetches new games every hour
✅ Updates props for upcoming games
✅ Comprehensive error handling
✅ Detailed logging
✅ Ready for production use

Run `./scripts/cron_setup.sh` to automate! 🚀
