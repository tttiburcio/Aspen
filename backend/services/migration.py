"""
Legacy migration helpers — kept for reference only.
Schema migrations are now managed by Alembic (backend/alembic/versions/).
These functions are no longer called at startup.
"""
import logging
import sqlite3

from database import DB_PATH

logger = logging.getLogger("locadora")


def _migrate_contrato_pagamento():
    """Adiciona campos de forma de pagamento à tabela contratos (idempotente)."""
    con = sqlite3.connect(str(DB_PATH))
    try:
        for col in [
            "forma_pagamento VARCHAR(20)",
            "multa_pct NUMERIC(6,2)",
            "juros_pct NUMERIC(6,4)",
            "dias_protesto INTEGER",
        ]:
            try:
                con.execute(f"ALTER TABLE contratos ADD COLUMN {col}")
                con.commit()
            except Exception:
                pass
        logger.info("_migrate_contrato_pagamento: colunas adicionadas")
    finally:
        con.close()


def _migrate_contrato_veiculo_valor_mensal():
    """Adiciona valor_mensal à tabela contrato_veiculo (idempotente)."""
    con = sqlite3.connect(str(DB_PATH))
    try:
        try:
            con.execute("ALTER TABLE contrato_veiculo ADD COLUMN valor_mensal NUMERIC(14,2)")
            con.commit()
            logger.info("_migrate_contrato_veiculo_valor_mensal: coluna adicionada")
        except Exception:
            pass  # já existe
    finally:
        con.close()


def _migrate_contrato_medicoes_assinado():
    """Adiciona medicoes_total e assinado à tabela contratos (idempotente)."""
    con = sqlite3.connect(str(DB_PATH))
    try:
        for col in [
            "medicoes_total INTEGER",
            "assinado BOOLEAN DEFAULT 0",
        ]:
            try:
                con.execute(f"ALTER TABLE contratos ADD COLUMN {col}")
                con.commit()
            except Exception:
                pass
        logger.info("_migrate_contrato_medicoes_assinado: colunas adicionadas")
    finally:
        con.close()


def _migrate_frota_restricoes():
    """Adiciona coluna restricoes à tabela frota (idempotente)."""
    con = sqlite3.connect(str(DB_PATH))
    try:
        try:
            con.execute("ALTER TABLE frota ADD COLUMN restricoes TEXT")
            con.commit()
            logger.info("_migrate_frota_restricoes: coluna adicionada")
        except Exception:
            pass
    finally:
        con.close()


def _migrate_frota_renavam():
    """Adiciona coluna renavam na tabela frota (idempotente)."""
    con = sqlite3.connect(str(DB_PATH))
    try:
        con.execute("ALTER TABLE frota ADD COLUMN renavam TEXT")
        con.commit()
        logger.info("_migrate_frota_renavam: renavam adicionada")
    except Exception:
        pass
    finally:
        con.close()


def _migrate_rastreamento_fields():
    """Adiciona/expande campos do rastreamento (idempotente)."""
    con = sqlite3.connect(str(DB_PATH))
    try:
        for col, typedef in [
            ("empresa_rastreamento", "VARCHAR(100)"),
            ("numero_contrato",      "VARCHAR(50)"),
            ("modelo_rastreador",    "VARCHAR(100)"),
            ("tem_bloqueador",       "BOOLEAN DEFAULT 0"),
            ("data_inicio",         "DATE"),
            ("observacoes",         "TEXT"),
            ("valor_mensal",        "NUMERIC(14,2)"),
            ("valor_total_contrato","NUMERIC(14,2)"),
            ("dias_sem_sinal",      "INTEGER DEFAULT 0"),
        ]:
            try:
                con.execute(f"ALTER TABLE rastreamento ADD COLUMN {col} {typedef}")
                con.commit()
                logger.info(f"_migrate_rastreamento_fields: {col} adicionada")
            except Exception:
                pass
    finally:
        con.close()


def _migrate_rastreamento_dia_vencimento():
    """Adiciona coluna dia_vencimento à tabela rastreamento (idempotente)."""
    con = sqlite3.connect(str(DB_PATH))
    try:
        try:
            con.execute("ALTER TABLE rastreamento ADD COLUMN dia_vencimento INTEGER")
            con.commit()
            logger.info("_migrate_rastreamento_dia_vencimento: coluna adicionada")
        except Exception:
            pass
    finally:
        con.close()


