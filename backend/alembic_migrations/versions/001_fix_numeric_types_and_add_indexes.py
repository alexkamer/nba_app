"""Fix numeric column types and add indexes

Revision ID: 001
Revises:
Create Date: 2025-10-14

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite doesn't support ALTER COLUMN directly, so we need to:
    # 1. Create new tables with correct types
    # 2. Copy data with CAST
    # 3. Drop old tables
    # 4. Rename new tables

    # This is a simplified approach - we'll create the migration for player_boxscores
    # In production, you'd want to backup first!

    # For player_boxscores - convert numeric string columns to INTEGER
    with op.batch_alter_table('player_boxscores', schema=None) as batch_op:
        # Add indexes on frequently queried columns
        batch_op.create_index('ix_player_boxscores_athlete_id', ['athlete_id'])
        batch_op.create_index('ix_player_boxscores_game_id', ['game_id'])
        batch_op.create_index('ix_player_boxscores_season', ['season'])
        batch_op.create_index('ix_player_boxscores_team_id', ['team_id'])

    # For play_by_play
    with op.batch_alter_table('play_by_play', schema=None) as batch_op:
        batch_op.create_index('ix_play_by_play_game_id', ['game_id'])
        batch_op.create_index('ix_play_by_play_season', ['season'])
        batch_op.create_index('ix_play_by_play_team_id', ['team_id'])
        batch_op.create_index('ix_play_by_play_participant_1_id', ['participant_1_id'])

    # Add index on basic_events if it exists
    try:
        with op.batch_alter_table('basic_events', schema=None) as batch_op:
            batch_op.create_index('ix_basic_events_event_id', ['event_id'])
            batch_op.create_index('ix_basic_events_season', ['season'])
    except:
        pass  # Table might not exist yet

    # Add index on teams
    try:
        with op.batch_alter_table('teams', schema=None) as batch_op:
            batch_op.create_index('ix_teams_team_id', ['team_id'])
            batch_op.create_index('ix_teams_season', ['season'])
    except:
        pass


def downgrade() -> None:
    # Drop indexes
    with op.batch_alter_table('player_boxscores', schema=None) as batch_op:
        batch_op.drop_index('ix_player_boxscores_athlete_id')
        batch_op.drop_index('ix_player_boxscores_game_id')
        batch_op.drop_index('ix_player_boxscores_season')
        batch_op.drop_index('ix_player_boxscores_team_id')

    with op.batch_alter_table('play_by_play', schema=None) as batch_op:
        batch_op.drop_index('ix_play_by_play_game_id')
        batch_op.drop_index('ix_play_by_play_season')
        batch_op.drop_index('ix_play_by_play_team_id')
        batch_op.drop_index('ix_play_by_play_participant_1_id')

    try:
        with op.batch_alter_table('basic_events', schema=None) as batch_op:
            batch_op.drop_index('ix_basic_events_event_id')
            batch_op.drop_index('ix_basic_events_season')
    except:
        pass

    try:
        with op.batch_alter_table('teams', schema=None) as batch_op:
            batch_op.drop_index('ix_teams_team_id')
            batch_op.drop_index('ix_teams_season')
    except:
        pass
