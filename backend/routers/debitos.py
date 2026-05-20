"""
Router de Débitos Veiculares — IPVA, Licenciamento e Multas de Trânsito.

GET  /api/db/debitos             → lista DebitoDocumental (filtros: exercicio, empresa)
GET  /api/db/debitos/summary     → KPIs agregados
POST /api/db/debitos             → cria registro de débito
PATCH /api/db/debitos/{id}       → atualiza pagamento IPVA / Licenciamento

GET  /api/db/multas              → lista Multa com dados de reembolso (filtros: exercicio, empresa, status, tipo)
GET  /api/db/multas/summary      → KPIs de multas
POST /api/db/multas              → cria nova multa
PATCH /api/db/multas/{id}        → atualiza status / pagamento / indicação / boleto
POST /api/db/multas/{id}/nic     → gera multa NIC (Não Indicação de Condutor) a partir de original
PATCH /api/db/frota/{id}/restricoes → atualiza restrições administrativas/judiciais do veículo
"""
import json as _json
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func as sf, text
from typing import Optional
from pydantic import BaseModel
from datetime import date
from decimal import Decimal as D

from database import get_db
import models

# ─── Cálculo oficial de encargos (Lei 9.430/96 + DETRAN-SP + CTB Art. 284) ────
_ENC_CFG = {
    "ipva":          {"multa_diaria": D("0.0033"), "multa_max": D("0.20"), "juros_mensal": D("0.0109")},
    "licenciamento": {"multa_diaria": D("0.0033"), "multa_max": D("0.20"), "juros_mensal": D("0.01")},
}

def _calc_encargo_oficial(valor, vencimento: date, tipo: str) -> D:
    """Retorna encargo de mora calculado pelas taxas oficiais brasileiras vigentes."""
    if not valor or not vencimento:
        return D("0")
    hoje = date.today()
    if vencimento >= hoje:
        return D("0")
    dias   = (hoje - vencimento).days
    meses  = dias // 30
    cfg    = _ENC_CFG.get(tipo, _ENC_CFG["ipva"])
    v      = D(str(valor))
    multa  = min(D(str(dias)) * cfg["multa_diaria"], cfg["multa_max"]) * v
    juros  = (D(str(meses)) * max(cfg["juros_mensal"], D("0.01")) * v) if meses > 0 else D("0")
    return (multa + juros).quantize(D("0.01"))

router = APIRouter(tags=["Débitos Veiculares"])


def _sync_multas_aggregate(db: Session, id_veiculo: int, exercicio: int) -> None:
    """Recalcula e persiste valor_multas/encargo_multas no debito_documental.

    Chamado após qualquer mutação na tabela multas (create, patch, nic) para
    garantir que a aba de IPVA&Licenciamento reflita o estado real das multas.
    Apenas multas com status fora de Pago/Cancelado contam como pendentes.
    """
    if not exercicio:
        return
    result = db.execute(text("""
        SELECT
            COALESCE(SUM(valor_multa),        0.0),
            COALESCE(SUM(COALESCE(encargo,0)), 0.0)
        FROM multas
        WHERE id_veiculo   = :vid
          AND exercicio    = :ano
          AND status_multa NOT IN ('Pago', 'Cancelado')
    """), {"vid": id_veiculo, "ano": exercicio}).fetchone()
    db.execute(text("""
        UPDATE debitos_documentais
        SET valor_multas   = :v,
            encargo_multas = :e
        WHERE id_veiculo = :vid AND exercicio = :ano
    """), {
        "v": float(result[0]) if result else 0.0,
        "e": float(result[1]) if result else 0.0,
        "vid": id_veiculo, "ano": exercicio,
    })

_CAMINHAO_TIPAGENS = {
    "cavalo mecânico", "truck", "toco", "bitruck", "semi-reboque",
    "implemento", "caminhão", "caminhao", "basculante",
}


def _classify_vehicle(tipagem: str) -> str:
    t = (tipagem or "").lower()
    if any(x in t for x in _CAMINHAO_TIPAGENS):
        return "caminhao"
    return "carro"


def _resolve_empresa_id(db: Session, sigla: str) -> Optional[int]:
    row = db.execute(
        text("SELECT id FROM empresas WHERE UPPER(sigla) = UPPER(:s)"),
        {"s": sigla.strip()},
    ).fetchone()
    return row[0] if row else None


