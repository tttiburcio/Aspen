"""
Router de Contratos — endpoints de leitura para o módulo de Reembolsos.

GET /api/db/contratos                        → lista contratos (padrão: só ativos)
GET /api/db/contratos/{id}/veiculos          → veículos vinculados ao contrato
GET /api/db/contratos/{id}/faturas           → faturas de locação do cliente do contrato
GET /api/db/clientes                         → lista clientes
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional

from database import get_db
import models

router = APIRouter(tags=["Contratos"])


def _fmt_mes(mes) -> str:
    if not mes:
        return "—"
    try:
        from datetime import datetime
        MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
                 "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
        d = mes if hasattr(mes, "month") else datetime.strptime(str(mes)[:10], "%Y-%m-%d")
        return f"{MESES[d.month - 1]}/{d.year}"
    except Exception:
        return str(mes)[:7]


@router.get("/api/db/contratos")
def list_contratos(
    incluir_inativos: bool = Query(False, description="Se True, inclui Encerrado e Renovado"),
    db: Session = Depends(get_db),
):
    q = db.query(models.Contrato)
    if not incluir_inativos:
        q = q.filter(models.Contrato.status_contrato == "Ativo")

    rows = q.order_by(models.Contrato.nome_cliente).all()

    # Mapeia empresa_id → sigla
    ids_empresa = list({r.empresa_id for r in rows if r.empresa_id})
    emp_map = {}
    if ids_empresa:
        for e in db.query(models.Empresa).filter(models.Empresa.id.in_(ids_empresa)).all():
            emp_map[e.id] = e.sigla or e.nome

    # Mapeia contrato_id → lista de placas
    contrato_ids = [r.id for r in rows]
    links = (
        db.query(models.ContratoVeiculo)
        .filter(models.ContratoVeiculo.contrato_id.in_(contrato_ids))
        .all()
    ) if contrato_ids else []

    veiculo_ids = list({lk.id_veiculo for lk in links if lk.id_veiculo})
    frota_map = {
        v.id: v.placa for v in
        db.query(models.Frota).filter(models.Frota.id.in_(veiculo_ids)).all()
    } if veiculo_ids else {}

    placas_por_contrato: dict[int, list[str]] = {}
    for lk in links:
        placa = frota_map.get(lk.id_veiculo) or ""
        placas_por_contrato.setdefault(lk.contrato_id, []).append(placa)

    return [
        {
            "id":            r.id,
            "empresa_id":    r.empresa_id,
            "empresa_sigla": emp_map.get(r.empresa_id, "—"),
            "nome_cliente":  r.nome_cliente,
            "placas":        [p for p in placas_por_contrato.get(r.id, []) if p],
            "status":        r.status_contrato,
            "cliente_id":    r.cliente_id,
            "data_inicio":   str(r.data_inicio)  if r.data_inicio  else None,
            "data_fim":      str(r.data_fim)     if r.data_fim     else None,
        }
        for r in rows
    ]


@router.get("/api/db/contratos/{contrato_id}/veiculos")
def list_veiculos_contrato(
    contrato_id: int,
    db: Session = Depends(get_db),
):
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
            "id_veiculo": lk.id_veiculo,
            "sequencia":  lk.sequencia,
            "placa":      frota_map[lk.id_veiculo].placa  if lk.id_veiculo in frota_map else None,
            "modelo":     frota_map[lk.id_veiculo].modelo if lk.id_veiculo in frota_map else None,
            "empresa":    frota_map[lk.id_veiculo].empresa if lk.id_veiculo in frota_map else None,
        }
        for lk in links
    ]


@router.get("/api/db/contratos/{contrato_id}/faturas")
def list_faturas_contrato(
    contrato_id: int,
    db: Session = Depends(get_db),
):
    """
    Retorna faturas de locação emitidas para o cliente do contrato.
    Usa faturamento_mensal filtrado por id_cliente_excel = contrato.cliente_id.
    A empresa emissora vem do campo empresa_id do contrato (→ sigla).
    """
    contrato = db.query(models.Contrato).filter(models.Contrato.id == contrato_id).first()
    if not contrato:
        return []

    # Empresa emissora (TKJ / FINITA / LANDKRAFT)
    empresa_sigla = "—"
    if contrato.empresa_id:
        emp = db.query(models.Empresa).filter(models.Empresa.id == contrato.empresa_id).first()
        if emp:
            empresa_sigla = emp.sigla or emp.nome

    if not contrato.cliente_id:
        return []

    rows = (
        db.query(models.FaturamentoMensal)
        .filter(models.FaturamentoMensal.id_cliente_excel == contrato.cliente_id)
        .order_by(models.FaturamentoMensal.emissao.desc())
        .all()
    )

    return [
        {
            "id":                r.id,
            "id_fatura_excel":   r.id_fatura_excel,
            "emissao":           str(r.emissao)     if r.emissao     else None,
            "emissao_display":   _fmt_mes(r.emissao),
            "vencimento":        str(r.vencimento)  if r.vencimento  else None,
            "valor_locacoes":    float(r.valor_locacoes) if r.valor_locacoes else 0.0,
            "valor_recebido":    float(r.valor_recebido) if r.valor_recebido else 0.0,
            "status_recebimento": r.status_recebimento,
            "empresa_emissora":  empresa_sigla,
            "cliente":           r.empresa,          # nome do cliente/tomador no XML
        }
        for r in rows
    ]


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
