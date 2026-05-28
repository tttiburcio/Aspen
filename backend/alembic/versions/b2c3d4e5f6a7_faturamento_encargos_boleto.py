"""faturamento_mensal: add multa_pct, juros_pct, dias_protesto for boleto charges

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-28

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = [c['name'] for c in inspector.get_columns('faturamento_mensal')]
    for col_name, col_type in [
        ('multa_pct',     sa.Numeric(6, 2)),
        ('juros_pct',     sa.Numeric(6, 4)),
        ('dias_protesto', sa.Integer()),
    ]:
        if col_name not in existing:
            op.add_column('faturamento_mensal', sa.Column(col_name, col_type, nullable=True))


def downgrade() -> None:
    for col in ('multa_pct', 'juros_pct', 'dias_protesto'):
        op.drop_column('faturamento_mensal', col)