def _bulk_maps(db: Session, vids: list, eids: list) -> tuple[dict, dict]:
    frota_map: dict = {}
    emp_map:   dict = {}
    if vids:
        for f in db.query(models.Frota).filter(models.Frota.id.in_(vids)).all():
            frota_map[f.id] = {
                "placa":      f.placa,
                "modelo":     f.modelo,
                "tipagem":    f.tipagem,
                "restricoes": getattr(f, "restricoes", None),
                "renavam":    getattr(f, "renavam", None),
            }
    if eids:
        for e in db.query(models.Empresa).filter(models.Empresa.id.in_(eids)).all():
            emp_map[e.id] = {"sigla": e.sigla or e.nome, "nome": e.nome}
    return frota_map, emp_map


def _enrich_debito(row, frota_map: dict, emp_map: dict, ativ_map: dict) -> dict:
    f = frota_map.get(row.id_veiculo, {})
    return {
        "id":            row.id,
        "id_veiculo":    row.id_veiculo,
        "placa":         f.get("placa", "—"),
        "modelo":        f.get("modelo", "—"),
        "renavam":       f.get("renavam") or "—",
        "tipagem":       f.get("tipagem", "—"),
        "tipo_veiculo":  _classify_vehicle(f.get("tipagem", "")),
        "restricoes":    f.get("restricoes"),
        "atividade_score": ativ_map.get(row.id_veiculo, 0),
        "id_empresa":    row.id_empresa,
        "empresa_sigla": emp_map.get(row.id_empresa, {}).get("sigla", "—"),
        "exercicio":     row.exercicio,
        # IPVA
        "valor_ipva":          float(row.valor_ipva or 0),
        "vencimento_ipva":     str(row.vencimento_ipva) if row.vencimento_ipva else None,
        "status_ipva":         row.status_ipva or "Pendente",
        "valor_ipva_pago":     float(row.valor_ipva_pago or 0),
        "data_pgto_ipva":      str(row.data_pgto_ipva) if row.data_pgto_ipva else None,
        "encargo_ipva":        float(row.encargo_ipva or 0),
        # Licenciamento
        "valor_licenciamento":       float(row.valor_licenciamento or 0),
        "vencimento_licenciamento":  str(row.vencimento_licenciamento) if row.vencimento_licenciamento else None,
        "status_licenciamento":      row.status_licenciamento or "Pendente",
        "valor_licenciamento_pago":  float(row.valor_licenciamento_pago or 0),
        "data_pgto_licenciamento":   str(row.data_pgto_licenciamento) if row.data_pgto_licenciamento else None,
        "encargo_licenciamento":     float(row.encargo_licenciamento or 0),
        # Multas (cacheado)
        "valor_multas":   float(row.valor_multas or 0),
        "encargo_multas": float(row.encargo_multas or 0),
    }


def _enrich_multa(row, frota_map: dict, emp_map: dict, cliente_map: dict, reimb_map: dict) -> dict:
    f   = frota_map.get(row.id_veiculo, {})
    rei = reimb_map.get(row.id, {})
    return {
        "id":          row.id,
        "id_veiculo":  row.id_veiculo,
        "placa":       f.get("placa", "—"),
        "modelo":      f.get("modelo", "—"),
        "tipagem":     f.get("tipagem", "—"),
        "id_empresa":  row.id_empresa,
        "empresa_sigla": emp_map.get(row.id_empresa, {}).get("sigla", "—"),
        "id_contrato": row.id_contrato,
        "id_cliente":  row.id_cliente,
        "cliente_nome": cliente_map.get(row.id_cliente, "—") if row.id_cliente else "—",
        "debito_documental_id": row.debito_documental_id,
        "exercicio":   row.exercicio,
        # Fase 1 — Notificação
        "ait":                      row.ait,
        "orgao_emissor":            row.orgao_emissor,
        "data_infracao":            str(row.data_infracao) if row.data_infracao else None,
        "data_emissao_notificacao": str(row.data_emissao_notificacao) if row.data_emissao_notificacao else None,
        "motivo_infracao":          row.motivo_infracao,
        "data_limite_indicacao":    str(row.data_limite_indicacao) if row.data_limite_indicacao else None,
        # Fase 2 — Indicação
        "condutor_indicado": bool(row.condutor_indicado),
        "nome_condutor":     row.nome_condutor,
        "cpf_condutor":      row.cpf_condutor,
        "data_indicacao":    str(row.data_indicacao) if row.data_indicacao else None,
        # Fase 3 — Boleto
        "tipo_multa":         row.tipo_multa,
        "data_emissao_multa": str(row.data_emissao_multa) if row.data_emissao_multa else None,
        "data_vencimento":    str(row.data_vencimento) if row.data_vencimento else None,
        "valor_multa":        float(row.valor_multa),
        # Fase 4 — Desconto
        "desconto_pct":      float(row.desconto_pct or 20),
        "valor_com_desconto": float(row.valor_com_desconto or 0),
        "aplicou_desconto":  row.aplicou_desconto,
        # Fase 5 — Status/Pagamento
        "status_multa":   row.status_multa or "Pendente",
        "data_pagamento": str(row.data_pagamento) if row.data_pagamento else None,
        "valor_pago":     float(row.valor_pago or 0),
        "encargo":        float(row.encargo or 0),
        "multa_origem_id": row.multa_origem_id,
        # Reembolso (de reembolsos.id_multa)
        "reembolso_qtd":    rei.get("qtd", 0),
        "reembolso_valor":  rei.get("valor", 0.0),
        "reembolso_status": rei.get("status"),
        # Comunicação ao cliente
        "comunicado_enviado": bool(getattr(row, "comunicado_enviado", False) or False),
        "data_comunicado":    str(row.data_comunicado) if getattr(row, "data_comunicado", None) else None,
    }


