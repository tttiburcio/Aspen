"""
Router de Contratos — CRUD completo para administração de contratos.

GET    /api/db/contratos                           → lista (filtros: status, empresa, incluir_inativos)
GET    /api/db/contratos/frota-disponivel          → todos os veículos (para seleção no form)
GET    /api/db/contratos/{id}                      → contrato único com detalhes
POST   /api/db/contratos                           → criar contrato
PATCH  /api/db/contratos/{id}                      → atualizar contrato
DELETE /api/db/contratos/{id}                      → excluir (bloqueia se há faturas)
GET    /api/db/contratos/{id}/veiculos             → veículos vinculados
POST   /api/db/contratos/{id}/veiculos             → adicionar veículo
DELETE /api/db/contratos/{id}/veiculos/{id_veiculo} → remover veículo
GET    /api/db/contratos/{id}/faturas              → faturas do contrato
GET    /api/db/clientes                            → lista de clientes
"""
from datetime import date, date as _date_cls
from typing import Optional, List, Literal
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func as sf
from pydantic import BaseModel

from database import get_db
import models

router = APIRouter(tags=["Contratos"])

MESES_BR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
            "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


# ── Helpers ──────────────────────────────────────────────────────────

def _fmt_mes(mes) -> str:
    if not mes:
        return "—"
    try:
        from datetime import datetime
        d = mes if hasattr(mes, "month") else datetime.strptime(str(mes)[:10], "%Y-%m-%d")
        return f"{MESES_BR[d.month - 1]}/{d.year}"
    except Exception:
        return str(mes)[:7]


def _build_maps(db: Session, rows):
    """Carrega emp_map e placas_map em bulk para uma lista de contratos."""
    emp_ids = list({r.empresa_id for r in rows if r.empresa_id})
    emp_map: dict[int, str] = {}
    if emp_ids:
        for e in db.query(models.Empresa).filter(models.Empresa.id.in_(emp_ids)).all():
            emp_map[e.id] = e.sigla or e.nome

    ct_ids = [r.id for r in rows]
    links = (
        db.query(models.ContratoVeiculo)
        .filter(models.ContratoVeiculo.contrato_id.in_(ct_ids))
        .all()
    ) if ct_ids else []

    v_ids = list({lk.id_veiculo for lk in links if lk.id_veiculo})
    frota_map = {
        v.id: v for v in db.query(models.Frota).filter(models.Frota.id.in_(v_ids)).all()
    } if v_ids else {}

    placas_map: dict[int, list[dict]] = {}
    for lk in links:
        f = frota_map.get(lk.id_veiculo)
        if f:
            placas_map.setdefault(lk.contrato_id, []).append({
                "id_veiculo": f.id,
                "placa":      f.placa,
                "modelo":     f.modelo,
                "id_empresa": f.id_empresa,
            })

    return emp_map, placas_map


def _calc_medicoes(inicio, fim) -> Optional[int]:
    """Quantidade de meses entre data_inicio e data_fim (inclusive os dois extremos)."""
    if not inicio or not fim:
        return None
    return max(0, (fim.year - inicio.year) * 12 + (fim.month - inicio.month) + 1)


def _dias_restantes(row: models.Contrato) -> Optional[int]:
    if row.status_contrato != "Ativo" or not row.data_fim:
        return None
    delta = (row.data_fim - _date_cls.today()).days
    return max(0, delta)


def _enrich(row: models.Contrato, emp_map: dict, placas_map: dict) -> dict:
    veiculos = placas_map.get(row.id, [])
    return {
        "id":                row.id,
        "empresa_id":        row.empresa_id,
        "empresa_sigla":     emp_map.get(row.empresa_id, "—"),
        "cliente_id":        row.cliente_id,
        "nome_cliente":      row.nome_cliente,
        "cidade_operacao":   row.cidade_operacao,
        "estado_operacao":   row.estado_operacao,
        "data_inicio":       str(row.data_inicio)       if row.data_inicio       else None,
        "data_fim":          str(row.data_fim)          if row.data_fim          else None,
        "data_encerramento": str(row.data_encerramento) if row.data_encerramento else None,
        "status":            row.status_contrato,
        "dias_restantes":    _dias_restantes(row),
        # ── Pagamento ─────────────────────────
        "forma_pagamento":   row.forma_pagamento,
        "multa_pct":         float(row.multa_pct)  if row.multa_pct  else None,
        "juros_pct":         float(row.juros_pct)  if row.juros_pct  else None,
        "dias_protesto":     row.dias_protesto,
        # ── Controle ──────────────────────────
        "medicoes_total":    row.medicoes_total,
        "assinado":          bool(row.assinado) if row.assinado is not None else False,
        # ── Veículos ──────────────────────────
        "veiculos":          veiculos,
        "placas":            [v["placa"] for v in veiculos],
        "qtd_veiculos":      len(veiculos),
    }