def _migrate_rastreamento_drop_valor():
    """Remove a coluna legada `valor` da tabela rastreamento (idempotente via recriação)."""
    con = sqlite3.connect(str(DB_PATH))
    con.isolation_level = None
    try:
        # Verifica se a coluna ainda existe
        cols = [r[1] for r in con.execute("PRAGMA table_info('rastreamento')").fetchall()]
        if "valor" not in cols:
            return  # já removida

        logger.info("_migrate_rastreamento_drop_valor: recriando tabela sem coluna valor...")
        con.execute("PRAGMA foreign_keys=OFF")
        con.execute("BEGIN")
        try:
            con.execute("DROP TABLE IF EXISTS rastreamento_new")
            con.execute("""
                CREATE TABLE rastreamento_new (
                    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                    id_veiculo           INTEGER REFERENCES frota(id),
                    id_empresa           INTEGER REFERENCES empresas(id),
                    empresa_rastreamento VARCHAR(100),
                    numero_contrato      VARCHAR(50),
                    modelo_rastreador    VARCHAR(100),
                    tem_bloqueador       BOOLEAN DEFAULT 0,
                    valor_mensal         NUMERIC(14,2),
                    valor_total_contrato NUMERIC(14,2),
                    data_inicio          DATE,
                    vencimento           DATE,
                    dias_sem_sinal       INTEGER DEFAULT 0,
                    observacoes          TEXT
                )
            """)
            # Copia dados preservando valor_mensal (usa valor como fallback se valor_mensal nulo)
            con.execute("""
                INSERT INTO rastreamento_new
                    (id, id_veiculo, id_empresa, empresa_rastreamento, numero_contrato,
                     modelo_rastreador, tem_bloqueador, valor_mensal, valor_total_contrato,
                     data_inicio, vencimento, dias_sem_sinal, observacoes)
                SELECT id, id_veiculo, id_empresa, empresa_rastreamento, numero_contrato,
                       modelo_rastreador, tem_bloqueador,
                       COALESCE(valor_mensal, valor),
                       valor_total_contrato,
                       data_inicio, vencimento, dias_sem_sinal, observacoes
                FROM rastreamento
            """)
            con.execute("DROP TABLE rastreamento")
            con.execute("ALTER TABLE rastreamento_new RENAME TO rastreamento")
            con.execute("COMMIT")
            logger.info("_migrate_rastreamento_drop_valor: coluna valor removida com sucesso")
        except Exception as e:
            con.execute("ROLLBACK")
            logger.error("Erro em _migrate_rastreamento_drop_valor: %s", e)
            raise
        finally:
            con.execute("PRAGMA foreign_keys=ON")
    finally:
        con.close()


def _migrate_reembolso_ids_multa_json():
    """Adiciona coluna ids_multa_json na tabela reembolsos (idempotente)."""
    con = sqlite3.connect(str(DB_PATH))
    try:
        con.execute("ALTER TABLE reembolsos ADD COLUMN ids_multa_json TEXT")
        con.commit()
        logger.info("_migrate_reembolso_ids_multa_json: ids_multa_json adicionada")
    except Exception:
        pass
    finally:
        con.close()


def _migrate_multa_comunicado():
    """Adiciona campos de comunicação ao cliente na tabela multas (idempotente)."""
    con = sqlite3.connect(str(DB_PATH))
    try:
        for col, typedef in [
            ("comunicado_enviado", "INTEGER DEFAULT 0"),
            ("data_comunicado",    "DATE"),
        ]:
            try:
                con.execute(f"ALTER TABLE multas ADD COLUMN {col} {typedef}")
                con.commit()
                logger.info(f"_migrate_multa_comunicado: {col} adicionada")
            except Exception:
                pass
    finally:
        con.close()