# ─── Pydantic ─────────────────────────────────────────────────────────────────

class DebitoCreate(BaseModel):
    id_veiculo:               int
    id_empresa:               int
    exercicio:                int
    valor_ipva:               Optional[float] = None
    vencimento_ipva:          Optional[date]  = None
    valor_licenciamento:      Optional[float] = None
    vencimento_licenciamento: Optional[date]  = None


class DebitoUpdate(BaseModel):
    valor_ipva:               Optional[float] = None
    vencimento_ipva:          Optional[date]  = None
    status_ipva:              Optional[str]   = None
    valor_ipva_pago:          Optional[float] = None
    data_pgto_ipva:           Optional[date]  = None
    encargo_ipva:             Optional[float] = None
    valor_licenciamento:      Optional[float] = None
    vencimento_licenciamento: Optional[date]  = None
    status_licenciamento:     Optional[str]   = None
    valor_licenciamento_pago: Optional[float] = None
    data_pgto_licenciamento:  Optional[date]  = None
    encargo_licenciamento:    Optional[float] = None


class MultaCreate(BaseModel):
    id_veiculo:               int
    id_empresa:               Optional[int]  = None
    id_contrato:              Optional[int]  = None
    id_cliente:               Optional[int]  = None
    exercicio:                Optional[int]  = None
    ait:                      Optional[str]  = None
    orgao_emissor:            Optional[str]  = None
    data_infracao:            date
    data_emissao_notificacao: Optional[date] = None
    motivo_infracao:          Optional[str]  = None
    data_limite_indicacao:    Optional[date] = None
    condutor_indicado:        bool           = False
    nome_condutor:            Optional[str]  = None
    cpf_condutor:             Optional[str]  = None
    tipo_multa:               str            = "Infração"
    data_emissao_multa:       Optional[date] = None
    data_vencimento:          Optional[date] = None
    valor_multa:              float
    desconto_pct:             Optional[float] = 20.0


class MultaUpdate(BaseModel):
    # Fase 2 — Indicação
    condutor_indicado:  Optional[bool]  = None
    nome_condutor:      Optional[str]   = None
    cpf_condutor:       Optional[str]   = None
    data_indicacao:     Optional[date]  = None
    # Fase 3 — Boleto
    data_emissao_multa: Optional[date]  = None
    data_vencimento:    Optional[date]  = None
    valor_multa:        Optional[float] = None
    desconto_pct:       Optional[float] = None
    valor_com_desconto: Optional[float] = None
    tipo_multa:         Optional[str]   = None
    # Fase 5 — Pagamento
    status_multa:       Optional[str]   = None
    data_pagamento:     Optional[date]  = None
    valor_pago:         Optional[float] = None
    encargo:            Optional[float] = None
    aplicou_desconto:   Optional[bool]  = None
    # Comunicação
    comunicado_enviado: Optional[bool]  = None
    data_comunicado:    Optional[date]  = None


