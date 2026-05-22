"""consolidate_legacy_migrations

Revision ID: 6dd0b67d50c1
Revises: 5e1da27b0b4e
Create Date: 2026-05-22

Idempotent consolidation of all ad-hoc migration functions previously in
services/migration.py and database._migrate_add_columns(). Safe to run on
both fresh and existing databases.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '6dd0b67d50c1'
down_revision: Union[str, Sequence[str], None] = '5e1da27b0b4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_col(conn, table: str, col_name: str, col_def: str) -> None:
    existing = [r[1] for r in conn.execute(sa.text(f"PRAGMA table_info('{table}')")).fetchall()]
    if col_name not in existing:
        conn.execute(sa.text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"))


def upgrade() -> None:
    conn = op.get_bind()

    # contratos
    for col, typedef in [
        ("forma_pagamento", "VARCHAR(20)"),
        ("multa_pct",       "NUMERIC(6,2)"),
        ("juros_pct",       "NUMERIC(6,4)"),
        ("dias_protesto",   "INTEGER"),
        ("medicoes_total",  "INTEGER"),
        ("assinado",        "BOOLEAN DEFAULT 0"),
    ]:
        _add_col(conn, "contratos", col, typedef)

    # contrato_veiculo
    _add_col(conn, "contrato_veiculo", "valor_mensal", "NUMERIC(14,2)")

    # frota
    _add_col(conn, "frota", "restricoes", "TEXT")
    _add_col(conn, "frota", "renavam", "TEXT")

    # rastreamento
    for col, typedef in [
        ("empresa_rastreamento",  "VARCHAR(100)"),
        ("numero_contrato",       "VARCHAR(50)"),
        ("modelo_rastreador",     "VARCHAR(100)"),
        ("tem_bloqueador",        "BOOLEAN DEFAULT 0"),
        ("data_inicio",           "DATE"),
        ("observacoes",           "TEXT"),
        ("valor_mensal",          "NUMERIC(14,2)"),
        ("valor_total_contrato",  "NUMERIC(14,2)"),
        ("dias_sem_sinal",        "INTEGER DEFAULT 0"),
        ("dia_vencimento",        "INTEGER"),
    ]:
        _add_col(conn, "rastreamento", col, typedef)

    # reembolsos
    for col, typedef in [
        ("tipo",               "VARCHAR(80)"),
        ("id_empresa",         "INTEGER"),
        ("id_contrato",        "INTEGER"),
        ("id_cliente",         "INTEGER"),
        ("id_ord_serv",        "VARCHAR(50)"),
        ("id_multa",           "INTEGER"),
        ("recibo",             "VARCHAR(50)"),
        ("vencimento",         "DATE"),
        ("empresa",            "VARCHAR(200)"),
        ("data_entrada",       "DATE"),
        ("valor_recebido",     "NUMERIC(14,2)"),
        ("encargos",           "NUMERIC(14,2)"),
        ("forma_recebimento",  "VARCHAR(50)"),
        ("status_recebimento", "VARCHAR(30)"),
        ("descricao",          "TEXT"),
        ("documento_rede",     "VARCHAR(100)"),
        ("criado_em",          "DATETIME"),
        ("categoria",          "VARCHAR(50)"),
        ("placas_json",        "TEXT"),
        ("fatura_mes",         "VARCHAR(7)"),
        ("numero_os",          "VARCHAR(50)"),
        ("ids_multa_json",     "TEXT"),
    ]:
        _add_col(conn, "reembolsos", col, typedef)

    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_reimb_emissao ON reembolsos(emissao)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_reimb_veiculo ON reembolsos(id_veiculo)"))

    # multas
    for col, typedef in [
        ("comunicado_enviado", "INTEGER DEFAULT 0"),
        ("data_comunicado",    "DATE"),
    ]:
        _add_col(conn, "multas", col, typedef)

    # faturamento_mensal
    for col, typedef in [
        ("aliquota_imposto",  "NUMERIC(5,2)  DEFAULT 11.33"),
        ("valor_imposto",     "NUMERIC(14,2)"),
        ("valor_liquido",     "NUMERIC(14,2)"),
        ("status_imposto",    "VARCHAR(20)   DEFAULT 'Pendente'"),
        ("data_pgto_imposto", "DATE"),
        ("encargo_imposto",   "NUMERIC(14,2)"),
        ("forma_pagamento",   "VARCHAR(50)"),
        ("numero_fatura",     "INTEGER"),
    ]:
        _add_col(conn, "faturamento_mensal", col, typedef)

    conn.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_fat_empresa_numero "
        "ON faturamento_mensal(id_empresa, numero_fatura) "
        "WHERE numero_fatura IS NOT NULL"
    ))

    conn.execute(sa.text("""
        UPDATE faturamento_mensal
        SET aliquota_imposto = 11.33,
            valor_imposto    = ROUND(valor_locacoes * 11.33 / 100.0, 2),
            valor_liquido    = ROUND(valor_locacoes - (valor_locacoes * 11.33 / 100.0), 2),
            status_imposto   = 'Pendente'
        WHERE valor_imposto IS NULL AND valor_locacoes IS NOT NULL
    """))

    # manutencao_parcelas
    for col, typedef in [
        ("data_vencimento_original", "DATE"),
        ("prorrogada",               "BOOLEAN DEFAULT 0"),
        ("isento_encargos",          "BOOLEAN"),
        ("tipo_pgto_prorrogacao",    "VARCHAR(20)"),
        ("chave_pix",                "VARCHAR(100)"),
        ("multa_pct",                "NUMERIC(6,2)"),
        ("juros_diario_pct",         "NUMERIC(6,4)"),
        ("data_prevista_pagamento",  "DATE"),
        ("dias_cartorio",            "INTEGER"),
        ("valor_atualizado",         "NUMERIC(14,2)"),
        ("sera_reembolsado",         "BOOLEAN DEFAULT 0"),
        ("valor_reembolso",          "NUMERIC(14,2)"),
        ("qtd_itens_reembolso",      "INTEGER"),
        ("motivo_reembolso",         "TEXT"),
        ("fornecedor",               "VARCHAR(120)"),
        ("valor_item_total",         "NUMERIC(14,2)"),
        ("tipo_custo",               "VARCHAR(30)"),
        ("nf_id",                    "INTEGER REFERENCES notas_fiscais(id)"),
        ("deletado_em",              "DATETIME"),
    ]:
        _add_col(conn, "manutencao_parcelas", col, typedef)

    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_parcela_nf ON manutencao_parcelas(nf_id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_parcela_venc ON manutencao_parcelas(data_vencimento)"))

    # os_itens / ordens_servico / seguro_veiculo
    _add_col(conn, "os_itens",        "categoria",          "VARCHAR(30)")
    _add_col(conn, "ordens_servico",  "status_execucao",    "VARCHAR(40)")
    _add_col(conn, "ordens_servico",  "descricao_pendente", "TEXT")
    _add_col(conn, "seguro_veiculo",  "cobre_implemento",   "BOOLEAN NOT NULL DEFAULT 0")


def downgrade() -> None:
    # Column removal on SQLite requires full table recreation; omitted for consolidation.
    pass
