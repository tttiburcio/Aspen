"""
Router de Notificações — endpoint calculado em tempo real, sem tabela persistida.

GET /api/db/notifications  → lista de alertas agrupados por prioridade
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date, timedelta
from typing import Optional

from database import get_db
import models

router = APIRouter(tags=["Notifications"])

PRIORIDADE_ORDER = {"critica": 0, "urgente": 1, "alerta": 2, "info": 3}


def _empresa_id(db: Session, sigla: str) -> Optional[int]:
    row = db.execute(
        text("SELECT id FROM empresas WHERE UPPER(sigla) = UPPER(:s)"), {"s": sigla}
    ).fetchone()
    return row[0] if row else None


def _emp_sigla_map(db: Session) -> dict:
    rows = db.execute(text("SELECT id, sigla, nome FROM empresas")).fetchall()
    return {r[0]: r[1] or r[2] for r in rows}


def _contrato_nome_map(db: Session) -> dict:
    rows = db.execute(text("SELECT id, nome_cliente FROM contratos")).fetchall()
    return {r[0]: r[1] or "—" for r in rows}


@router.get("/api/db/notifications")
def get_notifications(
    empresa: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    hoje = date.today()
    emp_map    = _emp_sigla_map(db)
    ct_map     = _contrato_nome_map(db)
    emp_filter = _empresa_id(db, empresa) if empresa else None

    items = []

    # ─── 1. Faturas vencidas / a vencer ───────────────────────────────────
    # 'Vencido' normalmente é computado ('Pendente' + vencimento < hoje), mas o formulário
    # permite gravar 'Vencido' diretamente ao cadastrar faturas históricas.
    # Capturamos ambos os valores para não perder nenhum caso.
    # Janela: todas as atrasadas (sem limite inferior) + vencendo em até 30 dias.
    fat_q = db.query(models.FaturamentoMensal).filter(
        models.FaturamentoMensal.status_recebimento.in_(["Pendente", "Vencido"]),
        models.FaturamentoMensal.vencimento != None,
        models.FaturamentoMensal.vencimento <= hoje + timedelta(days=30),
    )
    if emp_filter:
        fat_q = fat_q.filter(models.FaturamentoMensal.id_empresa == emp_filter)

    faturas = fat_q.all()

    # Pré-carrega contratos necessários para fallback de dias_protesto (evita N+1)
    ct_ids_sem_encargo = {
        f.id_contrato for f in faturas
        if f.dias_protesto is None and f.id_contrato
    }
    contratos_map: dict = {}
    if ct_ids_sem_encargo:
        for c in db.query(models.Contrato).filter(models.Contrato.id.in_(ct_ids_sem_encargo)).all():
            contratos_map[c.id] = c

    for f in faturas:
        dias = (hoje - f.vencimento).days  # positivo = vencido; negativo = faltam dias
        cliente  = ct_map.get(f.id_contrato) or f.empresa or "—"
        emissora = emp_map.get(f.id_empresa, "—")
        valor    = float(f.valor_locacoes or 0)
        num      = f"#{f.numero_fatura}" if f.numero_fatura else f"ID {f.id}"

        # Dias de protesto: da fatura ou fallback do contrato (já pré-carregado)
        dias_protesto = f.dias_protesto
        if dias_protesto is None and f.id_contrato:
            ct_obj = contratos_map.get(f.id_contrato)
            if ct_obj:
                dias_protesto = ct_obj.dias_protesto

        def _brl(v): return f"R$ {v:_.2f}".replace("_", "X").replace(".", ",").replace("X", ".")

        if dias > 0:
            # Vencida
            if dias_protesto is not None and dias >= dias_protesto:
                prioridade = "critica"
                titulo = f"Fatura {num} — protesto vencido"
                desc = f"{cliente} · {emissora} · {dias}d em atraso · cartório há {dias - dias_protesto}d"
            else:
                prioridade = "urgente"
                titulo = f"Fatura {num} vencida há {dias} dia{'s' if dias != 1 else ''}"
                desc = f"{cliente} · {emissora} · {_brl(valor)}"
        elif dias == 0:
            prioridade = "urgente"
            titulo = f"Fatura {num} vence hoje"
            desc = f"{cliente} · {emissora} · {_brl(valor)}"
        else:
            faltam = -dias
            if faltam <= 3:
                prioridade = "urgente"
                titulo = f"Fatura {num} vence em {faltam} dia{'s' if faltam != 1 else ''}"
            elif faltam <= 15:
                prioridade = "alerta"
                titulo = f"Fatura {num} vence em {faltam} dias"
            else:
                prioridade = "info"
                titulo = f"Fatura {num} vence em {faltam} dias"
            desc = f"{cliente} · {emissora} · {_brl(valor)}"

        items.append({
            "id":         f"fatura_{f.id}",
            "tipo":       "fatura_vencida" if dias >= 0 else "fatura_vencendo",
            "prioridade": prioridade,
            "titulo":     titulo,
            "descricao":  desc,
            "valor":      valor,
            "data_ref":   str(f.vencimento),
            "dias":       dias,
            "ref_id":     f.id,
            "ref_tipo":   "fatura",
            "icone":      "receipt",
        })

    # ─── 2. Impostos pendentes em faturas já recebidas ────────────────────
    imp_q = db.query(models.FaturamentoMensal).filter(
        models.FaturamentoMensal.status_recebimento == "Recebido",
        models.FaturamentoMensal.status_imposto == "Pendente",
    )
    if emp_filter:
        imp_q = imp_q.filter(models.FaturamentoMensal.id_empresa == emp_filter)

    for f in imp_q.all():
        cliente  = ct_map.get(f.id_contrato) or f.empresa or "—"
        emissora = emp_map.get(f.id_empresa, "—")
        valor    = float(f.valor_imposto or 0)
        num      = f"#{f.numero_fatura}" if f.numero_fatura else f"ID {f.id}"
        items.append({
            "id":         f"imposto_{f.id}",
            "tipo":       "imposto_pendente",
            "prioridade": "alerta",
            "titulo":     f"Imposto pendente — Fatura {num}",
            "descricao":  f"{cliente} · {emissora} · R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
            "valor":      valor,
            "data_ref":   str(f.emissao) if f.emissao else None,
            "dias":       None,
            "ref_id":     f.id,
            "ref_tipo":   "fatura",
            "icone":      "landmark",
        })

    # ─── 3. Contratos vencidos / expirando ────────────────────────────────
    ct_q = db.query(models.Contrato).filter(
        models.Contrato.status_contrato == "Ativo",
        models.Contrato.data_fim != None,
        models.Contrato.data_fim <= hoje + timedelta(days=60),
    )
    if emp_filter:
        ct_q = ct_q.filter(models.Contrato.empresa_id == emp_filter)

    for c in ct_q.all():
        dias = (hoje - c.data_fim).days
        emissora = emp_map.get(c.empresa_id, "—")

        if dias > 0:
            prioridade = "urgente"
            titulo = f"Contrato vencido — {c.nome_cliente or '—'}"
            desc = f"{emissora} · venceu há {dias} dia{'s' if dias != 1 else ''} ({c.data_fim})"
        elif dias == 0:
            prioridade = "urgente"
            titulo = f"Contrato vence hoje — {c.nome_cliente or '—'}"
            desc = f"{emissora}"
        elif abs(dias) <= 15:
            prioridade = "urgente"
            titulo = f"Contrato expira em {abs(dias)} dias — {c.nome_cliente or '—'}"
            desc = f"{emissora} · vence em {c.data_fim}"
        elif abs(dias) <= 30:
            prioridade = "alerta"
            titulo = f"Contrato expira em {abs(dias)} dias — {c.nome_cliente or '—'}"
            desc = f"{emissora} · vence em {c.data_fim}"
        else:
            prioridade = "info"
            titulo = f"Contrato expira em {abs(dias)} dias — {c.nome_cliente or '—'}"
            desc = f"{emissora} · vence em {c.data_fim}"

        items.append({
            "id":         f"contrato_{c.id}",
            "tipo":       "contrato_vencido" if dias >= 0 else "contrato_vencendo",
            "prioridade": prioridade,
            "titulo":     titulo,
            "descricao":  desc,
            "valor":      None,
            "data_ref":   str(c.data_fim),
            "dias":       dias,
            "ref_id":     c.id,
            "ref_tipo":   "contrato",
            "icone":      "file-text",
        })

    # ─── 4. Reembolsos vencidos / a vencer ───────────────────────────────
    reimb_q = db.query(models.Reembolso).filter(
        models.Reembolso.status_recebimento == "Pendente",
        models.Reembolso.vencimento != None,
        models.Reembolso.vencimento <= hoje + timedelta(days=7),
    )
    if emp_filter:
        reimb_q = reimb_q.filter(models.Reembolso.id_empresa == emp_filter)

    for r in reimb_q.all():
        dias     = (hoje - r.vencimento).days
        emissora = emp_map.get(r.id_empresa, "—")
        cliente  = ct_map.get(r.id_contrato) or r.empresa or "—"
        valor    = float(r.valor_reembolso or 0)
        recibo   = f"Recibo #{r.recibo}" if r.recibo else f"ID {r.id}"

        if dias > 0:
            prioridade = "urgente"
            titulo = f"Reembolso vencido — {recibo}"
            desc = f"{cliente} · {emissora} · {r.tipo or ''} · {dias}d em atraso"
        elif dias == 0:
            prioridade = "urgente"
            titulo = f"Reembolso vence hoje — {recibo}"
            desc = f"{cliente} · {emissora} · R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        else:
            faltam = abs(dias)
            prioridade = "alerta"
            titulo = f"Reembolso vence em {faltam} dia{'s' if faltam != 1 else ''} — {recibo}"
            desc = f"{cliente} · {emissora} · R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

        items.append({
            "id":         f"reembolso_{r.id}",
            "tipo":       "reembolso_vencido" if dias > 0 else "reembolso_vencendo",
            "prioridade": prioridade,
            "titulo":     titulo,
            "descricao":  desc,
            "valor":      valor,
            "data_ref":   str(r.vencimento),
            "dias":       dias,
            "ref_id":     r.id,
            "ref_tipo":   "reembolso",
            "icone":      "banknote",
        })

    # ─── 5. Apólices de seguro expirando ──────────────────────────────────
    seg_q = db.query(models.Seguro).filter(
        models.Seguro.status_apolice == "Ativa",
        models.Seguro.data_fim != None,
        models.Seguro.data_fim <= hoje + timedelta(days=60),
    )
    if emp_filter:
        seg_q = seg_q.filter(models.Seguro.id_empresa == emp_filter)

    for s in seg_q.all():
        dias     = (hoje - s.data_fim).days
        emissora = emp_map.get(s.id_empresa, "—")
        valor    = float(s.valor_total_apolice or 0)

        if dias > 0:
            prioridade = "urgente"
            titulo = f"Apólice vencida — {s.numero_apolice}"
            desc = f"{s.seguradora} · {emissora} · venceu há {dias}d"
        elif abs(dias) <= 15:
            prioridade = "urgente"
            titulo = f"Apólice expira em {abs(dias)} dias — {s.numero_apolice}"
            desc = f"{s.seguradora} · {emissora} · vence em {s.data_fim}"
        elif abs(dias) <= 30:
            prioridade = "alerta"
            titulo = f"Apólice expira em {abs(dias)} dias — {s.numero_apolice}"
            desc = f"{s.seguradora} · {emissora} · vence em {s.data_fim}"
        else:
            prioridade = "info"
            titulo = f"Apólice expira em {abs(dias)} dias — {s.numero_apolice}"
            desc = f"{s.seguradora} · {emissora} · vence em {s.data_fim}"

        items.append({
            "id":         f"seguro_{s.id}",
            "tipo":       "seguro_vencendo",
            "prioridade": prioridade,
            "titulo":     titulo,
            "descricao":  desc,
            "valor":      valor if valor > 0 else None,
            "data_ref":   str(s.data_fim),
            "dias":       dias,
            "ref_id":     s.id,
            "ref_tipo":   "seguro",
            "icone":      "shield",
        })

    # ─── 6. Rastreamentos expirando ───────────────────────────────────────
    rast_q = db.query(models.Rastreamento).filter(
        models.Rastreamento.vencimento != None,
        models.Rastreamento.vencimento <= hoje + timedelta(days=30),
    )
    if emp_filter:
        rast_q = rast_q.filter(models.Rastreamento.id_empresa == emp_filter)

    # Agrupa por empresa_rastreamento + período para evitar excesso de itens
    rast_group: dict = {}
    for r in rast_q.all():
        dias = (hoje - r.vencimento).days
        key  = (r.empresa_rastreamento or "—", str(r.vencimento))
        if key not in rast_group:
            rast_group[key] = {"count": 0, "dias": dias, "obj": r}
        rast_group[key]["count"] += 1

    for key, g in rast_group.items():
        r = g["obj"]
        dias = g["dias"]
        count = g["count"]
        emissora = emp_map.get(r.id_empresa, "—")
        empresa_rast = r.empresa_rastreamento or "—"

        if dias > 0:
            prioridade = "urgente"
            titulo = f"Rastreamento vencido — {empresa_rast}"
            desc = f"{count} veículo{'s' if count != 1 else ''} · {emissora} · {dias}d em atraso"
        elif abs(dias) <= 7:
            prioridade = "urgente"
            titulo = f"Rastreamento vence em {abs(dias)} dias — {empresa_rast}"
            desc = f"{count} veículo{'s' if count != 1 else ''} · {emissora}"
        else:
            prioridade = "alerta"
            titulo = f"Rastreamento expira em {abs(dias)} dias — {empresa_rast}"
            desc = f"{count} veículo{'s' if count != 1 else ''} · {emissora} · vence em {r.vencimento}"

        items.append({
            "id":         f"rast_{r.id}_{key[1]}",
            "tipo":       "rastreamento_vencendo",
            "prioridade": prioridade,
            "titulo":     titulo,
            "descricao":  desc,
            "valor":      None,
            "data_ref":   str(r.vencimento),
            "dias":       dias,
            "ref_id":     r.id,
            "ref_tipo":   "rastreamento",
            "icone":      "map-pin",
        })

    # ─── 7. Parcelas de Notas Fiscais vencidas / a vencer ───────────────
    parcela_q = db.query(models.ManutencaoParcela).filter(
        models.ManutencaoParcela.status_pagamento == "Pendente",
        models.ManutencaoParcela.deletado_em == None,
        models.ManutencaoParcela.data_vencimento != None,
        models.ManutencaoParcela.data_vencimento <= hoje + timedelta(days=15),
    )

    parcelas_raw = parcela_q.all()

    # Batch load manutencoes para obter placa/id_empresa
    manut_ids = {p.manutencao_id for p in parcelas_raw if p.manutencao_id}
    manut_map_p: dict = {}
    if manut_ids:
        for m in db.query(models.Manutencao).filter(models.Manutencao.id.in_(manut_ids)).all():
            manut_map_p[m.id] = m

    if emp_filter:
        parcelas_raw = [
            p for p in parcelas_raw
            if p.manutencao_id
            and manut_map_p.get(p.manutencao_id)
            and manut_map_p[p.manutencao_id].id_empresa == emp_filter
        ]

    for p in parcelas_raw:
        dias  = (hoje - p.data_vencimento).days
        valor = float(p.valor_parcela or 0)
        manut = manut_map_p.get(p.manutencao_id) if p.manutencao_id else None
        placa = manut.placa if manut else "—"
        forn  = p.fornecedor or (manut.fornecedor if manut else None) or "—"
        nota  = p.nota or "—"
        parc_label = f"Parcela {p.parcela_atual}/{p.parcela_total}" if p.parcela_atual and p.parcela_total else "Parcela"

        if dias > 0:
            prioridade = "urgente"
            titulo = f"{parc_label} vencida — {forn}"
            desc = f"Placa {placa} · NF {nota} · {dias}d em atraso"
        elif dias == 0:
            prioridade = "urgente"
            titulo = f"{parc_label} vence hoje — {forn}"
            desc = f"Placa {placa} · NF {nota}"
        else:
            faltam = -dias
            if faltam <= 3:
                prioridade = "urgente"
            elif faltam <= 7:
                prioridade = "alerta"
            else:
                prioridade = "info"
            titulo = f"{parc_label} vence em {faltam} dia{'s' if faltam != 1 else ''} — {forn}"
            desc = f"Placa {placa} · NF {nota}"

        items.append({
            "id":         f"parcela_{p.id}",
            "tipo":       "parcela_vencida" if dias >= 0 else "parcela_vencendo",
            "prioridade": prioridade,
            "titulo":     titulo,
            "descricao":  desc,
            "valor":      valor,
            "data_ref":   str(p.data_vencimento),
            "dias":       dias,
            "ref_id":     p.id,
            "ref_tipo":   "parcela",
            "icone":      "file-text",
        })

    # ─── Ordena por prioridade → dias (mais atrasado primeiro) ────────────
    items.sort(key=lambda x: (
        PRIORIDADE_ORDER.get(x["prioridade"], 9),
        -(x["dias"] or 0),
    ))

    criticas = sum(1 for i in items if i["prioridade"] == "critica")
    urgentes = sum(1 for i in items if i["prioridade"] == "urgente")
    alertas  = sum(1 for i in items if i["prioridade"] == "alerta")
    infos    = sum(1 for i in items if i["prioridade"] == "info")

    return {
        "total":    len(items),
        "criticas": criticas,
        "urgentes": urgentes,
        "alertas":  alertas,
        "infos":    infos,
        "items":    items,
    }
