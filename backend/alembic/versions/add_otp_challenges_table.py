"""Add OTP challenges table for secure email authentication

Revision ID: add_otp_challenges_table
Revises: add_conv_sources_and_pin
Create Date: 2026-10-22 22:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_otp_challenges_table'
down_revision: Union[str, Sequence[str], None] = 'add_conv_sources_and_pin'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'otp_challenges',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('otp_hash', sa.String(length=255), nullable=False),
        sa.Column('salt', sa.String(length=64), nullable=False),
        sa.Column('purpose', sa.String(length=50), nullable=False, server_default='login'),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('max_attempts', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('is_used', sa.Boolean(), nullable=False, server_default=sa.text('0')),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('resend_available_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('device_id', sa.String(length=100), nullable=True),
        sa.Column('device_name', sa.String(length=150), nullable=True),
        sa.Column('device_type', sa.String(length=50), nullable=True),
        sa.Column('ip_address', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_otp_challenges_user_id', 'otp_challenges', ['user_id'])
    op.create_index('ix_otp_challenges_email', 'otp_challenges', ['email'])
    op.create_index('ix_otp_challenges_expires_at', 'otp_challenges', ['expires_at'])


def downgrade() -> None:
    op.drop_index('ix_otp_challenges_expires_at', table_name='otp_challenges')
    op.drop_index('ix_otp_challenges_email', table_name='otp_challenges')
    op.drop_index('ix_otp_challenges_user_id', table_name='otp_challenges')
    op.drop_table('otp_challenges')
