"""
Router de Reembolsos.

GET  /api/db/reembolsos/summary          → agregados
GET  /api/db/reembolsos/proximo-recibo   → sugere próximo nº de recibo por empresa
GET  /api/db/reembolsos                  → lista completa com filtros
POST /api/db/reembolsos                  → criar reembolso manual
PATCH /api/db/reembolsos/{id}            → editar
DELETE /api/db/reembolsos/{id}           → excluir
POST /api/db/reembolsos/{id}/pagar       → marcar como pago
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import extract
from datetime import date
from typing import Optional
import json

from database import get_db
import models, schemas

router = APIRouter(tags=["Reembolsos"])


def _build_empresa_map(db: Session, ids_empresa: list[int]) -> dict[int, models.Empresa]:
    if not ids_empresa:
        return {}
    return {e.id: e for e in db.query(models.Empresa).filter(models.Empresa.id.in_(ids_empresa)).all()}


def _primeira_placa_json(placas_json: str | None) -> str | None:
    if not placas_json:
        return None
    try:
        lst = json.loads(placas_json)
        return lst[0] if lst else None
    except Exception:
        return None


def _enriquecer(r: models.Reembolso, frota_map: dict, empresa_map: dict) -> dict:
    veiculo  = frota_map.get(r.id_veiculo)
    empresa  = empresa_map.get(r.id_empresa)

    placa  = veiculo.placa  if veiculo else _primeira_placa_json(r.placas_json)
    modelo = veiculo.modelo if veiculo else None

    val_reimb  = float(r.valor_reembolso) if r.valor_reembolso is not None else None
    val_receb  = float(r.valor_recebido)  if r.valor_recebido  is not None else None
    saldo      = (val_reimb or 0) - (val_receb or 0) if val_reimb is not None else None

    return {
        "id":                  r.id,
        "tipo":                r.tipo,
        "id_empresa":          r.id_empresa,
        "empresa_emissora":    empresa.sigla if empresa else None,
        "id_contrato":         r.id_contrato,
        "id_cliente":          r.id_cliente,
        "id_veiculo":          r.id_veiculo,
        "recibo":              r.recibo,
        "emissao":             r.emissao,
        "vencimento":          r.vencimento,
        "empresa":             r.empresa,
        "valor_reembolso":     val_reimb,
        "data_entrada":        r.data_entrada,
        "data_recebimento":    r.data_entrada,   # alias legível para o frontend
        "valor_recebido":      val_receb,
        "encargos":            float(r.encargos) if r.encargos is not None else None,
        "saldo":               saldo,
        "forma_recebimento":   r.forma_recebimento,
        "status_recebimento":  r.status_recebimento,
        "descricao":           r.descricao,
        "documento_rede":      r.documento_rede,
        "placas_json":         r.placas_json,
        "placa":               placa,
        "modelo":              modelo,
        "numero_os":           r.numero_os,
        "fatura_mes":          r.fatura_mes,
        "id_multa":            r.id_multa,
        "ids_multa_json":      r.ids_multa_json,
    }


def _make_maps(db: Session, rows: list):
    ids_veiculo = [r.id_veiculo for r in rows if r.id_veiculo]
    ids_empresa = list({r.id_empresa for r in rows if r.id_empresa})
    frota_map   = {v.id: v for v in db.query(models.Frota).filter(models.Frota.id.in_(ids_veiculo)).all()} if ids_veiculo else {}
    empresa_map = _build_empresa_map(db, ids_empresa)
    return frota_map, empresa_map


# ── Rotas estáticas ANTES das dinâmicas ─────────────────────────────────

@router.get("/api/db/reembolsos/summary", response_model=schemas.ReembolsoSummary)
def summary_reembolsos(
    year:           Optional[int] = Query(None),
    empresa:        Optional[str] = Query(None),
    emissora_sigla: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    today    = date.today()
    ref_year = year or today.year

    q    = db.query(models.Reembolso).filter(extract("year", models.Reembolso.emissao) == ref_year)
    rows = q.all()

    frota_map, empresa_map = _make_maps(db, rows)
    enriched = [_enriquecer(r, frota_map, empresa_map) for r in rows]

    # Filtro por emissora (sigla da empresa que emitiu o reembolso)
    if emissora_sigla:
        sig = emissora_sigla.strip().upper()
        enriched = [r for r in enriched if (r["empresa_emissora"] or "").strip().upper() == sig]

    if empresa:
        emp_str  = str(empresa).strip().lower()
        enriched = [r for r in enriched if (r["empresa"] or "").strip().lower() == emp_str]

    total_ano      = sum((r["valor_reembolso"] or 0) for r in enriched)
    total_recebido = sum((r["valor_recebido"]   or 0) for r in enriched)
    total_mes      = sum(
        (r["valor_reembolso"] or 0) for r in enriched
        if r["emissao"] and r["emissao"].month == today.month and r["emissao"].year == today.year
    )

    por_mes_map: dict[int, dict] = {}
    for r in enriched:
        # valor emitido → agrupa por mês de emissão
        if r["emissao"]:
            m = r["emissao"].month
            if m not in por_mes_map:
                por_mes_map[m] = {"valor": 0.0, "recebido": 0.0}
            por_mes_map[m]["valor"] += (r["valor_reembolso"] or 0)
        # recebido → agrupa por mês de recebimento (data_entrada)
        if r["data_recebimento"] and r["valor_recebido"]:
            m = r["data_recebimento"].month
            if m not in por_mes_map:
                por_mes_map[m] = {"valor": 0.0, "recebido": 0.0}
            por_mes_map[m]["recebido"] += (r["valor_recebido"] or 0)
    por_mes = [
        schemas.ReembolsoMensal(mes=m, valor=d["valor"], recebido=d["recebido"])
        for m, d in sorted(por_mes_map.items())
    ]

    por_veic_map: dict[str, dict] = {}
    for r in enriched:
        key = r["placa"] or "—"
        if key not in por_veic_map:
            por_veic_map[key] = {"placa": r["placa"], "modelo": r["modelo"], "total": 0.0, "recebido": 0.0, "quantidade": 0}
        por_veic_map[key]["total"]      += (r["valor_reembolso"] or 0)
        por_veic_map[key]["recebido"]   += (r["valor_recebido"]  or 0)
        por_veic_map[key]["quantidade"] += 1
    por_veiculo = sorted(
        [schemas.ReembolsoPorVeiculo(**v) for v in por_veic_map.values()],
        key=lambda x: x.total, reverse=True,
    )[:20]

    por_tipo_map: dict[str, dict] = {}
    for r in enriched:
        tp = r["tipo"] or "Outro"
        if tp not in por_tipo_map:
            por_tipo_map[tp] = {"tipo": tp, "total": 0.0, "recebido": 0.0, "quantidade": 0}
        por_tipo_map[tp]["total"]      += (r["valor_reembolso"] or 0)
        por_tipo_map[tp]["recebido"]   += (r["valor_recebido"]  or 0)
        por_tipo_map[tp]["quantidade"] += 1
    por_tipo = sorted(
        [schemas.ReembolsoPorTipo(**t) for t in por_tipo_map.values()],
        key=lambda x: x.total, reverse=True,
    )

    pendentes_list = (
        db.query(models.ManutencaoParcela)
        .filter(models.ManutencaoParcela.sera_reembolsado.is_(True))
        .filter(models.ManutencaoParcela.deletado_em.is_(None))
        .all()
    )

    return schemas.ReembolsoSummary(
        total_ano=total_ano,
        total_mes=total_mes,
        total_recebido=total_recebido,
        quantidade=len(enriched),
        pendentes=len(pendentes_list),
        valor_pendente=sum(float(p.valor_reembolso or 0) for p in pendentes_list),
        por_mes=por_mes,
        por_veiculo=por_veiculo,
        por_tipo=por_tipo,
    )


@router.get("/api/db/reembolsos/proximo-recibo")
def proximo_recibo(
    empresa_id: int = Query(..., description="ID da empresa emissora"),
    db: Session = Depends(get_db),
):
    """Retorna o próximo número de recibo para a empresa, baseado no maior existente."""
    rows = (
        db.query(models.Reembolso.recibo)
        .filter(models.Reembolso.id_empresa == empresa_id)
        .filter(models.Reembolso.recibo.isnot(None))
        .all()
    )
    max_num = 0
    for (rec,) in rows:
        try:
            max_num = max(max_num, int(rec))
        except (ValueError, TypeError):
            pass
    return {"proximo": str(max_num + 1) if max_num else None, "ultimo": str(max_num) if max_num else None}


@router.get("/api/db/reembolsos", response_model=list[schemas.ReembolsoResponse])
def list_reembolsos(
    year:            Optional[int] = Query(None),
    empresa:         Optional[str] = Query(None),
    emissora_sigla:  Optional[str] = Query(None),
    placa:           Optional[str] = Query(None),
    tipo:            Optional[str] = Query(None),
    status:          Optional[str] = Query(None),
    mes:             Optional[int] = Query(None),
    mes_recebimento: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.Reembolso)
    if year:
        q = q.filter(extract("year", models.Reembolso.emissao) == year)
    if mes:
        q = q.filter(extract("month", models.Reembolso.emissao) == mes)
    if mes_recebimento:
        q = q.filter(extract("month", models.Reembolso.data_entrada) == mes_recebimento)
        if year:
            q = q.filter(extract("year", models.Reembolso.data_entrada) == year)
    if tipo:
        q = q.filter(models.Reembolso.tipo == tipo)
    if status:
        q = q.filter(models.Reembolso.status_recebimento == status)

    rows = q.order_by(models.Reembolso.emissao.desc().nullslast()).all()
    frota_map, empresa_map = _make_maps(db, rows)
    out = [_enriquecer(r, frota_map, empresa_map) for r in rows]

    if emissora_sigla:
        sig = emissora_sigla.strip().upper()
        out = [r for r in out if (r["empresa_emissora"] or "").strip().upper() == sig]
    if empresa:
        emp_str = str(empresa).strip().lower()
        out = [r for r in out if (r["empresa"] or "").strip().lower() == emp_str]
    if placa:
        plc = placa.strip().upper()
        out = [r for r in out if (r["placa"] or "").strip().upper() == plc]

    return out


@router.post("/api/db/reembolsos", response_model=schemas.ReembolsoResponse, status_code=201)
def criar_reembolso(
    payload: schemas.ReembolsoCreate,
    db: Session = Depends(get_db),
):
    frota_map, empresa_map = {}, {}
    if payload.id_veiculo:
        veiculo = db.query(models.Frota).filter(models.Frota.id == payload.id_veiculo).first()
        if not veiculo:
            raise HTTPException(status_code=404, detail="Veículo não encontrado")
        frota_map = {veiculo.id: veiculo}
    if payload.id_empresa:
        emp = db.query(models.Empresa).filter(models.Empresa.id == payload.id_empresa).first()
        if emp:
            empresa_map = {emp.id: emp}

    # Valida duplicidade de recibo por empresa
    if payload.recibo and payload.id_empresa:
        existe = db.query(models.Reembolso).filter(
            models.Reembolso.recibo == payload.recibo,
            models.Reembolso.id_empresa == payload.id_empresa,
        ).first()
        if existe:
            raise HTTPException(status_code=409, detail=f"Recibo {payload.recibo} já cadastrado para esta empresa")

    r = models.Reembolso(
        tipo               = payload.tipo,
        id_empresa         = payload.id_empresa,
        id_contrato        = payload.id_contrato,
        id_veiculo         = payload.id_veiculo,
        id_multa           = payload.id_multa,
        ids_multa_json     = payload.ids_multa_json,
        placas_json        = payload.placas_json,
        fatura_mes         = payload.fatura_mes,
        numero_os          = payload.numero_os,
        emissao            = payload.emissao,
        vencimento         = payload.vencimento,
        valor_reembolso    = payload.valor_reembolso,
        valor_recebido     = payload.valor_recebido,
        empresa            = payload.empresa,
        recibo             = payload.recibo,
        forma_recebimento  = payload.forma_recebimento,
        status_recebimento = payload.status_recebimento,
        descricao          = payload.descricao,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return _enriquecer(r, frota_map, empresa_map)


@router.patch("/api/db/reembolsos/{id}", response_model=schemas.ReembolsoResponse)
def editar_reembolso(
    id: int,
    payload: schemas.ReembolsoUpdate,
    db: Session = Depends(get_db),
):
    r = db.query(models.Reembolso).filter(models.Reembolso.id == id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Reembolso não encontrado")

    # Valida duplicidade de recibo (se mudou)
    if payload.recibo is not None and payload.recibo != r.recibo:
        emp_id = payload.id_empresa if payload.id_empresa is not None else r.id_empresa
        if emp_id:
            existe = db.query(models.Reembolso).filter(
                models.Reembolso.recibo == payload.recibo,
                models.Reembolso.id_empresa == emp_id,
                models.Reembolso.id != id,
            ).first()
            if existe:
                raise HTTPException(status_code=409, detail=f"Recibo {payload.recibo} já cadastrado para esta empresa")

    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(r, field, val)
    db.commit()
    db.refresh(r)

    frota_map, empresa_map = _make_maps(db, [r])
    return _enriquecer(r, frota_map, empresa_map)


@router.delete("/api/db/reembolsos/{id}", status_code=204)
def deletar_reembolso(id: int, db: Session = Depends(get_db)):
    r = db.query(models.Reembolso).filter(models.Reembolso.id == id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Reembolso não encontrado")
    db.delete(r)
    db.commit()


@router.post("/api/db/reembolsos/{id}/pagar", response_model=schemas.ReembolsoResponse)
def pagar_reembolso(
    id: int,
    payload: schemas.ReembolsoPagar,
    db: Session = Depends(get_db),
):
    r = db.query(models.Reembolso).filter(models.Reembolso.id == id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Reembolso não encontrado")

    r.valor_recebido     = payload.valor_recebido
    r.data_entrada       = payload.data_recebimento
    r.forma_recebimento  = payload.forma_recebimento
    r.status_recebimento = "Recebido"
    db.commit()
    db.refresh(r)

    frota_map, empresa_map = _make_maps(db, [r])
    return _enriquecer(r, frota_map, empresa_map)