# ── Pydantic ─────────────────────────────────────────────────────────

class ContratoCreate(BaseModel):
    empresa_id:      Optional[int]   = None
    cliente_id:      Optional[int]   = None
    nome_cliente:    str
    cidade_operacao: Optional[str]   = None
    estado_operacao: Optional[str]   = None
    data_inicio:     Optional[date]  = None
    data_fim:        Optional[date]  = None
    status_contrato: Literal["Ativo","Encerrado","Suspenso","Em negociação"] = "Ativo"
    forma_pagamento: Optional[str]   = None
    multa_pct:       Optional[float] = None
    juros_pct:       Optional[float] = None
    dias_protesto:   Optional[int]   = None
    assinado:        Optional[bool]  = False


class ContratoUpdate(BaseModel):
    empresa_id:        Optional[int]   = None
    cliente_id:        Optional[int]   = None
    nome_cliente:      Optional[str]   = None
    cidade_operacao:   Optional[str]   = None
    estado_operacao:   Optional[str]   = None
    data_inicio:       Optional[date]  = None
    data_fim:          Optional[date]  = None
    data_encerramento: Optional[date]  = None
    status_contrato:   Optional[str]   = None
    forma_pagamento:   Optional[str]   = None
    multa_pct:         Optional[float] = None
    juros_pct:         Optional[float] = None
    dias_protesto:     Optional[int]   = None
    assinado:          Optional[bool]  = None


class VeiculoLink(BaseModel):
    id_veiculo:   int
    sequencia:    Optional[int]   = None
    valor_mensal: Optional[float] = None


class VeiculoAditivoItem(BaseModel):
    id_veiculo:   int
    valor_mensal: Optional[float] = None


class AditivoPayload(BaseModel):
    nova_data_fim: date
    reajuste_pct:  Optional[float]              = None   # % global, ex: 10.5 → +10,5%
    veiculos:      Optional[List[VeiculoAditivoItem]] = None  # valores individuais finais
    adicionar:     Optional[List[VeiculoLink]]  = None
    remover:       Optional[List[int]]          = None   # lista de id_veiculo


# ── Endpoints ─────────────────────────────────────────────────────────

@router.get("/api/db/contratos/frota-disponivel")
def frota_disponivel(
    contrato_id: Optional[int] = Query(None, description="ID do contrato em edição — seus próprios veículos não contam como ocupados"),
    db: Session = Depends(get_db),
):
    """Veículos disponíveis para vinculação: não estão em nenhum contrato ativo (exceto o contrato sendo editado)."""
    # Veículos ocupados por outros contratos ativos
    q = (
        db.query(models.ContratoVeiculo.id_veiculo)
        .join(models.Contrato, models.ContratoVeiculo.contrato_id == models.Contrato.id)
        .filter(models.Contrato.status_contrato == "Ativo")
    )
    if contrato_id:
        q = q.filter(models.ContratoVeiculo.contrato_id != contrato_id)
    taken_ids = {r[0] for r in q.all()}

    rows = db.query(models.Frota).order_by(models.Frota.placa).all()
    ids_empresa = list({r.id_empresa for r in rows if r.id_empresa})
    emp_map = {}
    if ids_empresa:
        for e in db.query(models.Empresa).filter(models.Empresa.id.in_(ids_empresa)).all():
            emp_map[e.id] = e.sigla or e.nome

    # Retorna apenas os disponíveis
    return [
        {
            "id":         r.id,
            "placa":      r.placa,
            "modelo":     r.modelo,
            "marca":      r.marca,
            "id_empresa": r.id_empresa,
            "empresa":    emp_map.get(r.id_empresa, "—"),
            "status":     r.status,
        }
        for r in rows
        if r.id not in taken_ids
    ]