class FrotaRestricaoUpdate(BaseModel):
    restricoes: Optional[str] = None


# ─── DebitoDocumental ─────────────────────────────────────────────────────────

@router.get("/api/db/debitos")
def list_debitos(
    exercicio:            Optional[int] = Query(None),
    empresa:              Optional[str] = Query(None),
    status_ipva:          Optional[str] = Query(None),
    status_licenciamento: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.DebitoDocumental)
    if exercicio:
        q = q.filter(models.DebitoDocumental.exercicio == exercicio)
    if empresa:
        emp_id = _resolve_empresa_id(db, empresa)
        if emp_id is None:
            return []
        q = q.filter(models.DebitoDocumental.id_empresa == emp_id)
    if status_ipva:
        q = q.filter(models.DebitoDocumental.status_ipva == status_ipva)
    if status_licenciamento:
        q = q.filter(models.DebitoDocumental.status_licenciamento == status_licenciamento)

    rows = q.order_by(
        models.DebitoDocumental.exercicio.desc(),
        models.DebitoDocumental.id_veiculo,
    ).all()
    if not rows:
        return []

    # ── Auto-populate encargos para débitos vencidos sem encargo salvo ──────────
    # Encargo é calculado pelas taxas oficiais e persistido no banco.
    # Só sobrescreve quando o valor salvo é 0/null (preserva ajuste manual do usuário).
    hoje = date.today()
    needs_commit = False
    for row in rows:
        if row.status_ipva != "Pago" and row.vencimento_ipva and row.vencimento_ipva < hoje:
            if not row.encargo_ipva or row.encargo_ipva == 0:
                enc = _calc_encargo_oficial(row.valor_ipva, row.vencimento_ipva, "ipva")
                if enc > 0:
                    row.encargo_ipva = enc
                    needs_commit = True
        if row.status_licenciamento != "Pago" and row.vencimento_licenciamento and row.vencimento_licenciamento < hoje:
            if not row.encargo_licenciamento or row.encargo_licenciamento == 0:
                enc = _calc_encargo_oficial(row.valor_licenciamento, row.vencimento_licenciamento, "licenciamento")
                if enc > 0:
                    row.encargo_licenciamento = enc
                    needs_commit = True
    if needs_commit:
        db.commit()
    # ────────────────────────────────────────────────────────────────────────────

    vids = list({r.id_veiculo for r in rows})
    eids = list({r.id_empresa for r in rows if r.id_empresa})
    frota_map, emp_map = _bulk_maps(db, vids, eids)

    # Atividade: dias trabalhados por veículo no exercício
    ano_str = str(exercicio) if exercicio else None
    ativ_rows = db.execute(
        text("SELECT id_veiculo, COALESCE(SUM(trabalhado), 0) FROM fat_unitario WHERE strftime('%Y', mes) = :y GROUP BY id_veiculo"),
        {"y": ano_str or "2025"},
    ).fetchall()
    max_trab   = max((r[1] for r in ativ_rows), default=1) or 1
    ativ_map   = {r[0]: round(r[1] / max_trab * 100) for r in ativ_rows}

    return [_enrich_debito(r, frota_map, emp_map, ativ_map) for r in rows]


@router.get("/api/db/debitos/summary")
def summary_debitos(
    exercicio: Optional[int] = Query(None),
    empresa:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.DebitoDocumental)
    if exercicio:
        q = q.filter(models.DebitoDocumental.exercicio == exercicio)
    if empresa:
        emp_id = _resolve_empresa_id(db, empresa)
        if emp_id is None:
            return {}
        q = q.filter(models.DebitoDocumental.id_empresa == emp_id)
    rows = q.all()
    if not rows:
        return {
            "total_ipva": 0, "total_licenciamento": 0, "total_multas": 0,
            "pendente_ipva": 0, "pendente_licenciamento": 0,
            "pago_ipva": 0, "pago_licenciamento": 0, "quantidade": 0,
            "qtd_ipva_pago": 0, "qtd_ipva_pendente": 0,
            "qtd_lic_pago": 0, "qtd_lic_pendente": 0,
        }
    return {
        "total_ipva":             round(sum(float(r.valor_ipva or 0) for r in rows), 2),
        "total_licenciamento":    round(sum(float(r.valor_licenciamento or 0) for r in rows), 2),
        "total_multas":           round(sum(float(r.valor_multas or 0) for r in rows), 2),
        "pendente_ipva":          round(sum(float(r.valor_ipva or 0) for r in rows if r.status_ipva != "Pago"), 2),
        "pendente_licenciamento": round(sum(float(r.valor_licenciamento or 0) for r in rows if r.status_licenciamento != "Pago"), 2),
        "pago_ipva":              round(sum(float(r.valor_ipva_pago or 0) for r in rows), 2),
        "pago_licenciamento":     round(sum(float(r.valor_licenciamento_pago or 0) for r in rows), 2),
        "quantidade":             len(rows),
        "qtd_ipva_pago":          sum(1 for r in rows if r.status_ipva == "Pago"),
        "qtd_ipva_pendente":      sum(1 for r in rows if r.status_ipva != "Pago"),
        "qtd_lic_pago":           sum(1 for r in rows if r.status_licenciamento == "Pago"),
        "qtd_lic_pendente":       sum(1 for r in rows if r.status_licenciamento != "Pago"),
    }


