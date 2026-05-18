"""
Migrações de schema — executadas uma vez no startup.

Contém:
- _migrate_parcelas_prorrogacao(): adiciona colunas novas + relaxa NOT NULL
- _migrate_1to1_safe(): migração idempotente manutencao → OS
"""
import json
import logging
import sqlite3

from database import DB_PATH, SessionLocal
import models
from services.os_helpers import _infer_tipo_nf, _status_os_from_manutencao

logger = logging.getLogger("locadora")


def _migrate_reembolsos_v2():
    """Expande tabela reembolsos com todos os campos da aba Excel (idempotente)."""
    con = sqlite3.connect(str(DB_PATH))
    try:
        new_cols = [
            "id_reembolso_excel INTEGER",
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
            con.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_reimb_excel_id ON reembolsos(id_reembolso_excel) WHERE id_reembolso_excel IS NOT NULL")
            con.commit()
        except Exception:
            pass
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


def _migrate_1to1_safe():
    """Migração 1:1 idempotente — cada manutencao vira uma OS com um item.

    Parcelas são agrupadas pela mesma nota (numero_nf, nota) em uma única NF.
    """
    db = SessionLocal()
    try:
        manuts = db.query(models.Manutencao).all()
        usados: set[str] = set(
            x[0] for x in db.query(models.OrdemServico.numero_os)
            .filter(models.OrdemServico.numero_os.isnot(None)).all()
        )
        for m in manuts:
            # Idempotência: pula se já migrado
            existe = (
                db.query(models.OrdemServico)
                .filter(models.OrdemServico.migrado_de_ids.like(f'%[{m.id}]%')
                        | models.OrdemServico.migrado_de_ids.like(f'%[{m.id},%')
                        | models.OrdemServico.migrado_de_ids.like(f'%,{m.id}]%')
                        | models.OrdemServico.migrado_de_ids.like(f'%,{m.id},%'))
                .first()
            )
            if existe:
                continue

            # Desambigua numero_os: se já usado no legado, sufixa com -L{id}
            numero_os = None
            if m.status_manutencao == "finalizada" and m.id_ord_serv:
                candidato = str(m.id_ord_serv).strip() or None
                if candidato:
                    if candidato in usados:
                        candidato = f"{candidato}-L{m.id}"
                    usados.add(candidato)
                    numero_os = candidato

            os = models.OrdemServico(
                numero_os=numero_os,
                status_os=_status_os_from_manutencao(m.status_manutencao or "em_andamento"),
                id_veiculo=m.id_veiculo,
                placa=m.placa,
                modelo=m.modelo,
                empresa=m.empresa,
                id_contrato=m.id_contrato,
                implemento=m.implemento,
                fornecedor=m.fornecedor,
                tipo_manutencao=m.tipo_manutencao,
                categoria=m.categoria,
                total_os=m.total_os,
                responsavel_tec=m.responsavel_tec,
                indisponivel=bool(m.indisponivel),
                km=m.km,
                data_entrada=m.data_entrada,
                data_execucao=m.data_execucao,
                prox_km=m.prox_km,
                prox_data=m.prox_data,
                observacoes=m.observacoes,
                migrado_de_ids=json.dumps([m.id]),
            )
            db.add(os)
            db.flush()

            os_items_map = {}
            if m.parcelas:
                for p in m.parcelas:
                    sys_t = p.sistema_temp or m.sistema
                    srv_t = p.servico_temp or m.servico
                    desc_t = p.descricao_temp or m.descricao
                    k_item = (sys_t, srv_t, desc_t)
                    
                    if k_item not in os_items_map:
                        item = models.OsItem(
                            os_id=os.id,
                            sistema=sys_t,
                            servico=srv_t,
                            descricao=desc_t,
                            qtd_itens=m.qtd_itens,
                            posicao_pneu=m.posicao_pneu,
                            qtd_pneu=m.qtd_pneu,
                            espec_pneu=m.espec_pneu,
                            marca_pneu=m.marca_pneu,
                            manejo_pneu=m.manejo_pneu,
                            manutencao_origem_id=m.id,
                        )
                        db.add(item)
                        db.flush()
                        os_items_map[k_item] = item
            else:
                item = models.OsItem(
                    os_id=os.id,
                    sistema=m.sistema,
                    servico=m.servico,
                    descricao=m.descricao,
                    qtd_itens=m.qtd_itens,
                    posicao_pneu=m.posicao_pneu,
                    qtd_pneu=m.qtd_pneu,
                    espec_pneu=m.espec_pneu,
                    marca_pneu=m.marca_pneu,
                    manejo_pneu=m.manejo_pneu,
                    manutencao_origem_id=m.id,
                )
                db.add(item)
                db.flush()
                os_items_map[(m.sistema, m.servico, m.descricao)] = item

            # Agrupa parcelas pela mesma nota
            grupos: dict = {}
            for p in m.parcelas:
                chave = (p.nf_ordem, p.nota or f"__solo_{p.id}", p.fornecedor, p.empresa_temp)
                grupos.setdefault(chave, []).append(p)

            nfs_criadas = []
            for (nf_ordem, _, _forn, _emp), parcelas_grupo in grupos.items():
                tipo, needs_review = _infer_tipo_nf(m)
                primeira = parcelas_grupo[0]
                valor_nf = (
                    float(primeira.valor_item_total)
                    if primeira.valor_item_total
                    else sum(float(p.valor_parcela or 0) for p in parcelas_grupo)
                )
                _emp_sigla = primeira.empresa_temp or m.empresa
                _emp_id_row = db.execute(
                    __import__("sqlalchemy").text(
                        "SELECT id FROM empresas WHERE UPPER(sigla) = UPPER(:s)"
                    ), {"s": str(_emp_sigla or "").strip()}
                ).fetchone() if _emp_sigla else None
                nf = models.NotaFiscal(
                    os_id=os.id,
                    numero_nf=primeira.nota,
                    tipo_nf=tipo,
                    tipo_nf_needs_review=needs_review,
                    fornecedor=primeira.fornecedor or m.fornecedor,
                    id_empresa=_emp_id_row[0] if _emp_id_row else None,
                    valor_total_nf=valor_nf,
                    data_emissao=m.data_execucao,
                    nf_ordem_origem=nf_ordem,
                )
                db.add(nf)
                db.flush()
                nfs_criadas.append(nf)

                item_parcelas = {}
                for p in parcelas_grupo:
                    k_item = (p.sistema_temp or m.sistema, p.servico_temp or m.servico, p.descricao_temp or m.descricao)
                    item_parcelas.setdefault(k_item, []).append(p)

                for k_item, p_list in item_parcelas.items():
                    o_item = os_items_map.get(k_item)
                    primeira_p = p_list[0]
                    valor_nf_item = (
                        float(primeira_p.valor_item_total)
                        if primeira_p.valor_item_total
                        else sum(float(p.valor_parcela or 0) for p in p_list)
                    )
                    nf_item = models.NfItem(
                        nf_id=nf.id,
                        os_item_id=o_item.id if o_item else None,
                        quantidade=1,
                        valor_unitario=valor_nf_item,
                        valor_total_item=valor_nf_item,
                    )
                    db.add(nf_item)

                for p in parcelas_grupo:
                    p.nf_id = nf.id

            empresas = set(str(nf.id_empresa) for nf in nfs_criadas if nf.id_empresa)
            fornecedores = set(nf.fornecedor for nf in nfs_criadas if nf.fornecedor)
            
            if len(empresas) > 1:
                os.empresa = "Várias"
            elif len(empresas) == 1:
                os.empresa = list(empresas)[0]
                
            if len(fornecedores) > 1:
                os.fornecedor = " / ".join(list(fornecedores))
            elif len(fornecedores) == 1:
                os.fornecedor = list(fornecedores)[0]

            db.commit()
    except Exception as e:
        db.rollback()
        logger.error("[migration 1:1] ERRO: %s", e)
    finally:
        db.close()