@router.get("/api/db/contratos")
def list_contratos(
    incluir_inativos: bool         = Query(False),
    status:           Optional[str] = Query(None),
    empresa:          Optional[str] = Query(None, description="Sigla da empresa emissora"),
    db: Session = Depends(get_db),
):
    q = db.query(models.Contrato)
    if status:
        q = q.filter(models.Contrato.status_contrato == status)
    elif not incluir_inativos:
        q = q.filter(models.Contrato.status_contrato == "Ativo")

    if empresa:
        from sqlalchemy import text
        emp = db.execute(
            text("SELECT id FROM empresas WHERE UPPER(sigla) = UPPER(:s)"),
            {"s": empresa.strip()},
        ).fetchone()
        if emp:
            q = q.filter(models.Contrato.empresa_id == emp[0])
        else:
            return []

    rows = q.order_by(models.Contrato.nome_cliente).all()
    emp_map, placas_map = _build_maps(db, rows)
    return [_enrich(r, emp_map, placas_map) for r in rows]


@router.get("/api/db/contratos/{contrato_id}/veiculos")
def list_veiculos_contrato(contrato_id: int, db: Session = Depends(get_db)):
    links = (
        db.query(models.ContratoVeiculo)
        .filter(models.ContratoVeiculo.contrato_id == contrato_id)
        .order_by(models.ContratoVeiculo.sequencia)
        .all()
    )
    ids = [lk.id_veiculo for lk in links]
    frota_map = {
        v.id: v for v in db.query(models.Frota).filter(models.Frota.id.in_(ids)).all()
    } if ids else {}
    return [
        {
            "id_veiculo":   lk.id_veiculo,
            "sequencia":    lk.sequencia,
            "valor_mensal": float(lk.valor_mensal) if lk.valor_mensal else None,
            "placa":        frota_map[lk.id_veiculo].placa      if lk.id_veiculo in frota_map else None,
            "modelo":       frota_map[lk.id_veiculo].modelo     if lk.id_veiculo in frota_map else None,
            "id_empresa":   frota_map[lk.id_veiculo].id_empresa if lk.id_veiculo in frota_map else None,
        }
        for lk in links
    ]


