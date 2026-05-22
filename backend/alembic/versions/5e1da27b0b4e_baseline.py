"""baseline

Revision ID: 5e1da27b0b4e
Revises:
Create Date: 2026-05-22 10:36:23.556771

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5e1da27b0b4e'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