def _migrate_reembolsos_v2():
    """Expande tabela reembolsos com todos os campos da aba Excel (idempotente)."""
    con = sqlite3.connect(str(DB_PATH))
    try:
        new_cols = [
            "tipo VARCHAR(80)",
            "id_empresa INTEGER",
            "id_contrato INTEGER",
            "id_cliente INTEGER",
            "id_ord_serv VARCHAR(50)",
            "id_multa INTEGER",
            "recibo VARCHAR(50)",
            "vencimento DATE",
            "empresa VARCHAR(200)",
            "data_entrada DATE",
            "valor_recebido NUMERIC(14,2)",
            "encargos NUMERIC(14,2)",
            "forma_recebimento VARCHAR(50)",
            "status_recebimento VARCHAR(30)",
            "descricao TEXT",
            "documento_rede VARCHAR(100)",
            "criado_em DATETIME",
            "categoria VARCHAR(50)",       # mantida para compatibilidade
            "placas_json TEXT",            # JSON list de placas (múltiplos veículos)
            "fatura_mes VARCHAR(7)",       # YYYY-MM — referência de fatura para Encargo
            "numero_os VARCHAR(50)",       # OS de referência para Manutenção/Franquia
        ]
        for col_def in new_cols:
            try:
                con.execute(f"ALTER TABLE reembolsos ADD COLUMN {col_def}")
                con.commit()
            except Exception:
                pass
        # Índices
        try:
            con.execute("CREATE INDEX IF NOT EXISTS idx_reimb_emissao ON reembolsos(emissao)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_reimb_veiculo ON reembolsos(id_veiculo)")
            con.commit()
        except Exception:
            pass
    finally:
        con.close()


def _migrate_faturamento_imposto():
    """Adiciona campos de imposto sobre faturamento à tabela faturamento_mensal (idempotente)."""
    con = sqlite3.connect(str(DB_PATH))
    try:
        new_cols = [
            "aliquota_imposto  NUMERIC(5,2)  DEFAULT 11.33",
            "valor_imposto     NUMERIC(14,2)",
            "valor_liquido     NUMERIC(14,2)",
            "status_imposto    VARCHAR(20)   DEFAULT 'Pendente'",
            "data_pgto_imposto DATE",
            "encargo_imposto   NUMERIC(14,2)",
            "forma_pagamento   VARCHAR(50)",
        ]
        for col_def in new_cols:
            try:
                con.execute(f"ALTER TABLE faturamento_mensal ADD COLUMN {col_def}")
                con.commit()
            except Exception:
                pass
        # Back-fill existing rows that have no imposto yet
        con.execute("""
            UPDATE faturamento_mensal
            SET aliquota_imposto = 11.33,
                valor_imposto    = ROUND(valor_locacoes * 11.33 / 100.0, 2),
                valor_liquido    = ROUND(valor_locacoes - (valor_locacoes * 11.33 / 100.0), 2),
                status_imposto   = 'Pendente'
            WHERE valor_imposto IS NULL AND valor_locacoes IS NOT NULL
        """)
        con.commit()
        logger.info("_migrate_faturamento_imposto: colunas adicionadas / backfill concluído")
    finally:
        con.close()


def _migrate_faturamento_numero():
    """Adiciona numero_fatura à tabela faturamento_mensal e cria índice único por empresa (idempotente)."""
    con = sqlite3.connect(str(DB_PATH))
    try:
        try:
            con.execute("ALTER TABLE faturamento_mensal ADD COLUMN numero_fatura INTEGER")
            con.commit()
        except Exception:
            pass
        try:
            con.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_fat_empresa_numero "
                "ON faturamento_mensal(id_empresa, numero_fatura) "
                "WHERE numero_fatura IS NOT NULL"
            )
            con.commit()
        except Exception:
            pass
        logger.info("_migrate_faturamento_numero: coluna e índice prontos")
    finally:
        con.close()


