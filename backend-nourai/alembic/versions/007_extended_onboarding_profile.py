"""Add extended onboarding profile fields to user_profiles"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user_profiles', sa.Column('sleep_quality', sa.String(20), nullable=True))
    op.add_column('user_profiles', sa.Column('activity_level', sa.String(20), nullable=True))
    op.add_column('user_profiles', sa.Column('dietary_pattern', postgresql.JSONB(), nullable=False, server_default='[]'))
    op.add_column('user_profiles', sa.Column('environment', sa.String(20), nullable=True))
    op.add_column('user_profiles', sa.Column('product_categories', postgresql.JSONB(), nullable=False, server_default='[]'))


def downgrade() -> None:
    op.drop_column('user_profiles', 'product_categories')
    op.drop_column('user_profiles', 'environment')
    op.drop_column('user_profiles', 'dietary_pattern')
    op.drop_column('user_profiles', 'activity_level')
    op.drop_column('user_profiles', 'sleep_quality')
