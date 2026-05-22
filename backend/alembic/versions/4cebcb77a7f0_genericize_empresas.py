"""genericize_empresas

Revision ID: 4cebcb77a7f0
Revises: 6dd0b67d50c1
Create Date: 2026-05-22 10:48:49.341886

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4cebcb77a7f0'
down_revision: Union[str, Sequence[str], None] = '6dd0b67d50c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "UPDATE empresas SET sigla = 'EMPRESA_A', nome = 'Empresa A Ltda' WHERE id = 1"
    ))
    conn.execute(sa.text(
        "UPDATE empresas SET sigla = 'EMPRESA_B', nome = 'Empresa B Ltda' WHERE id = 2"
    ))
    conn.execute(sa.text(
        "UPDATE empresas SET sigla = 'EMPRESA_C', nome = 'Empresa C Ltda' WHERE id = 3"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "UPDATE empresas SET sigla = 'TKA', nome = 'TKA Transportes e Logística LTDA' WHERE id = 1"
    ))
    conn.execute(sa.text(
        "UPDATE empresas SET sigla = 'LTK', nome = 'Landtrack Locações e Serviços LTDA' WHERE id = 2"
    ))
    conn.execute(sa.text(
        "UPDATE empresas SET sigla = 'MRD', nome = 'Meridian Gerenciamento SA' WHERE id = 3"
    ))