def _migrate_parcelas_prorrogacao():
    # DDL completo da tabela com manutencao_id nullable
    NEW_TABLE_DDL = """
        CREATE TABLE manutencao_parcelas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            manutencao_id INTEGER REFERENCES manutencoes(id),
            nf_ordem INTEGER,
            nota VARCHAR(50),
            fornecedor VARCHAR(120),
            valor_item_total NUMERIC(14,2),
            tipo_custo VARCHAR(30),
            data_vencimento DATE,
            parcela_atual INTEGER,
            parcela_total INTEGER,
            valor_parcela NUMERIC(14,2),
            forma_pgto VARCHAR(50),
            status_pagamento VARCHAR(20) DEFAULT 'Pendente',
            data_vencimento_original DATE,
            prorrogada BOOLEAN DEFAULT 0,
            isento_encargos BOOLEAN,
            tipo_pgto_prorrogacao VARCHAR(20),
            chave_pix VARCHAR(100),
            multa_pct NUMERIC(6,2),
            juros_diario_pct NUMERIC(6,4),
            data_prevista_pagamento DATE,
            dias_cartorio INTEGER,
            valor_atualizado NUMERIC(14,2),
            sera_reembolsado BOOLEAN DEFAULT 0,
            valor_reembolso NUMERIC(14,2),
            qtd_itens_reembolso INTEGER,
            motivo_reembolso TEXT,
            nf_id INTEGER REFERENCES notas_fiscais(id),
            deletado_em DATETIME
        )
    """

    con = sqlite3.connect(str(DB_PATH))
    con.isolation_level = None  # autocommit — controle manual de transações
    try:
        # Adiciona colunas novas (idempotente — ignora se já existem)
        new_cols = [
            "data_vencimento_original DATE",
            "prorrogada BOOLEAN DEFAULT 0",
            "isento_encargos BOOLEAN",
            "tipo_pgto_prorrogacao VARCHAR(20)",
            "chave_pix VARCHAR(100)",
            "multa_pct NUMERIC(6,2)",
            "juros_diario_pct NUMERIC(6,4)",
            "data_prevista_pagamento DATE",
            "dias_cartorio INTEGER",
            "valor_atualizado NUMERIC(14,2)",
            "sera_reembolsado BOOLEAN DEFAULT 0",
            "valor_reembolso NUMERIC(14,2)",
            "qtd_itens_reembolso INTEGER",
            "motivo_reembolso TEXT",
            "fornecedor VARCHAR(120)",
            "valor_item_total NUMERIC(14,2)",
            "tipo_custo VARCHAR(30)",
            "nf_id INTEGER REFERENCES notas_fiscais(id)",
            "deletado_em DATETIME",
        ]
        for col_def in new_cols:
            try:
                con.execute(f"ALTER TABLE manutencao_parcelas ADD COLUMN {col_def}")
            except Exception:
                pass

        # Recria índices (idempotentes)
        con.execute("CREATE INDEX IF NOT EXISTS idx_parcela_nf ON manutencao_parcelas(nf_id)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_parcela_venc ON manutencao_parcelas(data_vencimento)")

        # Verifica se manutencao_id ainda tem NOT NULL
        row = con.execute(
            "SELECT \"notnull\" FROM pragma_table_info('manutencao_parcelas') WHERE name='manutencao_id'"
        ).fetchone()
        if not (row and row[0] == 1):
            return  # já nullable, nada a fazer

        logger.info("Relaxando NOT NULL em manutencao_parcelas.manutencao_id ...")
        con.execute("PRAGMA foreign_keys=OFF")
        con.execute("BEGIN")
        try:
            # Captura colunas da tabela atual (antes de renomear)
            cols_old = [r[1] for r in con.execute("PRAGMA table_info('manutencao_parcelas')").fetchall()]

            # Remove resquício de tentativa anterior, se houver
            con.execute("DROP TABLE IF EXISTS manutencao_parcelas_old")
            con.execute("ALTER TABLE manutencao_parcelas RENAME TO manutencao_parcelas_old")
            con.execute(NEW_TABLE_DDL)

            # Copia apenas colunas que existem em ambas as tabelas
            cols_new = [r[1] for r in con.execute("PRAGMA table_info('manutencao_parcelas')").fetchall()]
            cols_comuns = [c for c in cols_old if c in cols_new]
            col_list = ", ".join(cols_comuns)
            con.execute(
                f"INSERT INTO manutencao_parcelas ({col_list}) "
                f"SELECT {col_list} FROM manutencao_parcelas_old"
            )
            con.execute("DROP TABLE manutencao_parcelas_old")
            con.execute("COMMIT")
            con.execute("CREATE INDEX IF NOT EXISTS idx_parcela_nf ON manutencao_parcelas(nf_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_parcela_venc ON manutencao_parcelas(data_vencimento)")
            logger.info("manutencao_parcelas.manutencao_id agora permite NULL")
        except Exception as e:
            con.execute("ROLLBACK")
            logger.error("Erro relaxando NOT NULL em manutencao_parcelas: %s", e)
            raise
        finally:
            con.execute("PRAGMA foreign_keys=ON")
    finally:
        con.close()