@router.get("/api/db/contratos/{contrato_id}/metricas-veiculos")
def metricas_veiculos_contrato(contrato_id: int, db: Session = Depends(get_db)):
    """Retorna por veículo: valor_mensal, diária, medições consumidas/restantes, total medido/pendente."""
    from sqlalchemy import text
    contrato = db.get(models.Contrato, contrato_id)
    if not contrato:
        raise HTTPException(404, "Contrato não encontrado")

    links = (
        db.query(models.ContratoVeiculo)
        .filter(models.ContratoVeiculo.contrato_id == contrato_id)
        .order_by(models.ContratoVeiculo.sequencia)
        .all()
    )
    ids = [lk.id_veiculo for lk in links]
    valor_map = {lk.id_veiculo: float(lk.valor_mensal or 0) for lk in links}
    frota_map = {
        v.id: v for v in db.query(models.Frota).filter(models.Frota.id.in_(ids)).all()
    } if ids else {}

    today = _date_cls.today()
    dias_restantes  = max(0, (contrato.data_fim - today).days) if contrato.data_fim and contrato.data_fim > today else 0
    medicoes_total  = contrato.medicoes_total or _calc_medicoes(contrato.data_inicio, contrato.data_fim) or 0

    inicio_str = str(contrato.data_inicio) if contrato.data_inicio else "2000-01-01"
    fim_str    = str(contrato.data_fim)    if contrato.data_fim    else "9999-12-31"

    # Single bulk query instead of 1 query per vehicle
    if ids:
        placeholders = ",".join(str(i) for i in ids)
        fat_rows = db.execute(
            text(f"""
                SELECT id_veiculo, COUNT(*) AS cnt, COALESCE(SUM(COALESCE(medicao,0)),0) AS total
                FROM fat_unitario
                WHERE id_veiculo IN ({placeholders}) AND mes >= :ini AND mes <= :fim
                GROUP BY id_veiculo
            """),
            {"ini": inicio_str, "fim": fim_str},
        ).fetchall()
    else:
        fat_rows = []
    fat_map = {row[0]: (int(row[1]), float(row[2])) for row in fat_rows}

    veiculos_data = []
    for lk in links:
        v   = frota_map.get(lk.id_veiculo)
        vm  = valor_map.get(lk.id_veiculo, 0.0)
        medicoes_consumidas, total_medido = fat_map.get(lk.id_veiculo, (0, 0.0))
        medicoes_restantes = max(0, medicoes_total - medicoes_consumidas)
        total_pendente     = round(vm * medicoes_restantes, 2)

        veiculos_data.append({
            "id_veiculo":          lk.id_veiculo,
            "placa":               v.placa  if v else None,
            "modelo":              v.modelo if v else None,
            "valor_mensal":        round(vm, 2),
            "valor_diaria":        round(vm / 30, 2) if vm > 0 else 0.0,
            "medicoes_consumidas": medicoes_consumidas,
            "medicoes_total":      medicoes_total,
            "medicoes_restantes":  medicoes_restantes,
            "total_medido":        round(total_medido, 2),
            "total_pendente":      total_pendente,
        })

    valor_mensal_total = sum(valor_map.values())
    return {
        "dias_restantes":      dias_restantes,
        "medicoes_total":      medicoes_total,
        "valor_mensal_total":  round(valor_mensal_total, 2),
        "total_medido":        round(sum(v["total_medido"]   for v in veiculos_data), 2),
        "total_pendente":      round(sum(v["total_pendente"] for v in veiculos_data), 2),
        "veiculos":            veiculos_data,
    }


@router.get("/api/db/contratos/{contrato_id}/faturas")
def list_faturas_contrato(contrato_id: int, db: Session = Depends(get_db)):
    contrato = db.get(models.Contrato, contrato_id)
    if not contrato:
        return []

    empresa_sigla = "—"
    if contrato.empresa_id:
        emp = db.get(models.Empresa, contrato.empresa_id)
        if emp:
            empresa_sigla = emp.sigla or emp.nome

    rows = (
        db.query(models.FaturamentoMensal)
        .filter(models.FaturamentoMensal.id_contrato == contrato_id)
        .order_by(models.FaturamentoMensal.emissao.desc())
        .all()
    )
    return [
        {
            "id":                 r.id,
            "emissao":            str(r.emissao)    if r.emissao    else None,
            "emissao_display":    _fmt_mes(r.emissao),
            "vencimento":         str(r.vencimento) if r.vencimento else None,
            "valor_locacoes":     float(r.valor_locacoes)   if r.valor_locacoes   else 0.0,
            "valor_recebido":     float(r.valor_recebido)   if r.valor_recebido   else 0.0,
            "status_recebimento": r.status_recebimento,
            "empresa_emissora":   empresa_sigla,
            "aliquota_imposto":   float(r.aliquota_imposto) if r.aliquota_imposto else 11.33,
            "valor_imposto":      float(r.valor_imposto)    if r.valor_imposto    else 0.0,
            "valor_liquido":      float(r.valor_liquido)    if r.valor_liquido    else 0.0,
            "status_imposto":     r.status_imposto or "Pendente",
            "data_pgto_imposto":  str(r.data_pgto_imposto)  if r.data_pgto_imposto  else None,
            "encargo_imposto":    float(r.encargo_imposto)  if r.encargo_imposto    else 0.0,
        }
        for r in rows
    ]


@router.get("/api/db/contratos/{contrato_id}")
def get_contrato(contrato_id: int, db: Session = Depends(get_db)):
    row = db.get(models.Contrato, contrato_id)
    if not row:
        raise HTTPException(404, "Contrato não encontrado")
    emp_map, placas_map = _build_maps(db, [row])
    return _enrich(row, emp_map, placas_map)


