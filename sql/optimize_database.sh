#!/bin/bash

# Database optimization script
# Run this to speed up ChatBot queries

echo "Optimizing NBA database for ChatBot performance..."

DB_PATH="/Users/alexkamer/nba_app/data/nba.db"

echo "Step 1: Adding indexes..."
sqlite3 "$DB_PATH" < add_indexes.sql
echo "✓ Indexes added"

echo "Step 2: Creating season stats cache..."
sqlite3 "$DB_PATH" < create_season_stats_cache.sql
echo "✓ Season stats cache created"

echo "Step 3: Running VACUUM to optimize database..."
sqlite3 "$DB_PATH" "VACUUM;"
echo "✓ Database optimized"

echo ""
echo "Optimization complete! Expected improvements:"
echo "  - Gamelog queries: 15s → 3-5s"
echo "  - Season stats queries: 10s → 2-3s"
echo "  - Database size reduced and defragmented"
echo ""
echo "Note: Re-run this script after adding new game data to refresh the cache."
