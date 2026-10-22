"""Add conversation sources and pin columns

Revision ID: add_conv_sources_and_pin
Revises: add_google_drive_tables
Create Date: 2026-10-22 14:15:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_conv_sources_and_pin'
down_revision: Union[str, Sequence[str], None] = 'add_google_drive_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add is_pinned, custom_title to ai_conversations and create conversation_sources table."""
    with op.batch_alter_table('ai_conversations', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default=sa.text('0'))
        )
        batch_op.add_column(
            sa.Column('custom_title', sa.Boolean(), nullable=False, server_default=sa.text('0'))
        )

    op.create_table(
        'conversation_sources',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('conversation_id', sa.String(length=36), sa.ForeignKey('ai_conversations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source_id', sa.String(length=36), sa.ForeignKey('sources.id', ondelete='CASCADE'), nullable=False),
        sa.Column('is_selected', sa.Boolean(), nullable=False, server_default=sa.text('1')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_conversation_sources_conversation_id', 'conversation_sources', ['conversation_id'])
    op.create_index('ix_conversation_sources_source_id', 'conversation_sources', ['source_id'])


def downgrade() -> None:
    """Drop conversation_sources table and columns from ai_conversations."""
    op.drop_index('ix_conversation_sources_source_id', table_name='conversation_sources')
    op.drop_index('ix_conversation_sources_conversation_id', table_name='conversation_sources')
    op.drop_table('conversation_sources')

    with op.batch_alter_table('ai_conversations', schema=None) as batch_op:
        batch_op.drop_column('custom_title')
        batch_op.drop_column('is_pinned')