@router.post("/api/db/contratos", status_code=201)
def criar_contrato(payload: ContratoCreate, db: Session = Depends(get_db)):
    row = models.Contrato(
        empresa_id      = payload.empresa_id,
        cliente_id      = payload.cliente_id,
        nome_cliente    = payload.nome_cliente,
        cidade_operacao = payload.cidade_operacao,
        estado_operacao = payload.estado_operacao,
        data_inicio     = payload.data_inicio,
        data_fim        = payload.data_fim,
        status_contrato = payload.status_contrato,
        forma_pagamento = payload.forma_pagamento,
        multa_pct       = payload.multa_pct,
        juros_pct       = payload.juros_pct,
        dias_protesto   = payload.dias_protesto,
        assinado        = payload.assinado or False,
        medicoes_total  = _calc_medicoes(payload.data_inicio, payload.data_fim),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    emp_map, placas_map = _build_maps(db, [row])
    return _enrich(row, emp_map, placas_map)


@router.patch("/api/db/contratos/{contrato_id}")
def atualizar_contrato(
    contrato_id: int,
    payload: ContratoUpdate,
    db: Session = Depends(get_db),
):
    row = db.get(models.Contrato, contrato_id)
    if not row:
        raise HTTPException(404, "Contrato não encontrado")
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(row, field, value)
    # Recalcula medicoes_total se alguma das datas foi alterada
    if "data_inicio" in updates or "data_fim" in updates:
        row.medicoes_total = _calc_medicoes(row.data_inicio, row.data_fim)
    db.commit()
    db.refresh(row)
    emp_map, placas_map = _build_maps(db, [row])
    return _enrich(row, emp_map, placas_map)


@router.delete("/api/db/contratos/{contrato_id}", status_code=204)
def deletar_contrato(contrato_id: int, db: Session = Depends(get_db)):
    row = db.get(models.Contrato, contrato_id)
    if not row:
        raise HTTPException(404, "Contrato não encontrado")
    fat_count = (
        db.query(models.FaturamentoMensal)
        .filter(models.FaturamentoMensal.id_contrato == contrato_id)
        .count()
    )
    if fat_count > 0:
        raise HTTPException(
            409,
            f"Contrato possui {fat_count} fatura(s) vinculada(s). Encerre-o ao invés de excluir.",
        )
    db.query(models.ContratoVeiculo).filter(
        models.ContratoVeiculo.contrato_id == contrato_id
    ).delete()
    db.delete(row)
    db.commit()


@router.put("/api/db/contratos/{contrato_id}/veiculos")
def sync_veiculos(
    contrato_id: int,
    payload: list[VeiculoLink],
    db: Session = Depends(get_db),
):
    """Substitui todos os vínculos de veículos do contrato atomicamente."""
    if not db.get(models.Contrato, contrato_id):
        raise HTTPException(404, "Contrato não encontrado")
    db.query(models.ContratoVeiculo).filter(
        models.ContratoVeiculo.contrato_id == contrato_id
    ).delete()
    for seq, v in enumerate(payload, start=1):
        db.add(models.ContratoVeiculo(
            contrato_id  = contrato_id,
            id_veiculo   = v.id_veiculo,
            sequencia    = v.sequencia or seq,
            valor_mensal = v.valor_mensal,
        ))
    db.commit()
    return {"ok": True, "total": len(payload)}


@router.post("/api/db/contratos/{contrato_id}/veiculos", status_code=201)
def adicionar_veiculo(
    contrato_id: int,
    payload: VeiculoLink,
    db: Session = Depends(get_db),
):
    if not db.get(models.Contrato, contrato_id):
        raise HTTPException(404, "Contrato não encontrado")
    if not db.get(models.Frota, payload.id_veiculo):
        raise HTTPException(404, "Veículo não encontrado")
    exists = (
        db.query(models.ContratoVeiculo)
        .filter(
            models.ContratoVeiculo.contrato_id == contrato_id,
            models.ContratoVeiculo.id_veiculo  == payload.id_veiculo,
        )
        .first()
    )
    if exists:
        raise HTTPException(409, "Veículo já vinculado a este contrato")
    max_seq = (
        db.query(sf.max(models.ContratoVeiculo.sequencia))
        .filter(models.ContratoVeiculo.contrato_id == contrato_id)
        .scalar()
    ) or 0
    link = models.ContratoVeiculo(
        contrato_id  = contrato_id,
        id_veiculo   = payload.id_veiculo,
        sequencia    = payload.sequencia or (max_seq + 1),
        valor_mensal = payload.valor_mensal,
    )
    db.add(link)
    db.commit()
    return {"ok": True}


@router.delete("/api/db/contratos/{contrato_id}/veiculos/{id_veiculo}", status_code=204)
def remover_veiculo(contrato_id: int, id_veiculo: int, db: Session = Depends(get_db)):
    link = (
        db.query(models.ContratoVeiculo)
        .filter(
            models.ContratoVeiculo.contrato_id == contrato_id,
            models.ContratoVeiculo.id_veiculo  == id_veiculo,
        )
        .first()
    )
    if not link:
        raise HTTPException(404, "Vínculo não encontrado")
    db.delete(link)
    db.commit()


@router.post("/api/db/contratos/{contrato_id}/aditivo")
def criar_aditivo(contrato_id: int, payload: AditivoPayload, db: Session = Depends(get_db)):
    """Adita o contrato: estende prazo, aplica reajuste, adiciona/remove veículos."""
    contrato = db.get(models.Contrato, contrato_id)
    if not contrato:
        raise HTTPException(404, "Contrato não encontrado")

    # 1. Novo prazo
    contrato.data_fim = payload.nova_data_fim
    contrato.medicoes_total = _calc_medicoes(contrato.data_inicio, contrato.data_fim)
    contrato.status_contrato = "Ativo"

    # 2. Atualizar valores dos veículos
    links = (
        db.query(models.ContratoVeiculo)
        .filter(models.ContratoVeiculo.contrato_id == contrato_id)
        .all()
    )
    if payload.veiculos:
        valor_map = {v.id_veiculo: v.valor_mensal for v in payload.veiculos if v.valor_mensal is not None}
        for lk in links:
            if lk.id_veiculo in valor_map:
                lk.valor_mensal = valor_map[lk.id_veiculo]
    elif payload.reajuste_pct is not None and payload.reajuste_pct != 0:
        factor = 1 + payload.reajuste_pct / 100
        for lk in links:
            if lk.valor_mensal:
                lk.valor_mensal = round(float(lk.valor_mensal) * factor, 2)

    # 3. Remover veículos
    if payload.remover:
        db.query(models.ContratoVeiculo).filter(
            models.ContratoVeiculo.contrato_id == contrato_id,
            models.ContratoVeiculo.id_veiculo.in_(payload.remover),
        ).delete(synchronize_session=False)

    # 4. Adicionar veículos
    if payload.adicionar:
        max_seq = db.query(sf.max(models.ContratoVeiculo.sequencia)).filter(
            models.ContratoVeiculo.contrato_id == contrato_id
        ).scalar() or 0
        for i, v in enumerate(payload.adicionar):
            already = db.query(models.ContratoVeiculo).filter(
                models.ContratoVeiculo.contrato_id == contrato_id,
                models.ContratoVeiculo.id_veiculo  == v.id_veiculo,
            ).first()
            if not already:
                db.add(models.ContratoVeiculo(
                    contrato_id  = contrato_id,
                    id_veiculo   = v.id_veiculo,
                    sequencia    = v.sequencia or (max_seq + i + 1),
                    valor_mensal = v.valor_mensal,
                ))

    db.commit()
    db.refresh(contrato)
    emp_map, placas_map = _build_maps(db, [contrato])
    return _enrich(contrato, emp_map, placas_map)


@router.get("/api/db/clientes")
def list_clientes(db: Session = Depends(get_db)):
    rows = db.query(models.Cliente).order_by(models.Cliente.nome).all()
    return [
        {
            "id":        r.id,
            "nome":      r.nome,
            "municipio": r.municipio,
            "estado":    r.estado,
            "status":    r.status_cliente,
        }
        for r in rows
    ]
