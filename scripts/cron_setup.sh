#!/bin/bash
# Cron job setup for NBA data updates
# This script helps configure cron jobs for automated data updates

echo "NBA App - Cron Job Setup"
echo "========================"
echo ""

# Get the absolute path to the project
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
echo "Project directory: $PROJECT_DIR"
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is not installed"
    exit 1
fi

echo "Current crontab:"
crontab -l 2>/dev/null || echo "(No crontab configured)"
echo ""

echo "Recommended cron schedule:"
echo ""
echo "# Hourly data update (every hour)"
echo "0 * * * * cd $PROJECT_DIR && python3 scripts/ingestion/hourly_update.py >> logs/cron.log 2>&1"
echo ""
echo "# Daily full update (every day at 6 AM)"
echo "0 6 * * * cd $PROJECT_DIR && python3 scripts/ingestion/daily_full_update.py >> logs/cron.log 2>&1"
echo ""

read -p "Would you like to add the hourly update to crontab? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Add the hourly cron job
    (crontab -l 2>/dev/null; echo "0 * * * * cd $PROJECT_DIR && python3 scripts/ingestion/hourly_update.py >> logs/cron.log 2>&1") | crontab -
    echo "✓ Hourly update cron job added!"
    echo ""
    echo "Current crontab:"
    crontab -l
else
    echo "Skipped adding cron job"
    echo ""
    echo "To manually add the cron job, run:"
    echo "  crontab -e"
    echo ""
    echo "Then add this line:"
    echo "  0 * * * * cd $PROJECT_DIR && python3 scripts/ingestion/hourly_update.py >> logs/cron.log 2>&1"
fi

echo ""
echo "Note: Make sure the logs directory exists:"
echo "  mkdir -p $PROJECT_DIR/logs"
echo ""
echo "To view cron logs:"
echo "  tail -f $PROJECT_DIR/logs/cron.log"
echo "  tail -f $PROJECT_DIR/logs/hourly_update.log"
