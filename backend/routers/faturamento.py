"""
Router de Faturamento Mensal — endpoints para o módulo de faturamento.

GET  /api/db/faturamento          → lista faturas (filtros: year, empresa, status)
GET  /api/db/faturamento/summary  → KPIs e agrupamentos
PATCH /api/db/faturamento/{id}    → atualiza status de recebimento e/ou imposto
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text, func as sf, extract
from typing import Optional
from pydantic import BaseModel
from datetime import date

from database import get_db
import models

router = APIRouter(tags=["Faturamento"])

MONTHS_BR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
             "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


def _resolve_empresa_id(db: Session, sigla: str) -> Optional[int]:
    row = db.execute(
        text("SELECT id FROM empresas WHERE UPPER(sigla) = UPPER(:s)"),
        {"s": sigla.strip()},
    ).fetchone()
    return row[0] if row else None


def _build_query(db: Session, year, empresa_sigla, status_recebimento, status_imposto):
    q = db.query(models.FaturamentoMensal)
    if year:
        q = q.filter(sf.strftime("%Y", models.FaturamentoMensal.emissao) == str(year))
    if empresa_sigla:
        emp_id = _resolve_empresa_id(db, empresa_sigla)
        if emp_id is None:
            return None
        q = q.filter(models.FaturamentoMensal.id_empresa == emp_id)
    if status_recebimento:
        q = q.filter(models.FaturamentoMensal.status_recebimento == status_recebimento)
    if status_imposto:
        q = q.filter(models.FaturamentoMensal.status_imposto == status_imposto)
    return q


def _enrich(row: models.FaturamentoMensal, emp_map: dict, ct_map: dict) -> dict:
    emissao = row.emissao
    return {
        "id":                 row.id,
        "numero_fatura":      row.numero_fatura,
        "id_empresa":         row.id_empresa,
        "empresa_sigla":      emp_map.get(row.id_empresa, {}).get("sigla", "—"),
        "empresa_nome":       emp_map.get(row.id_empresa, {}).get("nome", "—"),
        "id_contrato":        row.id_contrato,
        "contrato_cliente":   ct_map.get(row.id_contrato, {}).get("nome_cliente", "—"),
        "contrato_cidade":    ct_map.get(row.id_contrato, {}).get("cidade", None),
        "id_cliente":         row.id_cliente,
        "empresa":            row.empresa,          # nome do tomador desnormalizado
        "emissao":            str(emissao) if emissao else None,
        "emissao_mes":        MONTHS_BR[emissao.month - 1] if emissao else None,
        "emissao_display":    f"{MONTHS_BR[emissao.month - 1]}/{emissao.year}" if emissao else None,
        "vencimento":         str(row.vencimento) if row.vencimento else None,
        "valor_locacoes":     float(row.valor_locacoes)    if row.valor_locacoes    else 0.0,
        "valor_recebido":     float(row.valor_recebido)    if row.valor_recebido    else 0.0,
        "status_recebimento": row.status_recebimento,
        # ── Imposto ──────────────────────────────────────────────────
        "aliquota_imposto":   float(row.aliquota_imposto)  if row.aliquota_imposto  else 11.33,
        "valor_imposto":      float(row.valor_imposto)     if row.valor_imposto     else 0.0,
        "valor_liquido":      float(row.valor_liquido)     if row.valor_liquido     else 0.0,
        "status_imposto":     row.status_imposto or "Pendente",
        "data_pgto_imposto":  str(row.data_pgto_imposto)  if row.data_pgto_imposto  else None,
        "encargo_imposto":    float(row.encargo_imposto)  if row.encargo_imposto   else 0.0,
        "forma_pagamento":    row.forma_pagamento or None,
    }


@router.get("/api/db/faturamento")
def list_faturamento(
    year:               Optional[int] = Query(None),
    empresa:            Optional[str] = Query(None, description="Sigla da empresa emissora"),
    status_recebimento: Optional[str] = Query(None),
    status_imposto:     Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = _build_query(db, year, empresa, status_recebimento, status_imposto)
    if q is None:
        return []
    rows = q.order_by(models.FaturamentoMensal.emissao.desc()).all()
    if not rows:
        return []

    # Bulk-load lookup maps
    emp_ids = list({r.id_empresa for r in rows if r.id_empresa})
    ct_ids  = list({r.id_contrato for r in rows if r.id_contrato})
    emp_map = {}
    if emp_ids:
        for e in db.query(models.Empresa).filter(models.Empresa.id.in_(emp_ids)).all():
            emp_map[e.id] = {"sigla": e.sigla or e.nome, "nome": e.nome}
    ct_map = {}
    if ct_ids:
        for c in db.query(models.Contrato).filter(models.Contrato.id.in_(ct_ids)).all():
            ct_map[c.id] = {"nome_cliente": c.nome_cliente, "cidade": c.cidade_operacao}

    return [_enrich(r, emp_map, ct_map) for r in rows]


@router.get("/api/db/faturamento/summary")
def summary_faturamento(
    year:    Optional[int] = Query(None),
    empresa: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = _build_query(db, year, empresa, None, None)
    if q is None:
        return {}
    rows = q.all()
    if not rows:
        return {
            "total_locacoes": 0, "total_recebido": 0,
            "total_imposto": 0, "total_imposto_pago": 0, "total_imposto_pendente": 0,
            "total_liquido": 0, "quantidade": 0,
            "pendentes_rec": 0, "valor_pendente_rec": 0,
            "por_mes": [], "por_empresa": [],
        }

    total_loc    = sum(float(r.valor_locacoes or 0) for r in rows)
    total_rec    = sum(float(r.valor_recebido or 0) for r in rows)
    total_imp    = sum(float(r.valor_imposto  or 0) for r in rows)
    total_liq    = sum(float(r.valor_liquido  or 0) for r in rows)
    imp_pago     = sum(float(r.valor_imposto  or 0) for r in rows if r.status_imposto == "Pago")
    imp_pendente = sum(float(r.valor_imposto  or 0) for r in rows if r.status_imposto != "Pago")
    pendentes_rec = sum(1 for r in rows if r.status_recebimento not in ("Recebido", "Cancelado"))
    val_pend_rec  = sum(float(r.valor_locacoes or 0) for r in rows if r.status_recebimento not in ("Recebido", "Cancelado"))

    # Por mês
    meses_map: dict = {}
    for r in rows:
        if not r.emissao:
            continue
        m = r.emissao.month
        if m not in meses_map:
            meses_map[m] = {"mes": m, "label": MONTHS_BR[m - 1], "locacoes": 0.0, "recebido": 0.0, "imposto": 0.0, "quantidade": 0}
        meses_map[m]["locacoes"]   += float(r.valor_locacoes or 0)
        meses_map[m]["recebido"]   += float(r.valor_recebido or 0)
        meses_map[m]["imposto"]    += float(r.valor_imposto  or 0)
        meses_map[m]["quantidade"] += 1

    # Por empresa emissora
    emp_ids = list({r.id_empresa for r in rows if r.id_empresa})
    emp_map = {}
    if emp_ids:
        for e in db.query(models.Empresa).filter(models.Empresa.id.in_(emp_ids)).all():
            emp_map[e.id] = e.sigla or e.nome
    empresas_map: dict = {}
    for r in rows:
        k = emp_map.get(r.id_empresa, "—")
        if k not in empresas_map:
            empresas_map[k] = {"empresa": k, "locacoes": 0.0, "recebido": 0.0, "imposto": 0.0, "quantidade": 0}
        empresas_map[k]["locacoes"]   += float(r.valor_locacoes or 0)
        empresas_map[k]["recebido"]   += float(r.valor_recebido or 0)
        empresas_map[k]["imposto"]    += float(r.valor_imposto  or 0)
        empresas_map[k]["quantidade"] += 1

    return {
        "total_locacoes":      round(total_loc, 2),
        "total_recebido":      round(total_rec, 2),
        "total_imposto":       round(total_imp, 2),
        "total_imposto_pago":  round(imp_pago, 2),
        "total_imposto_pendente": round(imp_pendente, 2),
        "total_liquido":       round(total_liq, 2),
        "quantidade":          len(rows),
        "pendentes_rec":       pendentes_rec,
        "valor_pendente_rec":  round(val_pend_rec, 2),
        "por_mes":             sorted(meses_map.values(), key=lambda x: x["mes"]),
        "por_empresa":         sorted(empresas_map.values(), key=lambda x: -x["locacoes"]),
    }


class FaturaCreate(BaseModel):
    numero_fatura:      Optional[int]   = None
    id_empresa:         Optional[int]   = None
    id_contrato:        Optional[int]   = None
    id_cliente:         Optional[int]   = None
    emissao:            date
    vencimento:         Optional[date]  = None
    valor_locacoes:     float
    valor_recebido:     Optional[float] = None
    status_recebimento: str             = "Pendente"
    empresa:            Optional[str]   = None   # nome tomador
    aliquota_imposto:   Optional[float] = 11.33
    valor_imposto:      Optional[float] = None   # calculado se omitido
    valor_liquido:      Optional[float] = None   # calculado se omitido
    status_imposto:     Optional[str]   = "Pendente"
    data_pgto_imposto:  Optional[date]  = None
    encargo_imposto:    Optional[float] = None
    forma_pagamento:    Optional[str]   = None
    observacoes:        Optional[str]   = None


class FaturaUpdate(BaseModel):
    status_recebimento: Optional[str]  = None
    valor_recebido:     Optional[float] = None
    status_imposto:     Optional[str]  = None
    data_pgto_imposto:  Optional[date]  = None
    encargo_imposto:    Optional[float] = None


@router.get("/api/db/faturamento/prefill")
def prefill_fatura(
    contrato_id: int,
    mes: str,   # "YYYY-MM"
    db: Session = Depends(get_db),
):
    """
    Retorna medicao por veículo (fat_unitario) para pré-preencher a tabela de detalhamento.
    valor_diaria = medicao / 30 (arredondado a 4 casas).
    """
    links = db.execute(
        text("SELECT id_veiculo, valor_mensal FROM contrato_veiculo WHERE contrato_id = :cid ORDER BY sequencia, id_veiculo"),
        {"cid": contrato_id},
    ).fetchall()
    if not links:
        return {"valor_locacoes": 0.0, "mes": mes, "por_veiculo": []}

    ids = [r[0] for r in links]
    valor_mensal_map = {r[0]: float(r[1]) if r[1] else None for r in links}
    frota_map = {v.id: v for v in db.query(models.Frota).filter(models.Frota.id.in_(ids)).all()}

    por_veiculo = []
    total = 0.0
    for id_veiculo in ids:
        frota = frota_map.get(id_veiculo)
        valor_mensal_contrato = valor_mensal_map.get(id_veiculo)

        if valor_mensal_contrato and valor_mensal_contrato > 0:
            # Usar valor mensal definido no contrato (fonte primária)
            valor_diaria = round(valor_mensal_contrato / 30, 4)
            medicao      = round(valor_mensal_contrato, 2)
            trabalhado   = 30
            fonte        = "contrato"
        else:
            # Fallback: histórico de fat_unitario
            row = db.execute(
                text("""
                    SELECT COALESCE(medicao, 0), COALESCE(trabalhado, 30)
                    FROM fat_unitario
                    WHERE id_veiculo = :v AND strftime('%Y-%m', mes) = :m
                    LIMIT 1
                """),
                {"v": id_veiculo, "m": mes},
            ).fetchone()
            medicao    = float(row[0]) if row else 0.0
            trabalhado = int(row[1])   if row and row[1] else 30
            valor_diaria = round(medicao / 30, 4) if medicao > 0 else 0.0
            fonte        = "historico"

        total += medicao
        por_veiculo.append({
            "id_veiculo":   id_veiculo,
            "placa":        frota.placa  if frota else None,
            "modelo":       frota.modelo if frota else None,
            "medicao_mes":  round(medicao, 2),
            "valor_diaria": valor_diaria,
            "trabalhado":   trabalhado,
            "fonte":        fonte,
        })

    return {"valor_locacoes": round(total, 2), "mes": mes, "por_veiculo": por_veiculo}


@router.get("/api/db/faturamento/proximo-numero")
def proximo_numero_fatura(
    empresa_id: int,
    db: Session = Depends(get_db),
):
    row = db.execute(
        text("SELECT COALESCE(MAX(numero_fatura), 0) FROM faturamento_mensal WHERE id_empresa = :eid"),
        {"eid": empresa_id},
    ).scalar()
    return {"proximo": (row or 0) + 1}


@router.post("/api/db/faturamento", status_code=201)
def criar_fatura(
    payload: FaturaCreate,
    db: Session = Depends(get_db),
):
    from decimal import Decimal as D

    # Validar unicidade de numero_fatura por empresa
    if payload.numero_fatura is not None and payload.id_empresa is not None:
        dup = db.execute(
            text("SELECT id FROM faturamento_mensal WHERE id_empresa = :eid AND numero_fatura = :num"),
            {"eid": payload.id_empresa, "num": payload.numero_fatura},
        ).fetchone()
        if dup:
            raise HTTPException(409, f"Número de fatura {payload.numero_fatura} já existe para esta empresa")

    aliq = D(str(payload.aliquota_imposto or 11.33))
    loc  = D(str(payload.valor_locacoes))
    imp  = (loc * aliq / D("100")).quantize(D("0.01")) if payload.valor_imposto is None else D(str(payload.valor_imposto))
    liq  = (loc - imp) if payload.valor_liquido is None else D(str(payload.valor_liquido))

    row = models.FaturamentoMensal(
        numero_fatura      = payload.numero_fatura,
        id_empresa         = payload.id_empresa,
        id_contrato        = payload.id_contrato,
        id_cliente         = payload.id_cliente,
        emissao            = payload.emissao,
        vencimento         = payload.vencimento,
        valor_locacoes     = float(loc),
        valor_recebido     = payload.valor_recebido,
        status_recebimento = payload.status_recebimento,
        empresa            = payload.empresa,
        aliquota_imposto   = float(aliq),
        valor_imposto      = float(imp),
        valor_liquido      = float(liq),
        status_imposto     = payload.status_imposto or "Pendente",
        data_pgto_imposto  = payload.data_pgto_imposto,
        encargo_imposto    = payload.encargo_imposto,
        forma_pagamento    = payload.forma_pagamento,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    emp_map, ct_map = {}, {}
    if row.id_empresa:
        e = db.get(models.Empresa, row.id_empresa)
        if e:
            emp_map[e.id] = {"sigla": e.sigla or e.nome, "nome": e.nome}
    if row.id_contrato:
        c = db.get(models.Contrato, row.id_contrato)
        if c:
            ct_map[c.id] = {"nome_cliente": c.nome_cliente, "cidade": c.cidade_operacao}
    return _enrich(row, emp_map, ct_map)


@router.delete("/api/db/faturamento/{fatura_id}", status_code=204)
def deletar_fatura(fatura_id: int, db: Session = Depends(get_db)):
    row = db.get(models.FaturamentoMensal, fatura_id)
    if not row:
        raise HTTPException(404, "Fatura não encontrada")
    db.delete(row)
    db.commit()


@router.patch("/api/db/faturamento/{fatura_id}")
def patch_fatura(
    fatura_id: int,
    payload: FaturaUpdate,
    db: Session = Depends(get_db),
):
    row = db.get(models.FaturamentoMensal, fatura_id)
    if not row:
        raise HTTPException(404, "Fatura não encontrada")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)

    emp_map, ct_map = {}, {}
    if row.id_empresa:
        e = db.get(models.Empresa, row.id_empresa)
        if e:
            emp_map[e.id] = {"sigla": e.sigla or e.nome, "nome": e.nome}
    if row.id_contrato:
        c = db.get(models.Contrato, row.id_contrato)
        if c:
            ct_map[c.id] = {"nome_cliente": c.nome_cliente, "cidade": c.cidade_operacao}
    return _enrich(row, emp_map, ct_map)
