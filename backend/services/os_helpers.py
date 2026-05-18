"""
Helpers para Ordens de Serviço.

Contém funções de resolução, validação e geração de OS.
"""
import logging

import requests as _requests
from sqlalchemy.orm import Session
from sqlalchemy import text

import models
from config import MAPWS_BASE

logger = logging.getLogger("locadora")


def _resolve_fornecedor_id(db: Session, name: str | None) -> int | None:
    """Busca id na tabela física fornecedores pelo nome (case-insensitive)."""
    if not name or not str(name).strip():
        return None
    try:
        q = text("SELECT id FROM fornecedores WHERE UPPER(TRIM(nome)) = :n LIMIT 1")
        res = db.execute(q, {"n": str(name).strip().upper()}).fetchone()
        return res[0] if res else None
    except Exception as e:
        logger.warning("Falha ao resolver fornecedor_id para '%s': %s", name, e)
        return None


def _mapws_km_direct(placa: str, date_str: str) -> float | None:
    """Busca odômetro no MAPWS para a placa na data (YYYY-MM-DD). Retorna km_fim ou None."""
    try:
        resp = _requests.get(
            f"{MAPWS_BASE}/api/details/{placa}",
            params={"start_date": date_str, "end_date": date_str},
            timeout=4,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        records = data if isinstance(data, list) else (data.get("data") or data.get("records") or [])
        if not records:
            return None
        rec = records[-1] if isinstance(records, list) else records
        val = rec.get("km_fim") or rec.get("km_acumulado") or rec.get("odometro")
        return float(val) if val is not None else None
    except Exception:
        return None


def _enrich_km_from_mapws():
    """Preenche ordens_servico.km nulo consultando o MAPWS pelo odômetro na data do serviço."""
    import sqlite3
    from database import DB_PATH

    try:
        conn = sqlite3.connect(str(DB_PATH))
        rows = conn.execute("""
            SELECT id, placa, COALESCE(data_execucao, data_entrada) AS data_exec
            FROM ordens_servico
            WHERE km IS NULL
              AND COALESCE(data_execucao, data_entrada) IS NOT NULL
              AND deletado_em IS NULL
        """).fetchall()

        updated = 0
        for os_id, placa, data_exec in rows:
            date_str   = str(data_exec)[:10]
            placa_norm = str(placa).replace("-", "").strip().upper()
            km_val     = _mapws_km_direct(placa_norm, date_str)
            if km_val is not None:
                conn.execute("UPDATE ordens_servico SET km = ? WHERE id = ?", (km_val, os_id))
                updated += 1

        conn.commit()
        conn.close()
        logger.info("KM enrichment concluído: %d/%d OS atualizadas via MAPWS", updated, len(rows))
    except Exception as e:
        logger.error("Erro em _enrich_km_from_mapws: %s", e)


def generate_numero_os_atomic(db: Session) -> str:
    """Gera numero_os atomicamente via UPSERT na tabela os_counters.

    Seguro em concorrência (SQLite serializa writes). Sincroniza com o maior
    número de OS já existente no banco para evitar conflitos após migrações.
    """
    from datetime import datetime as _dt
    year = _dt.now().year
    
    # 1. Descobre o maior número de OS já existente (nova ou legado)
    row_max = db.execute(text("""
        SELECT COALESCE(MAX(CAST(SUBSTR(numero_os, 9) AS INTEGER)), 0) FROM (
            SELECT numero_os FROM ordens_servico WHERE numero_os LIKE 'OS-' || :y || '-%'
            UNION ALL
            SELECT id_ord_serv as numero_os FROM manutencoes WHERE id_ord_serv LIKE 'OS-' || :y || '-%'
        )
    """), {"y": year}).fetchone()
    max_existente = row_max[0] if row_max else 0

    # 2. Garante que o contador nunca seja menor que o máximo existente
    db.execute(text("""
        INSERT INTO os_counters (ano, ultimo) VALUES (:y, :max_val)
        ON CONFLICT(ano) DO UPDATE SET ultimo = MAX(ultimo, :max_val)
    """), {"y": year, "max_val": max_existente})

    # 3. Incrementa atomicamente e retorna o novo valor
    row = db.execute(text("""
        UPDATE os_counters SET ultimo = ultimo + 1 WHERE ano = :y
        RETURNING ultimo
    """), {"y": year}).fetchone()
    db.flush()
    
    numero = row[0] if row else 1
    return f"OS-{year}-{str(numero).zfill(4)}"


def validar_consistencia_os(db: Session, os_id: int) -> list[str]:
    """Retorna lista de erros de consistência financeira (vazia = OK).

    Tolerância: R$ 0,01 (arredondamento).
    """
    erros: list[str] = []
    os = db.get(models.OrdemServico, os_id)
    if not os:
        return [f"OS {os_id} não encontrada"]

    nfs_ativas = [nf for nf in os.notas_fiscais if nf.deletado_em is None]

    # Todos os itens da OS devem estar vinculados a pelo menos uma NF
    os_item_ids_vinculados = {nfi.os_item_id for nf in nfs_ativas for nfi in nf.itens}
    for it in os.itens:
        if it.id not in os_item_ids_vinculados:
            cat = it.categoria or ''
            label = it.servico or it.sistema or f"Item {it.id}"
            erros.append(f"Item '{label}' não vinculado a nenhuma NF")

    for nf in nfs_ativas:
        soma_itens = sum(float(ni.valor_total_item or 0) for ni in nf.itens)
        valor_nf = float(nf.valor_total_nf or 0)
        if soma_itens > 0 and abs(soma_itens - valor_nf) > 0.01:
            erros.append(
                f"NF {nf.numero_nf or nf.id}: soma dos itens ({soma_itens:.2f}) "
                f"≠ valor_total_nf ({valor_nf:.2f})"
            )
        parcelas_ativas = [p for p in nf.parcelas if p.deletado_em is None]
        soma_parcelas = sum(float(p.valor_parcela or 0) for p in parcelas_ativas)
        if parcelas_ativas and abs(soma_parcelas - valor_nf) > 0.01:
            erros.append(
                f"NF {nf.numero_nf or nf.id}: soma das parcelas ({soma_parcelas:.2f}) "
                f"≠ valor_total_nf ({valor_nf:.2f})"
            )

    total_nfs = sum(float(nf.valor_total_nf or 0) for nf in nfs_ativas)
    if os.total_os and abs(total_nfs - float(os.total_os)) > 0.01:
        erros.append(
            f"OS total ({float(os.total_os):.2f}) ≠ soma das NFs ({total_nfs:.2f})"
        )
    return erros


def _infer_tipo_nf(m) -> tuple[str, bool]:
    """Retorna (tipo_nf, needs_review). needs_review=True quando heurística é ambígua."""
    cat = (m.categoria or "").lower()
    if any(k in cat for k in ("compra", "produto", "peça", "peca")):
        return "Produto", False
    if any(k in cat for k in ("serviço", "servico", "mão", "mao")):
        return "Servico", False
    return "Servico", True


def _status_os_from_manutencao(status_manut: str) -> str:
    """Mapeia status_manutencao legado para status_os do novo modelo."""
    mapping = {
        "aberta": "aberta",
        "em_andamento": "em_andamento",
        "aguardando_peca": "aguardando_peca",
        "pendente": "em_andamento",
        "finalizada": "finalizada",
    }
    return mapping.get(status_manut, "em_andamento")


def _validar_nf_duplicada(db: Session, numero_nf: str, fornecedor: str, current_nf_id: int = None, os_id: int = None):
    from fastapi import HTTPException
    if not numero_nf or not fornecedor:
        return
    n = str(numero_nf).strip()
    f = str(fornecedor).strip()
    if not n or not f:
        return
        
    q = db.query(models.NotaFiscal).filter(
        models.NotaFiscal.numero_nf == n,
        models.NotaFiscal.fornecedor == f,
        models.NotaFiscal.deletado_em == None
    )
    if os_id:
        q = q.filter(models.NotaFiscal.os_id == os_id)
        
    if current_nf_id:
        q = q.filter(models.NotaFiscal.id != current_nf_id)
        
    if q.first():
        raise HTTPException(400, f"A Nota Fiscal '{n}' já foi lançada para o fornecedor '{f}' nesta mesma OS.")
