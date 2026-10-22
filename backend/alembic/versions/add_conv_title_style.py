"""Add title and response_style columns to ai_conversations

Revision ID: add_conv_title_style
Revises: add_citations_column
Create Date: 2026-10-14 11:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_conv_title_style'
down_revision: Union[str, Sequence[str], None] = 'add_citations_column'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema non-destructively."""
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = [c['name'] for c in insp.get_columns('ai_conversations')]
    with op.batch_alter_table('ai_conversations', schema=None) as batch_op:
        if 'title' not in cols:
            batch_op.add_column(sa.Column('title', sa.String(length=255), nullable=True))
        if 'response_style' not in cols:
            batch_op.add_column(
                sa.Column('response_style', sa.String(length=50), nullable=False, server_default='friendly')
            )



def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('ai_conversations', schema=None) as batch_op:
        batch_op.drop_column('response_style')
        batch_op.drop_column('title')
