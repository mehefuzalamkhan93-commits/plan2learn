"""Add citations column to ai_messages

Revision ID: add_citations_column
Revises: add_notebooks_and_sources
Create Date: 2026-10-12 14:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_citations_column'
down_revision: Union[str, Sequence[str], None] = 'add_notebooks_and_sources'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = [c['name'] for c in insp.get_columns('ai_messages')]
    if 'citations' not in cols:
        with op.batch_alter_table('ai_messages', schema=None) as batch_op:
            batch_op.add_column(sa.Column('citations', sa.JSON(), nullable=True))



def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('ai_messages', schema=None) as batch_op:
        batch_op.drop_column('citations')