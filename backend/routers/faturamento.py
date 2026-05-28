"""
Router de Faturamento Mensal — endpoints para o módulo de faturamento.

GET  /api/db/faturamento          → lista faturas (filtros: year, empresa, status)
GET  /api/db/faturamento/summary  → KPIs e agrupamentos
PATCH /api/db/faturamento/{id}    → atualiza status de recebimento e/ou imposto
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text, func as sf, extract
from typing import Optional, List
from pydantic import BaseModel
from datetime import date

from database import get_db
import models
from services.compute import invalidate_cache

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
    from datetime import date as _date
    q = db.query(models.FaturamentoMensal)
    if year:
        q = q.filter(sf.strftime("%Y", models.FaturamentoMensal.emissao) == str(year))
    if empresa_sigla:
        emp_id = _resolve_empresa_id(db, empresa_sigla)
        if emp_id is None:
            return None
        q = q.filter(models.FaturamentoMensal.id_empresa == emp_id)
    if status_recebimento:
        if status_recebimento == 'Vencido':
            # Vencido = Pendente no BD mas com vencimento no passado
            q = q.filter(
                models.FaturamentoMensal.status_recebimento == 'Pendente',
                models.FaturamentoMensal.vencimento < _date.today(),
            )
        else:
            q = q.filter(models.FaturamentoMensal.status_recebimento == status_recebimento)
    if status_imposto:
        q = q.filter(models.FaturamentoMensal.status_imposto == status_imposto)
    return q


def _enrich(row: models.FaturamentoMensal, emp_map: dict, ct_map: dict) -> dict:
    from datetime import date as _date
    emissao = row.emissao
    status_rec = row.status_recebimento or 'Pendente'
    if status_rec == 'Pendente' and row.vencimento and row.vencimento < _date.today():
        status_rec = 'Vencido'
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
        "status_recebimento": status_rec,
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

    # Por veículo — via fat_unitario vinculado a estas faturas
    por_veiculo = []
    fatura_ids = [r.id for r in rows if r.id]
    if fatura_ids:
        try:
            placeholders = ",".join(str(fid) for fid in fatura_ids)
            vrows = db.execute(text(f"""
                SELECT fu.id_veiculo, fr.placa, fr.modelo,
                       SUM(fu.medicao) as total,
                       GROUP_CONCAT(DISTINCT fu.id_fatura) as fids
                FROM fat_unitario fu
                LEFT JOIN frota fr ON fr.id = fu.id_veiculo
                WHERE fu.id_fatura IN ({placeholders})
                GROUP BY fu.id_veiculo
                ORDER BY total DESC
            """)).fetchall()
            for rv in vrows:
                fids_parsed = [int(x) for x in (rv[4] or "").split(",") if x.strip()]
                por_veiculo.append({
                    "id_veiculo": rv[0],
                    "placa":      rv[1] or "—",
                    "modelo":     rv[2] or "—",
                    "total":      round(float(rv[3] or 0), 2),
                    "fatura_ids": fids_parsed,
                })
        except Exception:
            pass

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
        "por_veiculo":         por_veiculo,
    }


class FatVeiculoItem(BaseModel):
    id_veiculo:  int
    subtotal:    float    # valor do mês (medicao)
    qtd_dias:    int = 30


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
    por_veiculo:        Optional[List[FatVeiculoItem]] = None


class FaturaUpdate(BaseModel):
    numero_fatura:      Optional[int]   = None
    emissao:            Optional[date]  = None
    vencimento:         Optional[date]  = None
    valor_locacoes:     Optional[float] = None
    valor_recebido:     Optional[float] = None
    aliquota_imposto:   Optional[float] = None
    valor_imposto:      Optional[float] = None
    valor_liquido:      Optional[float] = None
    status_recebimento: Optional[str]   = None
    status_imposto:     Optional[str]   = None
    data_pgto_imposto:  Optional[date]  = None
    encargo_imposto:    Optional[float] = None
    forma_pagamento:    Optional[str]   = None
    por_veiculo:        Optional[List[FatVeiculoItem]] = None


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

    # ── Sincroniza fat_unitario para que VehiclesPage reflita a fatura ──
    if payload.por_veiculo:
        mes_ref = payload.emissao.replace(day=1)
        for item in payload.por_veiculo:
            # Remove rows desta fatura para o veículo/mês (evita duplicação em reprocessamento)
            db.execute(
                text("DELETE FROM fat_unitario WHERE id_veiculo = :v AND mes = :m AND id_fatura = :fid"),
                {"v": item.id_veiculo, "m": str(mes_ref), "fid": row.id},
            )
            # Remove eventuais rows sem fatura (dados anteriores do Excel) para o mesmo período
            db.execute(
                text("DELETE FROM fat_unitario WHERE id_veiculo = :v AND mes = :m AND id_fatura IS NULL"),
                {"v": item.id_veiculo, "m": str(mes_ref)},
            )
            parado = max(0, 30 - item.qtd_dias)
            db.execute(
                text("""
                    INSERT INTO fat_unitario (mes, id_veiculo, id_empresa, medicao, trabalhado, parado, id_fatura)
                    VALUES (:m, :v, :e, :med, :trab, :par, :fid)
                """),
                {
                    "m":    str(mes_ref),
                    "v":    item.id_veiculo,
                    "e":    payload.id_empresa,
                    "med":  round(item.subtotal, 2),
                    "trab": item.qtd_dias,
                    "par":  parado,
                    "fid":  row.id,
                },
            )
        db.commit()
        invalidate_cache(payload.emissao.year)

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


@router.get("/api/db/faturamento/{fatura_id}/detail")
def detail_fatura(fatura_id: int, db: Session = Depends(get_db)):
    row = db.get(models.FaturamentoMensal, fatura_id)
    if not row:
        raise HTTPException(404, "Fatura não encontrada")

    emp_map, ct_map = {}, {}
    if row.id_empresa:
        e = db.get(models.Empresa, row.id_empresa)
        if e:
            emp_map[e.id] = {"sigla": e.sigla or e.nome, "nome": e.nome}
    if row.id_contrato:
        c = db.get(models.Contrato, row.id_contrato)
        if c:
            ct_map[c.id] = {"nome_cliente": c.nome_cliente, "cidade": c.cidade_operacao}

    fatura_data = _enrich(row, emp_map, ct_map)

    # Tenta carregar breakdown real (registrado ao criar a fatura)
    try:
        fat_rows = db.execute(
            text("""
                SELECT fu.id_veiculo, fu.medicao, fu.trabalhado, fu.parado,
                       f.placa, f.marca, f.modelo, f.implemento
                FROM fat_unitario fu
                LEFT JOIN frota f ON f.id = fu.id_veiculo
                WHERE fu.id_fatura = :fid
                ORDER BY f.placa
            """),
            {"fid": fatura_id},
        ).fetchall()
    except Exception:
        fat_rows = []

    if fat_rows:
        por_veiculo = [
            {
                "id_veiculo":   r[0],
                "medicao":      round(float(r[1] or 0), 2),
                "trabalhado":   int(r[2] or 0),
                "parado":       int(r[3] or 0),
                "placa":        r[4] or "—",
                "marca":        r[5] or "",
                "modelo":       r[6] or "—",
                "implemento":   r[7] or "",
                "valor_diaria": round(float(r[1] or 0) / max(int(r[2] or 1), 1), 2),
                "fonte":        "fatura",
            }
            for r in fat_rows
        ]
    else:
        # Fallback: veículos do contrato com valor_mensal (dados estimados)
        por_veiculo = []
        if row.id_contrato:
            links = db.execute(
                text("SELECT id_veiculo, valor_mensal FROM contrato_veiculo WHERE contrato_id = :cid ORDER BY sequencia, id_veiculo"),
                {"cid": row.id_contrato},
            ).fetchall()
            for id_v, val_mensal in links:
                frota_v = db.query(models.Frota).filter(models.Frota.id == id_v).first()
                medicao = round(float(val_mensal or 0), 2)
                por_veiculo.append({
                    "id_veiculo":   id_v,
                    "medicao":      medicao,
                    "trabalhado":   30,
                    "parado":       0,
                    "placa":        frota_v.placa    if frota_v else "—",
                    "marca":        frota_v.marca    if frota_v else "",
                    "modelo":       frota_v.modelo   if frota_v else "—",
                    "implemento":   frota_v.implemento if frota_v else "",
                    "valor_diaria": round(medicao / 30, 2) if medicao > 0 else 0.0,
                    "fonte":        "contrato",
                })

    fatura_data["por_veiculo"] = por_veiculo
    return fatura_data


@router.post("/api/db/faturamento/{fatura_id}/sync-fat")
def sync_fatura_fat_unitario(fatura_id: int, db: Session = Depends(get_db)):
    """Sincroniza uma fatura existente com fat_unitario.
    Útil para faturas criadas antes da integração automática ser implementada."""
    fat = db.get(models.FaturamentoMensal, fatura_id)
    if not fat:
        raise HTTPException(404, "Fatura não encontrada")
    if not fat.id_contrato or not fat.emissao or not fat.valor_locacoes:
        raise HTTPException(422, "Fatura sem contrato, emissão ou valor definidos")

    mes_ref = fat.emissao.replace(day=1)

    links = db.execute(
        text("SELECT id_veiculo, valor_mensal FROM contrato_veiculo WHERE contrato_id = :cid ORDER BY sequencia, id_veiculo"),
        {"cid": fat.id_contrato},
    ).fetchall()
    if not links:
        raise HTTPException(422, "Nenhum veículo vinculado a este contrato")

    # Distribui valor_locacoes proporcionalmente ao valor_mensal de cada veículo
    total_contrato = sum(float(r[1] or 0) for r in links)
    synced = 0
    for id_veiculo, valor_mensal in links:
        val_mensal = float(valor_mensal or 0)
        if total_contrato > 0:
            medicao = round(float(fat.valor_locacoes) * val_mensal / total_contrato, 2)
        else:
            medicao = round(float(fat.valor_locacoes) / len(links), 2)

        db.execute(
            text("DELETE FROM fat_unitario WHERE id_veiculo = :v AND mes = :m AND id_fatura = :fid"),
            {"v": id_veiculo, "m": str(mes_ref), "fid": fatura_id},
        )
        db.execute(
            text("DELETE FROM fat_unitario WHERE id_veiculo = :v AND mes = :m AND id_fatura IS NULL"),
            {"v": id_veiculo, "m": str(mes_ref)},
        )
        db.execute(
            text("""
                INSERT INTO fat_unitario (mes, id_veiculo, id_empresa, medicao, trabalhado, parado, id_fatura)
                VALUES (:m, :v, :e, :med, 30, 0, :fid)
            """),
            {"m": str(mes_ref), "v": id_veiculo, "e": fat.id_empresa, "med": medicao, "fid": fatura_id},
        )
        synced += 1

    db.commit()
    invalidate_cache(fat.emissao.year)
    return {"synced_vehicles": synced, "mes": str(mes_ref), "fatura_id": fatura_id}


@router.delete("/api/db/faturamento/{fatura_id}", status_code=204)
def deletar_fatura(fatura_id: int, db: Session = Depends(get_db)):
    row = db.get(models.FaturamentoMensal, fatura_id)
    if not row:
        raise HTTPException(404, "Fatura não encontrada")
    ano = row.emissao.year if row.emissao else None
    db.execute(
        text("DELETE FROM fat_unitario WHERE id_fatura = :fid"),
        {"fid": fatura_id},
    )
    db.delete(row)
    db.commit()
    if ano:
        invalidate_cache(ano)


@router.patch("/api/db/faturamento/{fatura_id}")
def patch_fatura(
    fatura_id: int,
    payload: FaturaUpdate,
    db: Session = Depends(get_db),
):
    row = db.get(models.FaturamentoMensal, fatura_id)
    if not row:
        raise HTTPException(404, "Fatura não encontrada")
    old_year = row.emissao.year if row.emissao else None

    data = payload.model_dump(exclude_unset=True)
    por_veiculo_items = data.pop('por_veiculo', None)  # handled separately

    for field, value in data.items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)

    # Atualiza fat_unitario se por_veiculo foi enviado
    if por_veiculo_items is not None and row.emissao:
        mes_ref = row.emissao.replace(day=1)
        db.execute(text("DELETE FROM fat_unitario WHERE id_fatura = :fid"), {"fid": fatura_id})
        for item in por_veiculo_items:
            if item['subtotal'] > 0:
                parado = max(0, 30 - item['qtd_dias'])
                db.execute(text("""
                    INSERT INTO fat_unitario (mes, id_veiculo, id_empresa, medicao, trabalhado, parado, id_fatura)
                    VALUES (:m, :v, :e, :med, :trab, :par, :fid)
                """), {
                    "m": str(mes_ref), "v": item['id_veiculo'], "e": row.id_empresa,
                    "med": round(item['subtotal'], 2), "trab": item['qtd_dias'], "par": parado, "fid": fatura_id,
                })
        db.commit()

    new_year = row.emissao.year if row.emissao else None
    if old_year:
        invalidate_cache(old_year)
    if new_year and new_year != old_year:
        invalidate_cache(new_year)

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
