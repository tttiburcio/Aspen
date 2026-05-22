"""
Router de Rastreamento Veicular.

GET  /api/db/rastreamento           → lista registros com dados do veículo
GET  /api/db/rastreamento/summary   → KPIs agregados
POST /api/db/rastreamento           → cria registro
PATCH /api/db/rastreamento/{id}     → atualiza registro
DELETE /api/db/rastreamento/{id}    → remove registro
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from datetime import date
from decimal import Decimal

from database import get_db
import models

router = APIRouter(tags=["Rastreamento"])

today = date.today


def _serialize(r, f, e):
    data_inicio = r.data_inicio
    vencimento  = r.vencimento
    td          = today()

    # Status do contrato
    if vencimento:
        dias_rest = (vencimento - td).days
        status = "vencido" if dias_rest < 0 else ("vencendo" if dias_rest <= 30 else "ativo")
    else:
        status = "ativo"

    # Dias rastreados (data_inicio → hoje ou vencimento, o que vier primeiro)
    if data_inicio:
        fim = min(vencimento, td) if vencimento else td
        dias_rastreados = max(0, (fim - data_inicio).days)
    else:
        dias_rastreados = None

    vm = r.valor_mensal

    return {
        "id":                    r.id,
        "id_veiculo":            r.id_veiculo,
        "id_empresa":            r.id_empresa,
        "placa":                 f.get("placa") if f else None,
        "modelo_veiculo":        f.get("modelo") if f else None,
        "marca_veiculo":         f.get("marca") if f else None,
        "empresa_sigla":         e.get("sigla") if e else None,
        "empresa_rastreamento":  r.empresa_rastreamento,
        "numero_contrato":       r.numero_contrato,
        "modelo_rastreador":     r.modelo_rastreador,
        "tem_bloqueador":        bool(r.tem_bloqueador) if r.tem_bloqueador is not None else False,
        "valor_mensal":          float(vm) if vm is not None else 0.0,
        "valor_total_contrato":  float(r.valor_total_contrato) if r.valor_total_contrato is not None else None,
        "data_inicio":           str(data_inicio) if data_inicio else None,
        "vencimento":            str(vencimento) if vencimento else None,
        "dia_vencimento":        int(r.dia_vencimento) if r.dia_vencimento is not None else None,
        "dias_rastreados":       dias_rastreados,
        "dias_sem_sinal":        int(r.dias_sem_sinal) if r.dias_sem_sinal is not None else 0,
        "observacoes":           r.observacoes,
        "status":                status,
    }


_INACTIVE_STATUSES = {"VENDIDO", "ENCERRADO", "INATIVO"}


@router.get("/api/db/rastreamento")
def list_rastreamento(
    empresa:          Optional[str] = Query(None),
    status:           Optional[str] = Query(None),
    incluir_inativos: bool          = Query(False),
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.Rastreamento, models.Frota, models.Empresa)
        .outerjoin(models.Frota,   models.Rastreamento.id_veiculo == models.Frota.id)
        .outerjoin(models.Empresa, models.Rastreamento.id_empresa  == models.Empresa.id)
    )
    if empresa:
        q = q.filter(models.Empresa.sigla.ilike(empresa))
    if not incluir_inativos:
        q = q.filter(
            ~models.Frota.status.ilike("Vendido") &
            ~models.Frota.status.ilike("Encerrado") &
            ~models.Frota.status.ilike("Inativo")
        )

    result = []
    for r, f, e in q.order_by(models.Frota.placa).all():
        item = _serialize(
            r,
            {"placa": f.placa, "modelo": f.modelo, "marca": f.marca, "status": f.status} if f else {},
            {"sigla": e.sigla} if e else {},
        )
        if status and item["status"] != status:
            continue
        result.append(item)
    return result


@router.get("/api/db/rastreamento/summary")
def summary_rastreamento(
    empresa: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.Rastreamento, models.Frota, models.Empresa)
        .outerjoin(models.Frota,   models.Rastreamento.id_veiculo == models.Frota.id)
        .outerjoin(models.Empresa, models.Rastreamento.id_empresa  == models.Empresa.id)
    )
    if empresa:
        q = q.filter(models.Empresa.sigla == empresa)

    records = q.all()
    td = today()

    total_veiculos   = 0
    total_mensal     = Decimal("0")
    total_contrato   = Decimal("0")
    com_bloqueador   = 0
    vencendo_30d     = 0
    vencidos         = 0
    total_dias_rast  = 0
    total_sem_sinal  = 0
    n_dias           = 0
    empresas_rast    = set()

    for r, f, e in records:
        total_veiculos += 1
        vm = r.valor_mensal
        if vm:
            total_mensal += Decimal(str(vm))
        if r.valor_total_contrato:
            total_contrato += Decimal(str(r.valor_total_contrato))
        if r.tem_bloqueador:
            com_bloqueador += 1
        if r.empresa_rastreamento:
            empresas_rast.add(r.empresa_rastreamento)
        if r.vencimento:
            dr = (r.vencimento - td).days
            if dr < 0:
                vencidos += 1
            elif dr <= 30:
                vencendo_30d += 1
        if r.data_inicio:
            fim = min(r.vencimento, td) if r.vencimento else td
            total_dias_rast += max(0, (fim - r.data_inicio).days)
            n_dias += 1
        total_sem_sinal += int(r.dias_sem_sinal or 0)

    return {
        "total_veiculos":       total_veiculos,
        "total_mensal":         float(total_mensal),
        "total_anual":          float(total_mensal * 12),
        "total_contrato":       float(total_contrato),
        "com_bloqueador":       com_bloqueador,
        "sem_bloqueador":       total_veiculos - com_bloqueador,
        "vencendo_30d":         vencendo_30d,
        "vencidos":             vencidos,
        "ativos":               total_veiculos - vencidos,
        "empresas_rast":        list(empresas_rast),
        "total_dias_rastreados": total_dias_rast,
        "total_dias_sem_sinal": total_sem_sinal,
        "media_dias_rast":      round(total_dias_rast / n_dias) if n_dias else 0,
    }


class RastreamentoIn(BaseModel):
    id_veiculo:            int
    id_empresa:            Optional[int]   = None
    empresa_rastreamento:  Optional[str]   = None
    numero_contrato:       Optional[str]   = None
    modelo_rastreador:     Optional[str]   = None
    tem_bloqueador:        Optional[bool]  = False
    valor_mensal:          Optional[float] = None
    valor_total_contrato:  Optional[float] = None
    data_inicio:           Optional[date]  = None
    vencimento:            Optional[date]  = None
    dia_vencimento:        Optional[int]   = None
    dias_sem_sinal:        Optional[int]   = 0
    observacoes:           Optional[str]   = None


@router.post("/api/db/rastreamento", status_code=201)
def create_rastreamento(payload: RastreamentoIn, db: Session = Depends(get_db)):
    existing = (
        db.query(models.Rastreamento)
        .filter(models.Rastreamento.id_veiculo == payload.id_veiculo)
        .first()
    )
    if existing:
        raise HTTPException(409, "Veículo já possui contrato de rastreamento ativo")
    data = payload.model_dump()
    r = models.Rastreamento(**data)
    db.add(r)
    db.commit()
    db.refresh(r)
    return _serialize(r, _frota_dict(db, r.id_veiculo), _emp_dict(db, r.id_empresa))


class RastreamentoPatch(BaseModel):
    empresa_rastreamento:  Optional[str]   = None
    numero_contrato:       Optional[str]   = None
    modelo_rastreador:     Optional[str]   = None
    tem_bloqueador:        Optional[bool]  = None
    valor_mensal:          Optional[float] = None
    valor_total_contrato:  Optional[float] = None
    data_inicio:           Optional[date]  = None
    vencimento:            Optional[date]  = None
    dia_vencimento:        Optional[int]   = None
    dias_sem_sinal:        Optional[int]   = None
    observacoes:           Optional[str]   = None
    id_empresa:            Optional[int]   = None


@router.patch("/api/db/rastreamento/{id}")
def patch_rastreamento(id: int, payload: RastreamentoPatch, db: Session = Depends(get_db)):
    r = db.query(models.Rastreamento).filter(models.Rastreamento.id == id).first()
    if not r:
        raise HTTPException(404, "Registro não encontrado")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return _serialize(r, _frota_dict(db, r.id_veiculo), _emp_dict(db, r.id_empresa))


@router.delete("/api/db/rastreamento/{id}", status_code=204)
def delete_rastreamento(id: int, db: Session = Depends(get_db)):
    r = db.query(models.Rastreamento).filter(models.Rastreamento.id == id).first()
    if not r:
        raise HTTPException(404, "Registro não encontrado")
    db.delete(r)
    db.commit()


# ── helpers internos ────────────────────────────────────────────────────────
def _frota_dict(db, id_veiculo):
    f = db.query(models.Frota).filter(models.Frota.id == id_veiculo).first()
    return {"placa": f.placa, "modelo": f.modelo, "marca": f.marca} if f else {}

def _emp_dict(db, id_empresa):
    if not id_empresa:
        return {}
    e = db.query(models.Empresa).filter(models.Empresa.id == id_empresa).first()
    return {"sigla": e.sigla} if e else {}
