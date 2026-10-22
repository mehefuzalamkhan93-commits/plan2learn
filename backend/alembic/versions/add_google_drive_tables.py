"""Add Google Drive OAuth accounts and OAuth state tables

Revision ID: add_google_drive_tables
Revises: add_conv_title_style
Create Date: 2026-10-21 12:00:00.000000

Stores encrypted OAuth tokens per application user and single-use
state tokens for CSRF protection in the authorization-code flow.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_google_drive_tables'
down_revision: Union[str, Sequence[str], None] = 'add_conv_title_style'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create google_oauth_states and google_drive_accounts tables."""
    op.create_table(
        'google_oauth_states',
        sa.Column('state', sa.String(length=64), primary_key=True),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used', sa.Boolean(), nullable=False, server_default=sa.text('0')),
    )
    op.create_index('ix_google_oauth_states_user_id', 'google_oauth_states', ['user_id'])

    op.create_table(
        'google_drive_accounts',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('google_email', sa.String(length=255), nullable=True),
        sa.Column('access_token_encrypted', sa.Text(), nullable=True),
        sa.Column('refresh_token_encrypted', sa.Text(), nullable=True),
        sa.Column('token_expiry', sa.DateTime(timezone=True), nullable=True),
        sa.Column('scopes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='active'),
        sa.Column('meta_info', sa.JSON(), nullable=True),
        sa.Column('connected_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_google_drive_accounts_user_id', 'google_drive_accounts', ['user_id'], unique=True)


def downgrade() -> None:
    """Drop Google Drive integration tables."""
    op.drop_index('ix_google_drive_accounts_user_id', table_name='google_drive_accounts')
    op.drop_table('google_drive_accounts')
    op.drop_index('ix_google_oauth_states_user_id', table_name='google_oauth_states')
    op.drop_table('google_oauth_states')
