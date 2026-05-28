"""fat_unitario: add id_fatura for invoice traceability

Revision ID: a1b2c3d4e5f6
Revises: 4cebcb77a7f0
Create Date: 2026-05-27

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '4cebcb77a7f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fat_unitario', sa.Column('id_fatura', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('fat_unitario', 'id_fatura')
