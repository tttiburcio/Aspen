"""
Router de Seguro Veicular.

GET  /api/db/seguro                    → lista apólices com veículos
GET  /api/db/seguro/summary            → KPIs agregados
POST /api/db/seguro                    → cria apólice + veículos + gera mensais
PATCH /api/db/seguro/{id}              → atualiza apólice + regenera mensais
DELETE /api/db/seguro/{id}             → remove apólice (cascata)
POST /api/db/seguro/{id}/veiculos      → adiciona veículo à apólice
PATCH /api/db/seguro/veiculo/{sv_id}   → atualiza valor do veículo
DELETE /api/db/seguro/veiculo/{sv_id}  → remove veículo da apólice
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List, Literal
from pydantic import BaseModel
from datetime import date
from decimal import Decimal
import calendar as _cal

from database import get_db
import models

router = APIRouter(tags=["Seguro"])

_today = date.today


# ── helpers ──────────────────────────────────────────────────────────────────

def _effective_status(a: models.Seguro) -> str:
    if a.status_apolice in ("Cancelada", "Renovada"):
        return a.status_apolice.lower()
    if not a.data_fim:
        return "ativa"
    dias = (a.data_fim - _today()).days
    if dias < 0:
        return "vencida"
    if dias <= 30:
        return "vencendo"
    return "ativa"


def _serialize_apolice(a: models.Seguro, db: Session) -> dict:
    svs = (
        db.query(models.SeguroVeiculo, models.Frota)
        .join(models.Frota, models.SeguroVeiculo.id_veiculo == models.Frota.id)
        .filter(models.SeguroVeiculo.apolice_id == a.id)
        .order_by(models.Frota.placa)
        .all()
    )
    emp = db.query(models.Empresa).filter(models.Empresa.id == a.id_empresa).first() if a.id_empresa else None
    cor = db.query(models.Corretor).filter(models.Corretor.id == a.corretor_id).first() if a.corretor_id else None

    veiculos_list = [
        {
            "sv_id":            sv.id,
            "id_veiculo":       sv.id_veiculo,
            "placa":            f.placa,
            "modelo":           f.modelo,
            "marca":            f.marca,
            "implemento":       f.implemento,
            "valor_veiculo":    float(sv.valor_veiculo) if sv.valor_veiculo else 0.0,
            "cobre_implemento": bool(sv.cobre_implemento),
        }
        for sv, f in svs
    ]

    vt = float(a.valor_total_apolice) if a.valor_total_apolice else None
    num_p = a.num_parcelas or 12
    valor_mensal = round(vt / num_p, 2) if vt else None

    return {
        "id":                  a.id,
        "numero_apolice":      a.numero_apolice,
        "seguradora":          a.seguradora,
        "modelo_cobertura":    a.modelo_cobertura,
        "corretor_id":         a.corretor_id,
        "corretor_nome":       cor.nome if cor else None,
        "id_empresa":          a.id_empresa,
        "empresa_sigla":       emp.sigla if emp else None,
        "data_inicio":         str(a.data_inicio) if a.data_inicio else None,
        "data_fim":            str(a.data_fim) if a.data_fim else None,
        "num_parcelas":        a.num_parcelas,
        "dia_vencimento":      a.dia_vencimento,
        "valor_total_apolice": vt,
        "valor_mensal":        valor_mensal,
        "status_apolice":      a.status_apolice or "Ativa",
        "status":              _effective_status(a),
        "veiculos":            veiculos_list,
        "total_veiculos":      len(veiculos_list),
    }


def _generate_mensais(db: Session, a: models.Seguro):
    """Regenera parcelas mensais por veículo para esta apólice."""
    db.query(models.SeguroMensal).filter(models.SeguroMensal.apolice_id == a.id).delete()

    if not a.data_inicio or not a.num_parcelas:
        return

    svs = db.query(models.SeguroVeiculo).filter(models.SeguroVeiculo.apolice_id == a.id).all()
    if not svs:
        return

    num_p = a.num_parcelas
    dia = a.dia_vencimento or 10

    for sv in svs:
        if not sv.valor_veiculo:
            continue
        valor_mensal = (Decimal(str(sv.valor_veiculo)) / num_p).quantize(Decimal("0.01"))
        for i in range(num_p):
            m0 = a.data_inicio.month + i
            y = a.data_inicio.year + (m0 - 1) // 12
            m = (m0 - 1) % 12 + 1
            last = _cal.monthrange(y, m)[1]
            venc = date(y, m, min(dia, last))
            db.add(models.SeguroMensal(
                apolice_id=a.id,
                vencimento=venc,
                id_veiculo=sv.id_veiculo,
                valor=valor_mensal,
                id_empresa=a.id_empresa,
            ))


_INACTIVE_STATUSES = {"VENDIDO", "ENCERRADO", "INATIVO"}


def _all_veiculos_inativos(veiculos_list: list) -> bool:
    if not veiculos_list:
        return False
    return all(
        (v.get("frota_status") or "").upper() in _INACTIVE_STATUSES
        for v in veiculos_list
    )


# ── GET list (bulk-map, no N+1) ───────────────────────────────────────────────

@router.get("/api/db/seguro")
def list_seguro(
    empresa:           Optional[str]  = Query(None),
    status:            Optional[str]  = Query(None),
    incluir_inativos:  bool           = Query(False),
    db: Session = Depends(get_db),
):
    q = db.query(models.Seguro)
    if empresa:
        q = (q.join(models.Empresa, models.Seguro.id_empresa == models.Empresa.id)
               .filter(models.Empresa.sigla.ilike(empresa)))

    apolices = q.order_by(models.Seguro.data_fim.desc()).all()
    if not apolices:
        return []

    apolice_ids = [a.id for a in apolices]

    # ── bulk-load all related rows in 3 queries ───────────────────────────────
    empresa_map: dict = {
        e.id: e for e in db.query(models.Empresa).all()
    }
    corretor_map: dict = {
        c.id: c for c in db.query(models.Corretor).all()
    }
    sv_rows = (
        db.query(models.SeguroVeiculo, models.Frota)
        .join(models.Frota, models.SeguroVeiculo.id_veiculo == models.Frota.id)
        .filter(models.SeguroVeiculo.apolice_id.in_(apolice_ids))
        .order_by(models.Frota.placa)
        .all()
    )
    sv_map: dict[int, list] = {}
    for sv, f in sv_rows:
        sv_map.setdefault(sv.apolice_id, []).append((sv, f))

    result = []
    for a in apolices:
        effective = _effective_status(a)
        if status and effective != status.lower():
            continue

        emp = empresa_map.get(a.id_empresa)
        cor = corretor_map.get(a.corretor_id)
        svs = sv_map.get(a.id, [])

        veiculos_list = [
            {
                "sv_id":            sv.id,
                "id_veiculo":       sv.id_veiculo,
                "placa":            f.placa,
                "modelo":           f.modelo,
                "marca":            f.marca,
                "implemento":       f.implemento,
                "frota_status":     f.status,
                "valor_veiculo":    float(sv.valor_veiculo) if sv.valor_veiculo else 0.0,
                "cobre_implemento": bool(sv.cobre_implemento),
                "corretor_nome":    cor.nome if cor else None,
            }
            for sv, f in svs
        ]

        if not incluir_inativos and _all_veiculos_inativos(veiculos_list):
            continue

        vt = float(a.valor_total_apolice) if a.valor_total_apolice else None
        num_p = a.num_parcelas or 12
        valor_mensal = round(vt / num_p, 2) if vt else None

        result.append({
            "id":                  a.id,
            "numero_apolice":      a.numero_apolice,
            "seguradora":          a.seguradora,
            "modelo_cobertura":    a.modelo_cobertura,
            "corretor_id":         a.corretor_id,
            "corretor_nome":       cor.nome if cor else None,
            "id_empresa":          a.id_empresa,
            "empresa_sigla":       emp.sigla if emp else None,
            "data_inicio":         str(a.data_inicio) if a.data_inicio else None,
            "data_fim":            str(a.data_fim) if a.data_fim else None,
            "num_parcelas":        a.num_parcelas,
            "dia_vencimento":      a.dia_vencimento,
            "valor_total_apolice": vt,
            "valor_mensal":        valor_mensal,
            "status_apolice":      a.status_apolice or "Ativa",
            "status":              effective,
            "veiculos":            veiculos_list,
            "total_veiculos":      len(veiculos_list),
        })
    return result


# ── GET summary ───────────────────────────────────────────────────────────────

@router.get("/api/db/seguro/summary")
def summary_seguro(
    empresa: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.Seguro)
    if empresa:
        q = (q.join(models.Empresa, models.Seguro.id_empresa == models.Empresa.id)
               .filter(models.Empresa.sigla == empresa))

    apolices = q.all()

    total_apolices = len(apolices)
    ativas = vencendo = vencidas = canceladas = renovadas = 0
    total_valor = Decimal("0")
    total_mensal = Decimal("0")
    total_veiculos = 0
    seguradoras: set = set()
    coberturas: set = set()

    for a in apolices:
        s = _effective_status(a)
        if s == "ativa":      ativas += 1
        elif s == "vencendo": vencendo += 1
        elif s == "vencida":  vencidas += 1
        elif s == "cancelada": canceladas += 1
        elif s == "renovada":  renovadas += 1

        if a.valor_total_apolice:
            vt = Decimal(str(a.valor_total_apolice))
            total_valor += vt
            if a.num_parcelas:
                total_mensal += vt / a.num_parcelas

        if a.seguradora:
            seguradoras.add(a.seguradora)
        if a.modelo_cobertura:
            coberturas.add(a.modelo_cobertura)

        total_veiculos += db.query(models.SeguroVeiculo).filter(
            models.SeguroVeiculo.apolice_id == a.id
        ).count()

    tm = total_mensal.quantize(Decimal("0.01"))
    return {
        "total_apolices": total_apolices,
        "ativas":         ativas,
        "vencendo_30d":   vencendo,
        "vencidas":       vencidas,
        "canceladas":     canceladas,
        "renovadas":      renovadas,
        "total_veiculos": total_veiculos,
        "total_valor":    float(total_valor),
        "total_mensal":   float(tm),
        "total_anual":    float((tm * 12).quantize(Decimal("0.01"))),
        "seguradoras":    list(seguradoras),
        "coberturas":     list(coberturas),
    }


# ── Schemas ───────────────────────────────────────────────────────────────────

class VeiculoIn(BaseModel):
    id_veiculo:       int
    valor_veiculo:    float
    cobre_implemento: bool = False


class SeguroIn(BaseModel):
    numero_apolice:      str
    seguradora:          str
    modelo_cobertura:    Optional[str]   = None
    corretor_id:         Optional[int]   = None
    id_empresa:          int
    data_inicio:         date
    data_fim:            date
    num_parcelas:        Optional[int]   = 12
    dia_vencimento:      Optional[int]   = None
    valor_total_apolice: Optional[float] = None
    status_apolice:      Literal["Ativa","Vencida","Cancelada","Renovada","Vencendo"] = "Ativa"
    veiculos:            Optional[List[VeiculoIn]] = []


class SeguroPatch(BaseModel):
    numero_apolice:      Optional[str]   = None
    seguradora:          Optional[str]   = None
    modelo_cobertura:    Optional[str]   = None
    corretor_id:         Optional[int]   = None
    id_empresa:          Optional[int]   = None
    data_inicio:         Optional[date]  = None
    data_fim:            Optional[date]  = None
    num_parcelas:        Optional[int]   = None
    dia_vencimento:      Optional[int]   = None
    valor_total_apolice: Optional[float] = None
    status_apolice:      Optional[Literal["Ativa","Vencida","Cancelada","Renovada","Vencendo"]] = None
    veiculos:            Optional[List[VeiculoIn]] = None


class VeiculoPatch(BaseModel):
    valor_veiculo:    float
    cobre_implemento: Optional[bool] = None


class CorretorIn(BaseModel):
    nome:     str
    cnpj:     Optional[str] = None
    susep:    Optional[str] = None
    telefone: Optional[str] = None
    email:    Optional[str] = None


# ── POST create ───────────────────────────────────────────────────────────────

def _check_veiculo_duplicado(db: Session, id_veiculo: int, exclude_apolice_id: Optional[int] = None):
    """Raises 409 if vehicle is already in an active/vencendo apólice."""
    q = (
        db.query(models.SeguroVeiculo)
        .join(models.Seguro, models.SeguroVeiculo.apolice_id == models.Seguro.id)
        .filter(models.SeguroVeiculo.id_veiculo == id_veiculo)
        .filter(models.Seguro.status_apolice.in_(["Ativa", "Vencendo"]))
    )
    if exclude_apolice_id:
        q = q.filter(models.Seguro.id != exclude_apolice_id)
    if q.first():
        raise HTTPException(409, "Veículo já possui apólice ativa ou vencendo")


@router.post("/api/db/seguro", status_code=201)
def create_seguro(payload: SeguroIn, db: Session = Depends(get_db)):
    existing = db.query(models.Seguro).filter(
        models.Seguro.numero_apolice == payload.numero_apolice
    ).first()
    if existing:
        raise HTTPException(409, "Número de apólice já cadastrado")

    for v in (payload.veiculos or []):
        _check_veiculo_duplicado(db, v.id_veiculo)

    data = payload.model_dump(exclude={"veiculos"})
    a = models.Seguro(**data)
    db.add(a)
    db.flush()

    for v in (payload.veiculos or []):
        db.add(models.SeguroVeiculo(
            apolice_id=a.id,
            id_veiculo=v.id_veiculo,
            valor_veiculo=Decimal(str(v.valor_veiculo)),
            cobre_implemento=v.cobre_implemento,
        ))

    db.flush()
    _generate_mensais(db, a)
    db.commit()
    db.refresh(a)
    return _serialize_apolice(a, db)


# ── PATCH update ──────────────────────────────────────────────────────────────

@router.patch("/api/db/seguro/{id}")
def patch_seguro(id: int, payload: SeguroPatch, db: Session = Depends(get_db)):
    a = db.query(models.Seguro).filter(models.Seguro.id == id).first()
    if not a:
        raise HTTPException(404, "Apólice não encontrada")

    data = payload.model_dump(exclude_unset=True, exclude={"veiculos"})
    for k, v in data.items():
        setattr(a, k, v)

    if payload.veiculos is not None:
        db.query(models.SeguroVeiculo).filter(models.SeguroVeiculo.apolice_id == a.id).delete()
        for v in payload.veiculos:
            db.add(models.SeguroVeiculo(
                apolice_id=a.id,
                id_veiculo=v.id_veiculo,
                valor_veiculo=Decimal(str(v.valor_veiculo)),
                cobre_implemento=v.cobre_implemento,
            ))

    db.flush()
    _generate_mensais(db, a)
    db.commit()
    db.refresh(a)
    return _serialize_apolice(a, db)


# ── DELETE apólice ────────────────────────────────────────────────────────────

@router.delete("/api/db/seguro/{id}", status_code=204)
def delete_seguro(id: int, db: Session = Depends(get_db)):
    a = db.query(models.Seguro).filter(models.Seguro.id == id).first()
    if not a:
        raise HTTPException(404, "Apólice não encontrada")
    db.query(models.SeguroMensal).filter(models.SeguroMensal.apolice_id == id).delete()
    db.query(models.SeguroVeiculo).filter(models.SeguroVeiculo.apolice_id == id).delete()
    db.delete(a)
    db.commit()


# ── POST adicionar veículo ────────────────────────────────────────────────────

@router.post("/api/db/seguro/{id}/veiculos", status_code=201)
def add_veiculo(id: int, payload: VeiculoIn, db: Session = Depends(get_db)):
    a = db.query(models.Seguro).filter(models.Seguro.id == id).first()
    if not a:
        raise HTTPException(404, "Apólice não encontrada")
    _check_veiculo_duplicado(db, payload.id_veiculo, exclude_apolice_id=id)
    db.add(models.SeguroVeiculo(
        apolice_id=id,
        id_veiculo=payload.id_veiculo,
        valor_veiculo=Decimal(str(payload.valor_veiculo)),
        cobre_implemento=payload.cobre_implemento,
    ))
    db.flush()
    _generate_mensais(db, a)
    db.commit()
    db.refresh(a)
    return _serialize_apolice(a, db)


# ── PATCH / DELETE veículo ────────────────────────────────────────────────────

@router.patch("/api/db/seguro/veiculo/{sv_id}")
def patch_veiculo(sv_id: int, payload: VeiculoPatch, db: Session = Depends(get_db)):
    sv = db.query(models.SeguroVeiculo).filter(models.SeguroVeiculo.id == sv_id).first()
    if not sv:
        raise HTTPException(404, "Registro não encontrado")
    sv.valor_veiculo = Decimal(str(payload.valor_veiculo))
    if payload.cobre_implemento is not None:
        sv.cobre_implemento = payload.cobre_implemento
    db.flush()
    a = db.query(models.Seguro).filter(models.Seguro.id == sv.apolice_id).first()
    if a:
        _generate_mensais(db, a)
    db.commit()
    return _serialize_apolice(a, db)


@router.delete("/api/db/seguro/veiculo/{sv_id}", status_code=204)
def remove_veiculo(sv_id: int, db: Session = Depends(get_db)):
    sv = db.query(models.SeguroVeiculo).filter(models.SeguroVeiculo.id == sv_id).first()
    if not sv:
        raise HTTPException(404, "Registro não encontrado")
    apolice_id = sv.apolice_id
    db.delete(sv)
    db.flush()
    a = db.query(models.Seguro).filter(models.Seguro.id == apolice_id).first()
    if a:
        _generate_mensais(db, a)
    db.commit()


# ── GET / POST corretores ─────────────────────────────────────────────────────

@router.get("/api/db/corretores")
def list_corretores(db: Session = Depends(get_db)):
    rows = db.query(models.Corretor).order_by(models.Corretor.nome).all()
    return [
        {
            "id":       c.id,
            "nome":     c.nome,
            "cnpj":     c.cnpj,
            "susep":    c.susep,
            "telefone": c.telefone,
            "email":    c.email,
        }
        for c in rows
    ]


@router.post("/api/db/corretores", status_code=201)
def create_corretor(payload: CorretorIn, db: Session = Depends(get_db)):
    c = models.Corretor(
        nome=payload.nome,
        cnpj=payload.cnpj,
        susep=payload.susep,
        telefone=payload.telefone,
        email=payload.email,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "nome": c.nome, "cnpj": c.cnpj, "susep": c.susep,
            "telefone": c.telefone, "email": c.email}