@router.post("/api/db/debitos", status_code=201)
def criar_debito(payload: DebitoCreate, db: Session = Depends(get_db)):
    dup = db.query(models.DebitoDocumental).filter_by(
        id_veiculo=payload.id_veiculo, exercicio=payload.exercicio
    ).first()
    if dup:
        raise HTTPException(409, f"Débito já registrado para este veículo no exercício {payload.exercicio}")
    row = models.DebitoDocumental(
        id_veiculo=payload.id_veiculo, id_empresa=payload.id_empresa,
        exercicio=payload.exercicio, valor_ipva=payload.valor_ipva,
        vencimento_ipva=payload.vencimento_ipva,
        valor_licenciamento=payload.valor_licenciamento,
        vencimento_licenciamento=payload.vencimento_licenciamento,
    )
    db.add(row); db.commit(); db.refresh(row)
    fm, em = _bulk_maps(db, [row.id_veiculo], [row.id_empresa] if row.id_empresa else [])
    return _enrich_debito(row, fm, em, {})


@router.patch("/api/db/debitos/{debito_id}")
def patch_debito(debito_id: int, payload: DebitoUpdate, db: Session = Depends(get_db)):
    row = db.get(models.DebitoDocumental, debito_id)
    if not row:
        raise HTTPException(404, "Registro não encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit(); db.refresh(row)
    fm, em = _bulk_maps(db, [row.id_veiculo], [row.id_empresa] if row.id_empresa else [])
    return _enrich_debito(row, fm, em, {})


# ─── Multas ───────────────────────────────────────────────────────────────────

@router.get("/api/db/multas")
def list_multas(
    exercicio:  Optional[int] = Query(None),
    empresa:    Optional[str] = Query(None),
    status:     Optional[str] = Query(None),
    tipo:       Optional[str] = Query(None),
    id_veiculo: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.Multa)
    if exercicio:
        q = q.filter(models.Multa.exercicio == exercicio)
    if empresa:
        emp_id = _resolve_empresa_id(db, empresa)
        if emp_id is None:
            return []
        q = q.filter(models.Multa.id_empresa == emp_id)
    if status:
        q = q.filter(models.Multa.status_multa == status)
    if tipo:
        q = q.filter(models.Multa.tipo_multa == tipo)
    if id_veiculo:
        q = q.filter(models.Multa.id_veiculo == id_veiculo)

    rows = q.order_by(models.Multa.data_infracao.desc()).all()
    if not rows:
        return []

    vids  = list({r.id_veiculo for r in rows})
    eids  = list({r.id_empresa for r in rows if r.id_empresa})
    cids  = list({r.id_cliente for r in rows if r.id_cliente})
    mids  = [r.id for r in rows]

    frota_map, emp_map = _bulk_maps(db, vids, eids)
    cliente_map: dict = {}
    if cids:
        for c in db.query(models.Cliente).filter(models.Cliente.id.in_(cids)).all():
            cliente_map[c.id] = c.nome

    # Reembolsos vinculados às multas (campo direto id_multa OU ids_multa_json)
    reimb_map: dict = {}
    if mids:
        mids_set = set(mids)

        def _add_to_map(mid, valor, status):
            if mid not in reimb_map:
                reimb_map[mid] = {"qtd": 0, "valor": 0.0, "status": status}
            reimb_map[mid]["qtd"]   += 1
            reimb_map[mid]["valor"] += float(valor or 0)
            if status == "Recebido":
                reimb_map[mid]["status"] = "Recebido"

        # Busca todos os reembolsos relevantes de uma vez
        all_reimb = (
            db.query(
                models.Reembolso.id_multa,
                models.Reembolso.ids_multa_json,
                models.Reembolso.valor_recebido,
                models.Reembolso.status_recebimento,
            )
            .filter(
                models.Reembolso.status_recebimento.in_(["Recebido", "Pendente"]),
            )
            .all()
        )

        for id_multa, ids_json, valor, status in all_reimb:
            # Reembolso com múltiplas multas — usa ids_multa_json, ignora id_multa
            if ids_json:
                try:
                    ids = [i for i in _json.loads(ids_json) if i in mids_set]
                except Exception:
                    ids = []
                if ids:
                    valor_por_multa = float(valor or 0) / len(_json.loads(ids_json))
                    for mid in ids:
                        _add_to_map(mid, valor_por_multa, status)
            # Reembolso legado (campo direto)
            elif id_multa and id_multa in mids_set:
                _add_to_map(id_multa, valor, status)

    return [_enrich_multa(r, frota_map, emp_map, cliente_map, reimb_map) for r in rows]


@router.get("/api/db/multas/summary")
def summary_multas(
    exercicio: Optional[int] = Query(None),
    empresa:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.Multa)
    if exercicio:
        q = q.filter(models.Multa.exercicio == exercicio)
    if empresa:
        emp_id = _resolve_empresa_id(db, empresa)
        if emp_id is None:
            return {}
        q = q.filter(models.Multa.id_empresa == emp_id)
    rows = q.all()
    if not rows:
        return {
            "total": 0, "pendente": 0, "pago": 0, "nic": 0,
            "indicadas": 0, "quantidade": 0, "qtd_pendente": 0, "qtd_pago": 0, "qtd_nic": 0,
        }
    return {
        "total":        round(sum(float(r.valor_multa) for r in rows), 2),
        "pendente":     round(sum(float(r.valor_multa) for r in rows if r.status_multa not in ("Pago", "Cancelado", "Recorrido")), 2),
        "pago":         round(sum(float(r.valor_pago or 0) for r in rows if r.status_multa == "Pago"), 2),
        "nic":          round(sum(float(r.valor_multa) for r in rows if r.tipo_multa == "Não Indicação de Condutor"), 2),
        "indicadas":    sum(1 for r in rows if r.condutor_indicado),
        "quantidade":   len(rows),
        "qtd_pendente": sum(1 for r in rows if r.status_multa not in ("Pago", "Cancelado")),
        "qtd_pago":     sum(1 for r in rows if r.status_multa == "Pago"),
        "qtd_nic":      sum(1 for r in rows if r.tipo_multa == "Não Indicação de Condutor"),
    }


@router.post("/api/db/multas", status_code=201)
def criar_multa(payload: MultaCreate, db: Session = Depends(get_db)):
    from decimal import Decimal as D
    desc_pct  = payload.desconto_pct or 20.0
    val_desc  = round(payload.valor_multa * (1 - desc_pct / 100), 2)
    exercicio = payload.exercicio or (payload.data_infracao.year if payload.data_infracao else None)
    row = models.Multa(
        id_veiculo=payload.id_veiculo, id_empresa=payload.id_empresa,
        id_contrato=payload.id_contrato, id_cliente=payload.id_cliente,
        exercicio=exercicio, ait=payload.ait, orgao_emissor=payload.orgao_emissor,
        data_infracao=payload.data_infracao,
        data_emissao_notificacao=payload.data_emissao_notificacao,
        motivo_infracao=payload.motivo_infracao,
        data_limite_indicacao=payload.data_limite_indicacao,
        condutor_indicado=payload.condutor_indicado,
        nome_condutor=payload.nome_condutor, cpf_condutor=payload.cpf_condutor,
        tipo_multa=payload.tipo_multa,
        data_emissao_multa=payload.data_emissao_multa,
        data_vencimento=payload.data_vencimento,
        valor_multa=D(str(payload.valor_multa)),
        desconto_pct=D(str(desc_pct)), valor_com_desconto=D(str(val_desc)),
    )
    db.add(row); db.commit(); db.refresh(row)
    _sync_multas_aggregate(db, row.id_veiculo, row.exercicio)
    db.commit()
    fm, em = _bulk_maps(db, [row.id_veiculo], [row.id_empresa] if row.id_empresa else [])
    return _enrich_multa(row, fm, em, {}, {})


@router.patch("/api/db/multas/{multa_id}")
def patch_multa(multa_id: int, payload: MultaUpdate, db: Session = Depends(get_db)):
    from decimal import Decimal as D
    row = db.get(models.Multa, multa_id)
    if not row:
        raise HTTPException(404, "Multa não encontrada")
    updates = payload.model_dump(exclude_unset=True)
    # Recalcula valor_com_desconto se valor_multa ou desconto_pct forem atualizados
    novo_val  = float(updates.get("valor_multa", row.valor_multa or 0))
    novo_desc = float(updates.get("desconto_pct", row.desconto_pct or 20))
    if "valor_multa" in updates or "desconto_pct" in updates:
        if "valor_com_desconto" not in updates:
            updates["valor_com_desconto"] = round(novo_val * (1 - novo_desc / 100), 2)
    for field, value in updates.items():
        setattr(row, field, value)
    db.commit(); db.refresh(row)
    _sync_multas_aggregate(db, row.id_veiculo, row.exercicio)
    db.commit()
    fm, em = _bulk_maps(db, [row.id_veiculo], [row.id_empresa] if row.id_empresa else [])
    cliente_map: dict = {}
    if row.id_cliente:
        c = db.get(models.Cliente, row.id_cliente)
        if c:
            cliente_map[c.id] = c.nome
    return _enrich_multa(row, fm, em, cliente_map, {})


@router.post("/api/db/multas/{multa_id}/nic", status_code=201)
def criar_nic(multa_id: int, db: Session = Depends(get_db)):
    """Cria automaticamente a multa NIC (Não Indicação de Condutor) a partir da original."""
    from decimal import Decimal as D
    from datetime import timedelta
    original = db.get(models.Multa, multa_id)
    if not original:
        raise HTTPException(404, "Multa original não encontrada")
    if original.condutor_indicado:
        raise HTTPException(409, "Condutor já foi indicado — NIC não aplicável")
    # Verifica se já existe NIC para esta multa
    nic_existente = db.query(models.Multa).filter_by(multa_origem_id=multa_id).first()
    if nic_existente:
        raise HTTPException(409, "Multa NIC já existe para esta infração")

    val_nic  = (original.valor_multa or D("0")) * D("2")
    val_desc = (val_nic * D("0.80")).quantize(D("0.01"))
    venc_nic = (original.data_vencimento + timedelta(days=10)) if original.data_vencimento else None

    nic = models.Multa(
        id_veiculo=original.id_veiculo, id_empresa=original.id_empresa,
        id_contrato=original.id_contrato, id_cliente=original.id_cliente,
        debito_documental_id=original.debito_documental_id,
        exercicio=original.exercicio,
        ait=f"NIC-{original.ait}" if original.ait else None,
        orgao_emissor=original.orgao_emissor,
        data_infracao=original.data_infracao,
        motivo_infracao="Não indicação de condutor responsável (CTB Art. 257 §8)",
        tipo_multa="Não Indicação de Condutor",
        data_emissao_multa=original.data_emissao_multa,
        data_vencimento=venc_nic,
        valor_multa=val_nic, desconto_pct=D("20.00"), valor_com_desconto=val_desc,
        condutor_indicado=False,
        multa_origem_id=multa_id,
    )
    db.add(nic); db.commit(); db.refresh(nic)
    _sync_multas_aggregate(db, nic.id_veiculo, nic.exercicio)
    db.commit()
    fm, em = _bulk_maps(db, [nic.id_veiculo], [nic.id_empresa] if nic.id_empresa else [])
    return _enrich_multa(nic, fm, em, {}, {})


# ─── Frota — restrições ───────────────────────────────────────────────────────

@router.patch("/api/db/frota/{veiculo_id}/restricoes")
def patch_restricoes(veiculo_id: int, payload: FrotaRestricaoUpdate, db: Session = Depends(get_db)):
    v = db.get(models.Frota, veiculo_id)
    if not v:
        raise HTTPException(404, "Veículo não encontrado")
    v.restricoes = payload.restricoes
    db.commit()
    return {"id": v.id, "placa": v.placa, "restricoes": v.restricoes}
