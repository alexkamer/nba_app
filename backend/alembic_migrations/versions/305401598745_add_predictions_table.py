"""add_predictions_table

Revision ID: 305401598745
Revises: 001
Create Date: 2025-10-15 21:36:25.440764

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '305401598745'
down_revision: Union[str, Sequence[str], None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'predictions',
        sa.Column('prediction_id', sa.String(), nullable=False),
        sa.Column('athlete_id', sa.String(), nullable=False),
        sa.Column('game_id', sa.String(), nullable=False),
        sa.Column('season', sa.String(), nullable=False),
        sa.Column('stat_type', sa.String(), nullable=False),
        sa.Column('predicted_value', sa.Float(), nullable=False),
        sa.Column('stat_prediction', sa.Float(), nullable=True),
        sa.Column('vegas_line', sa.Float(), nullable=True),
        sa.Column('edge', sa.Float(), nullable=True),
        sa.Column('confidence', sa.String(), nullable=False),
        sa.Column('recommendation', sa.String(), nullable=True),
        sa.Column('model_type', sa.String(), nullable=False),
        sa.Column('factors', sa.JSON(), nullable=True),
        sa.Column('games_used', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('actual_value', sa.Float(), nullable=True),
        sa.Column('error', sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint('prediction_id')
    )

    op.create_index('idx_predictions_athlete', 'predictions', ['athlete_id'])
    op.create_index('idx_predictions_game', 'predictions', ['game_id'])
    op.create_index('idx_predictions_season', 'predictions', ['season'])
    op.create_index('idx_predictions_stat_type', 'predictions', ['stat_type'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_predictions_stat_type', table_name='predictions')
    op.drop_index('idx_predictions_season', table_name='predictions')
    op.drop_index('idx_predictions_game', table_name='predictions')
    op.drop_index('idx_predictions_athlete', table_name='predictions')
    op.drop_table('predictions')
