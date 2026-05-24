"""
Endpoints de Dashboard e Analytics (Fase 5 - Extraído de main.py).
"""
import logging
import pandas as pd
import numpy as np
import requests as _requests
from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session

from database import engine, get_db
from config import MAPWS_BASE
from services.compute import compute, _linear_projection, MESES_PT
from utils.converters import safe, _clean_year, _clean_implemento, _dedup_manut, _col_like

logger = logging.getLogger("locadora")
router = APIRouter()

def _parse(df: pd.DataFrame, col: str) -> pd.DataFrame:
    if not df.empty and col in df.columns:
        df = df.copy()
        df[col] = pd.to_datetime(df[col], errors="coerce")
    return df

def _filter_year(df: pd.DataFrame, col: str, year: int) -> pd.DataFrame:
    if df.empty or col not in df.columns:
        return df
    return df[df[col].dt.year == year].copy()


@router.get("/api/years")
def get_years():
    years: set = set()
    try:
        from sqlalchemy import text as _text
        with engine.connect() as conn:
            rows = conn.execute(_text("""
                SELECT DISTINCT CAST(strftime('%Y', mes) AS INTEGER)
                FROM fat_unitario WHERE mes IS NOT NULL
                UNION
                SELECT DISTINCT CAST(strftime('%Y', data_entrada) AS INTEGER)
                FROM ordens_servico WHERE data_entrada IS NOT NULL
                UNION
                SELECT DISTINCT CAST(strftime('%Y', data_execucao) AS INTEGER)
                FROM ordens_servico WHERE data_execucao IS NOT NULL
                UNION
                SELECT DISTINCT CAST(strftime('%Y', emissao) AS INTEGER)
                FROM faturamento_mensal WHERE emissao IS NOT NULL
            """)).fetchall()
            years.update(r[0] for r in rows if r[0])
    except Exception as e:
        logger.warning("get_years DB error: %s", e)
    return {"years": sorted(years, reverse=True)}


@router.get("/api/kpis")
def get_kpis(year: int = Query(..., ge=2000, le=2100), empresa: str = Query(None)):
    _, _, kpis, *_ = compute(year, empresa)
    return kpis


@router.get("/api/monthly")
def get_monthly(year: int = Query(..., ge=2000, le=2100), empresa: str = Query(None)):
    _, monthly, *_ = compute(year, empresa)
    records = []
    for _, row in monthly.iterrows():
        records.append({k: safe(v) if isinstance(v, (float, int, np.floating)) else str(v) for k, v in row.items()})
    return {"monthly": records}


@router.get("/api/vehicles")
def get_vehicles(year: int = Query(..., ge=2000, le=2100), region: str = Query(None), empresa: str = Query(None)):
    df, _, _, fat, *_ = compute(year, empresa)

    # Optional region/contract filter
    if region and not fat.empty and "Contrato" in fat.columns:
        ids_region = set(fat[fat["Contrato"] == region]["IDVeiculo"].dropna().astype(int).tolist())
        df = df[df["IDVeiculo"].isin(ids_region)]

    vehicles = []
    for rank, (_, row) in enumerate(df.sort_values("Margem", ascending=False).iterrows(), 1):
        vehicles.append({
            "rank":               rank,
            "id":                 int(row.get("IDVeiculo", 0)),
            "placa":              str(row.get("Placa", "")),
            "marca":              str(row.get("Marca", "")),
            "modelo":             str(row.get("Modelo", "")),
            "tipagem":            str(row.get("Tipagem", "")),
            "implemento":         _clean_implemento(row.get("Implemento", "")),
            "ano_modelo":         _clean_year(row.get("AnoModelo", "")),
            "status":             str(row.get("Status", "")),
            "contrato":           str(row.get("Contrato", "—")),
            "valor_total":        safe(row.get("ValorTotal", 0)),
            "receita_locacao":    safe(row["ReceitaLocacao"]),
            "receita_reembolso":  safe(row["ReceitaReembolso"]),
            "receita_total":      safe(row["ReceitaTotal"]),
            "custo_manutencao":   safe(row["CustoManutencao"]),
            "custo_seguro":       safe(row["CustoSeguro"]),
            "custo_impostos":     safe(row["CustoImpostos"]),
            "custo_rastreamento": safe(row["CustoRastreamento"]),
            "custo_total":        safe(row["CustoTotal"]),
            "margem":             safe(row["Margem"]),
            "margem_pct":         safe(row["MargemPct"]),
            "dias_trabalhado":    safe(row["Trabalhado"]),
            "dias_parado":        safe(row["Parado"]),
            "receita_por_dia":    safe(row["ReceitaPorDia"]),
            "custo_por_dia":      safe(row["CustoPorDia"]),
            "margem_por_dia":     safe(row["MargemPorDia"]),
            "roi":                safe(row.get("ROI", 0)),
        })
    return {"vehicles": vehicles}


@router.get("/api/regions")
def get_regions(year: int = Query(..., ge=2000, le=2100)):
    try:
        from sqlalchemy import text as _text
        with engine.connect() as conn:
            rows = conn.execute(_text(
                "SELECT DISTINCT contrato FROM fat_unitario "
                "WHERE contrato IS NOT NULL AND strftime('%Y', mes) = :y"
            ), {"y": str(year)}).fetchall()
            return {"regions": sorted(r[0] for r in rows if r[0])}
    except Exception as _e:
        logger.warning("get_regions DB error: %s", _e)
    return {"regions": []}


@router.get("/api/vehicle/{placa}")
def get_vehicle(placa: str, year: int = Query(..., ge=2000, le=2100), empresa: str = Query(None)):
    import traceback as _tb
    _empty = {"info": {}, "kpis": {}, "monthly": [], "by_contract": [], "maintenance": []}
    try:
        return _get_vehicle_body(placa, year, empresa)
    except Exception:
        logger.error("[get_vehicle] ERRO %s year=%s:\n%s", placa, year, _tb.format_exc())
        return _empty


def _get_vehicle_body(placa: str, year: int, empresa: str = None):
    df, _, _, fat, reimb, manut, seg, rast, _ = compute(year, empresa)

    placa_norm = placa.strip().upper()
    mask = df["Placa"].str.strip().str.upper() == placa_norm
    if not mask.any():
        return {"info": {}, "kpis": {}, "monthly": [], "by_contract": [], "maintenance": []}

    row  = df[mask].iloc[0]
    id_v = row["IDVeiculo"]

    def _s(v):
        """str() seguro: NaN/None → '—'"""
        if v is None:
            return "—"
        try:
            import math
            if isinstance(v, float) and math.isnan(v):
                return "—"
        except Exception:
            pass
        s = str(v)
        return "—" if s.lower() in ("nan", "none", "nat") else s

    info = {
        "placa":      _s(row["Placa"]),
        "marca":      _s(row["Marca"]),
        "modelo":     _s(row["Modelo"]),
        "tipagem":    _s(row.get("Tipagem", "")),
        "implemento": _clean_implemento(row.get("Implemento", "")),
        "status":     _s(row["Status"]),
        "contrato":   _s(row.get("Contrato", "—")),
        "valor_total": safe(row.get("ValorTotal", 0)),
        "valor_tabela": safe(row.get("TabelaFipe", 0)),
        "valor_implemento": safe(row.get("ValorImplemento", 0)),
        "ano_modelo": _clean_year(row.get("AnoModelo", "")),
    }

    kpis_v = {
        "receita_locacao":    safe(row["ReceitaLocacao"]),
        "receita_reembolso":  safe(row["ReceitaReembolso"]),
        "receita_total":      safe(row["ReceitaTotal"]),
        "custo_manutencao":   safe(row["CustoManutencao"]),
        "custo_seguro":       safe(row["CustoSeguro"]),
        "custo_impostos":     safe(row["CustoImpostos"]),
        "custo_rastreamento": safe(row["CustoRastreamento"]),
        "custo_total":        safe(row["CustoTotal"]),
        "margem":             safe(row["Margem"]),
        "margem_pct":         safe(row["MargemPct"]),
        "dias_trabalhado":    safe(row["Trabalhado"]),
        "dias_parado":        safe(row["Parado"]),
        "receita_por_dia":    safe(row["ReceitaPorDia"]),
        "custo_por_dia":      safe(row["CustoPorDia"]),
        "margem_por_dia":     safe(row["MargemPorDia"]),
        "roi":                safe(row.get("ROI", 0)),
    }

    def vf(df_s, id_col="IDVeiculo"):
        if df_s.empty or id_col not in df_s.columns:
            return df_s
        return df_s[df_s[id_col] == id_v]

    fat_v   = vf(fat)
    reimb_v = vf(reimb)
    manut_v = vf(manut)
    seg_v   = vf(seg)
    rast_v  = vf(rast)

    # Monthly breakdown
    monthly = []
    for m in range(1, 13):
        mr = {"month": m, "monthName": MESES_PT[m - 1]}
        mr["receita_locacao"]    = safe(fat_v[fat_v["Mes"].dt.month == m]["Medicao"].sum()) if not fat_v.empty and "Mes" in fat_v.columns else 0.0
        mr["receita_reembolso"]  = safe(reimb_v[reimb_v["Emissão"].dt.month == m]["ValorReembolso"].sum()) if not reimb_v.empty and "Emissão" in reimb_v.columns else 0.0
        mr["receita_total"]      = mr["receita_locacao"] + mr["receita_reembolso"]
        mr["custo_manutencao"]   = safe(manut_v[manut_v["DataExecução"].dt.month == m]["TotalOS"].sum()) if not manut_v.empty and "DataExecução" in manut_v.columns else 0.0
        mr["custo_seguro"]       = safe(seg_v[seg_v["Vencimento"].dt.month == m]["Valor"].sum()) if not seg_v.empty and "Vencimento" in seg_v.columns else 0.0
        mr["custo_rastreamento"] = safe(rast_v[rast_v["Vencimento"].dt.month == m]["Valor"].sum()) if not rast_v.empty and "Vencimento" in rast_v.columns else 0.0
        mr["custo_total"]        = mr["custo_manutencao"] + mr["custo_seguro"] + mr["custo_rastreamento"]
        mr["margem"]             = mr["receita_total"] - mr["custo_total"]
        mr["dias_trabalhado"]    = safe(fat_v[fat_v["Mes"].dt.month == m]["Trabalhado"].sum()) if not fat_v.empty and "Mes" in fat_v.columns else 0.0
        monthly.append(mr)

    # Contract/region breakdown
    by_contract = []
    if not fat_v.empty and "Contrato" in fat_v.columns:
        grp = (fat_v.dropna(subset=["Contrato"])
               .groupby("Contrato", dropna=False)
               .agg(receita=("Medicao", "sum"),
                    dias_trab=("Trabalhado", "sum"),
                    dias_parado=("Parado", "sum"))
               .reset_index())
        for _, crow in grp.sort_values("receita", ascending=False).iterrows():
            by_contract.append({
                "contrato":       str(crow["Contrato"]),
                "receita":        safe(crow["receita"]),
                "dias_trabalhado": safe(crow["dias_trab"]),
                "dias_parado":    safe(crow["dias_parado"]),
                "diaria_media":   round(safe(crow["receita"]) / max(safe(crow["dias_trab"]), 1), 2),
            })

    # Maintenance detail
    maintenance = []
    if not manut_v.empty:
        for _, mrow in manut_v.iterrows():
            dt = mrow.get("DataExecução")
            ev = mrow.get("evento")
            maintenance.append({
                "ordem":     _s(mrow.get("IDOrdServ")) if pd.notna(mrow.get("IDOrdServ")) else "—",
                "data":      str(dt)[:10] if pd.notna(dt) else "—",
                "valor":     safe(mrow.get("TotalOS", 0)),
                "fornecedor": _s(mrow.get("Fornecedor")),
                "sistema":   _s(mrow.get("Sistema")),
                "servico":   _s(mrow.get("Serviço")),
                "tipo":      _s(mrow.get("TipoManutencao")),
                "km":        safe(mrow.get("KM", 0)) if pd.notna(mrow.get("KM")) else None,
                "prox_km":   safe(mrow.get("ProxKM", 0)) if pd.notna(mrow.get("ProxKM")) else None,
                "prox_data": str(mrow.get("ProxData", ""))[:10] if pd.notna(mrow.get("ProxData")) else None,
                "qtd_notas": int(mrow.get("qtd_notas", 0)) if pd.notna(mrow.get("qtd_notas")) else 0,
                "evento":    ev if (ev is not None and pd.notna(ev)) else None,
            })

    maintenance_sorted = sorted(maintenance, key=lambda x: x["data"], reverse=True)
    # Última revisão: campo derivado para destaque no modal
    ultima_revisao = next((m for m in maintenance_sorted if m.get("evento") == "Revisão"), None)

    # ── Dados extras diretos do banco ─────────────────────────────────────────
    contratos_detail  = []
    reembolsos_detail = []
    faturamento_detail = []
    debitos_detail    = []
    seguro_detail     = []

    try:
        from sqlalchemy import text as _text
        with engine.connect() as _conn:
            # ── Contratos do veículo ──────────────────────────────────────────
            for r in _conn.execute(_text("""
                SELECT c.id, c.nome_cliente, c.cidade_operacao, c.estado_operacao,
                       c.data_inicio, c.data_fim, c.data_encerramento, c.status_contrato,
                       c.forma_pagamento, cv.valor_mensal, c.medicoes_total
                FROM contrato_veiculo cv
                JOIN contratos c ON c.id = cv.contrato_id
                WHERE cv.id_veiculo = :vid
                ORDER BY c.data_inicio DESC
            """), {"vid": int(id_v)}).fetchall():
                contratos_detail.append({
                    "id":               r[0],
                    "cliente":          r[1] or "—",
                    "cidade":           r[2] or "—",
                    "estado":           r[3] or "—",
                    "data_inicio":      str(r[4]) if r[4] else None,
                    "data_fim":         str(r[5]) if r[5] else None,
                    "data_encerramento": str(r[6]) if r[6] else None,
                    "status":           r[7] or "—",
                    "forma_pagamento":  r[8] or "—",
                    "valor_mensal":     float(r[9]) if r[9] else 0,
                    "medicoes_total":   r[10] or 0,
                })

            # ── Reembolsos do veículo ─────────────────────────────────────────
            for r in _conn.execute(_text("""
                SELECT r.id, r.recibo, r.tipo, r.emissao, r.vencimento,
                       r.valor_reembolso, r.valor_recebido, r.status_recebimento,
                       r.descricao, r.numero_os, e.nome
                FROM reembolsos r
                LEFT JOIN empresas e ON e.id = r.id_empresa
                WHERE r.id_veiculo = :vid
                ORDER BY r.emissao DESC
            """), {"vid": int(id_v)}).fetchall():
                reembolsos_detail.append({
                    "id":            r[0],
                    "recibo":        r[1] or "—",
                    "tipo":          r[2] or "—",
                    "emissao":       str(r[3]) if r[3] else None,
                    "vencimento":    str(r[4]) if r[4] else None,
                    "valor":         float(r[5]) if r[5] else 0,
                    "valor_recebido": float(r[6]) if r[6] else 0,
                    "status":        r[7] or "Pendente",
                    "descricao":     r[8] or "",
                    "numero_os":     r[9] or "",
                    "empresa":       r[10] or "—",
                })

            # ── Faturamento (via contratos do veículo) ────────────────────────
            for r in _conn.execute(_text("""
                SELECT DISTINCT fm.id, fm.numero_fatura, fm.emissao, fm.vencimento,
                       fm.valor_locacoes, fm.valor_recebido, fm.status_recebimento,
                       fm.forma_pagamento, fm.aliquota_imposto, fm.valor_imposto,
                       fm.valor_liquido, fm.status_imposto, fm.empresa, c.nome_cliente
                FROM faturamento_mensal fm
                JOIN contrato_veiculo cv ON cv.contrato_id = fm.id_contrato
                JOIN contratos c ON c.id = fm.id_contrato
                WHERE cv.id_veiculo = :vid
                ORDER BY fm.emissao DESC
                LIMIT 48
            """), {"vid": int(id_v)}).fetchall():
                faturamento_detail.append({
                    "id":                r[0],
                    "numero_fatura":     r[1],
                    "emissao":           str(r[2]) if r[2] else None,
                    "vencimento":        str(r[3]) if r[3] else None,
                    "valor_locacoes":    float(r[4]) if r[4] else 0,
                    "valor_recebido":    float(r[5]) if r[5] else 0,
                    "status_recebimento": r[6] or "—",
                    "forma_pagamento":   r[7] or "—",
                    "aliquota_imposto":  float(r[8]) if r[8] else 0,
                    "valor_imposto":     float(r[9]) if r[9] else 0,
                    "valor_liquido":     float(r[10]) if r[10] else 0,
                    "status_imposto":    r[11] or "—",
                    "cliente":           r[12] or r[13] or "—",
                })

            # ── Débitos documentais ────────────────────────────────────────────
            for r in _conn.execute(_text("""
                SELECT dd.id, dd.exercicio,
                       dd.valor_ipva, dd.vencimento_ipva, dd.status_ipva,
                       dd.valor_ipva_pago, dd.data_pgto_ipva, dd.encargo_ipva,
                       dd.valor_licenciamento, dd.vencimento_licenciamento, dd.status_licenciamento,
                       dd.valor_licenciamento_pago, dd.data_pgto_licenciamento, dd.encargo_licenciamento,
                       dd.valor_multas, dd.encargo_multas
                FROM debitos_documentais dd
                WHERE dd.id_veiculo = :vid
                ORDER BY dd.exercicio DESC
            """), {"vid": int(id_v)}).fetchall():
                debitos_detail.append({
                    "id":       r[0],
                    "exercicio": r[1],
                    "ipva": {
                        "valor":      float(r[2]) if r[2] else 0,
                        "vencimento": str(r[3]) if r[3] else None,
                        "status":     r[4] or "Pendente",
                        "valor_pago": float(r[5]) if r[5] else None,
                        "data_pgto":  str(r[6]) if r[6] else None,
                        "encargo":    float(r[7]) if r[7] else 0,
                    },
                    "licenciamento": {
                        "valor":      float(r[8]) if r[8] else 0,
                        "vencimento": str(r[9]) if r[9] else None,
                        "status":     r[10] or "Pendente",
                        "valor_pago": float(r[11]) if r[11] else None,
                        "data_pgto":  str(r[12]) if r[12] else None,
                        "encargo":    float(r[13]) if r[13] else 0,
                    },
                    "multas": {
                        "valor":   float(r[14]) if r[14] else 0,
                        "encargo": float(r[15]) if r[15] else 0,
                    },
                })

            # ── Apólices de seguro do veículo ──────────────────────────────────
            for r in _conn.execute(_text("""
                SELECT s.id, s.numero_apolice, s.seguradora, s.modelo_cobertura,
                       s.data_inicio, s.data_fim, s.status_apolice, s.num_parcelas,
                       sv.valor_veiculo, sv.cobre_implemento, co.nome
                FROM seguro_veiculo sv
                JOIN seguro s ON s.id = sv.apolice_id
                LEFT JOIN corretores co ON co.id = s.corretor_id
                WHERE sv.id_veiculo = :vid
                ORDER BY s.data_inicio DESC
            """), {"vid": int(id_v)}).fetchall():
                seguro_detail.append({
                    "id":              r[0],
                    "numero_apolice":  r[1] or "—",
                    "seguradora":      r[2] or "—",
                    "cobertura":       r[3] or "—",
                    "data_inicio":     str(r[4]) if r[4] else None,
                    "data_fim":        str(r[5]) if r[5] else None,
                    "status":          r[6] or "—",
                    "num_parcelas":    r[7] or 12,
                    "premio_anual":    float(r[8]) if r[8] else 0,
                    "cobre_implemento": bool(r[9]),
                    "corretor":        r[10] or "—",
                })
    except Exception as _ex:
        logger.warning("[get_vehicle extra] %s", _ex)

    return {
        "info":          info,
        "kpis":          kpis_v,
        "monthly":       monthly,
        "by_contract":   by_contract,
        "maintenance":   maintenance_sorted,
        "ultima_revisao": ultima_revisao,
        "contratos":     contratos_detail,
        "reembolsos":    reembolsos_detail,
        "faturamento":   faturamento_detail,
        "debitos":       debitos_detail,
        "seguro":        seguro_detail,
    }


@router.get("/api/maintenance_analysis")
def get_maintenance_analysis(year: int = Query(..., ge=2000, le=2100), placa: str = Query(None), empresa: str = Query(None)):
    _, _, _, _, _, manut, *_ = compute(year, empresa)
    manut_all = manut.copy()

    if placa and not manut.empty and "Placa" in manut.columns:
        manut = manut[manut["Placa"] == placa]

    result: dict = {}

    def _groupby_cost(df, col):
        if df.empty or col not in df.columns:
            return []
        g = (df.dropna(subset=[col])
             .groupby(col)
             .agg(total=("TotalOS", "sum"), count=("IDOrdServ", "nunique"))
             .reset_index()
             .sort_values("total", ascending=False))
        return [{"name": str(r[col]), "total": safe(r["total"]), "count": int(r["count"])} for _, r in g.iterrows()]

    result["by_fornecedor"] = _groupby_cost(manut, "Fornecedor")
    result["by_sistema"]    = _groupby_cost(manut, "Sistema")
    result["by_implemento"] = _groupby_cost(manut, "Implemento")
    result["by_servico"]    = _groupby_cost(manut, "Serviço")

    # Tipo (Preventiva/Corretiva)
    if not manut.empty and "TipoManutencao" in manut.columns:
        bt = (manut.dropna(subset=["TipoManutencao"])
              .groupby("TipoManutencao")["TotalOS"].sum().reset_index())
        result["by_tipo"] = [{"name": str(r["TipoManutencao"]), "total": safe(r["TotalOS"])} for _, r in bt.iterrows()]
    else:
        result["by_tipo"] = []

    # Categoria (Serviço/Compra)
    if not manut.empty and "Categoria" in manut.columns:
        bc = (manut.dropna(subset=["Categoria"])
              .groupby("Categoria")["TotalOS"].sum().reset_index())
        result["by_categoria"] = [{"name": str(r["Categoria"]), "total": safe(r["TotalOS"])} for _, r in bc.iterrows()]
    else:
        result["by_categoria"] = []

    # Monthly trend
    monthly_vals = []
    for m in range(1, 13):
        mv = 0.0
        if not manut.empty and "DataExecução" in manut.columns:
            mv = safe(manut[manut["DataExecução"].dt.month == m]["TotalOS"].sum())
        monthly_vals.append({"month": m, "name": MESES_PT[m - 1], "total": mv})
    result["monthly"] = monthly_vals

    # Linear projection (next 4 months)
    proj_input = [m["total"] for m in monthly_vals]
    result["projection"] = _linear_projection(proj_input, n_future=4)

    # KPI totals
    total_os_count = int(manut["IDOrdServ"].nunique()) if not manut.empty and "IDOrdServ" in manut.columns else 0
    total_cost     = safe(manut["TotalOS"].sum()) if not manut.empty else 0.0
    avg_per_os     = round(total_cost / total_os_count, 2) if total_os_count > 0 else 0.0
    top_forn       = result["by_fornecedor"][0]["name"] if result["by_fornecedor"] else "—"
    result["summary"] = {
        "total_os": total_os_count,
        "total_cost": total_cost,
        "avg_per_os": avg_per_os,
        "top_fornecedor": top_forn,
    }

    # Upcoming scheduled maintenance (ProxData or ProxKM)
    upcoming = []
    src = manut_all.copy()
    if placa and "Placa" in src.columns:
        src = src[src["Placa"] == placa]
    has_prox = src[(src["ProxData"].notna()) | (src["ProxKM"].notna())] if "ProxData" in src.columns else pd.DataFrame()
    if not has_prox.empty:
        seen = set()
        for _, mrow in has_prox.iterrows():
            key = (str(mrow.get("Placa", "")), str(mrow.get("Serviço", "")))
            if key in seen:
                continue
            seen.add(key)
            upcoming.append({
                "placa":      str(mrow.get("Placa", "—")),
                "modelo":     str(mrow.get("Modelo", "—")),
                "servico":    str(mrow.get("Serviço", "—")),
                "sistema":    str(mrow.get("Sistema", "—")),
                "km_atual":   safe(mrow["KM"]) if pd.notna(mrow.get("KM")) else None,
                "prox_km":    safe(mrow["ProxKM"]) if pd.notna(mrow.get("ProxKM")) else None,
                "prox_data":  str(mrow["ProxData"])[:10] if pd.notna(mrow.get("ProxData")) else None,
            })
            if len(upcoming) >= 30:
                break
    result["upcoming"] = upcoming

    return result


@router.get("/api/maintenance_analysis/implemento")
def get_implemento_analysis(year: int = Query(..., ge=2000, le=2100), empresa: str = Query(None)):
    """
    Análise de manutenção por implemento veicular.
    Retorna por tipo de implemento:
      - Quantas OS, custo total, quais sistemas, intervalo de KM entre manutenções.
    """
    try:
        with engine.connect() as conn:
            # Resolve sigla -> id_empresa para filtro por inteiro
            emp_id = None
            if empresa:
                from sqlalchemy import text as _t
                row_e = conn.execute(_t("SELECT id FROM empresas WHERE UPPER(sigla) = UPPER(:s)"), {"s": empresa.strip()}).fetchone()
                emp_id = row_e[0] if row_e else None
            empresa_clause = "AND os.id_empresa = :empresa_id" if emp_id is not None else ""
            rows = pd.read_sql(f"""
                SELECT
                    os.id              AS os_id,
                    os.placa           AS placa,
                    COALESCE(f.implemento, os.implemento, '') AS implemento,
                    os.km              AS km,
                    oi.sistema         AS sistema,
                    oi.categoria       AS categoria,
                    COALESCE(os.total_os,
                        (SELECT SUM(valor_total_nf) FROM notas_fiscais
                         WHERE os_id = os.id AND deletado_em IS NULL), 0
                    )                  AS total_os,
                    COALESCE(os.data_execucao, os.data_entrada) AS data_exec
                FROM ordens_servico os
                LEFT JOIN os_itens oi    ON oi.os_id = os.id
                LEFT JOIN frota f        ON f.placa  = os.placa
                WHERE os.deletado_em IS NULL
                  AND os.status_os = 'finalizada'
                  AND strftime('%Y', COALESCE(os.data_execucao, os.data_entrada)) = :year
                  {empresa_clause}
            """, conn, params={"year": str(year), **({"empresa_id": emp_id} if emp_id is not None else {})})
    except Exception as e:
        logger.error("Erro em /api/maintenance_analysis/implemento: %s", e)
        return []

    if rows.empty:
        return []

    rows["implemento"] = rows["implemento"].fillna("").str.strip()
    rows["sistema"]    = rows["sistema"].fillna("").str.strip()
    rows["km"]         = pd.to_numeric(rows["km"], errors="coerce")

    # Custo por OS (deduplica parcelas múltiplas de uma mesma OS)
    os_cost = rows.drop_duplicates(subset="os_id")[["os_id", "placa", "implemento", "km", "total_os"]]

    result = []
    for impl, grp_impl in rows.groupby("implemento"):
        if not impl:
            continue

        os_ids   = grp_impl["os_id"].unique()
        os_grp   = os_cost[os_cost["os_id"].isin(os_ids)]
        total    = float(os_grp["total_os"].sum())
        n_os     = int(len(os_ids))
        placas   = sorted(os_grp["placa"].dropna().unique().tolist())

        # Sistemas — agrupado por (sistema, categoria)
        por_sistema = []
        for (sis, cat), g2 in grp_impl.groupby(["sistema", "categoria"]):
            if not sis:
                continue
            os_sis = os_cost[os_cost["os_id"].isin(g2["os_id"].unique())]
            por_sistema.append({
                "sistema":   sis,
                "categoria": cat or "",
                "count":     int(g2["os_id"].nunique()),
                "custo":     float(os_sis["total_os"].sum()),
            })
        por_sistema.sort(key=lambda x: x["custo"], reverse=True)

        # Intervalos de KM por sistema — por placa, depois média geral
        intervalos = []
        for sis, g_sis in grp_impl.groupby("sistema"):
            if not sis:
                continue
            diffs_all = []
            por_placa_km = {}
            for pl, g_pl in g_sis.groupby("placa"):
                kms = sorted(g_pl.merge(os_cost[["os_id", "km"]], on="os_id", how="left")["km_y"]
                             .dropna().unique().tolist())
                if len(kms) >= 2:
                    d = [kms[i+1] - kms[i] for i in range(len(kms)-1) if kms[i+1] > kms[i]]
                    if d:
                        diffs_all.extend(d)
                        por_placa_km[pl] = round(sum(d) / len(d))
            if diffs_all:
                intervalos.append({
                    "sistema":        sis,
                    "intervalo_medio": round(sum(diffs_all) / len(diffs_all)),
                    "intervalo_min":   round(min(diffs_all)),
                    "intervalo_max":   round(max(diffs_all)),
                    "amostras":        len(diffs_all),
                    "por_placa":       por_placa_km,
                })
        intervalos.sort(key=lambda x: x["amostras"], reverse=True)

        result.append({
            "implemento":  impl,
            "total_os":    n_os,
            "total_custo": total,
            "placas":      placas,
            "n_placas":    len(placas),
            "por_sistema": por_sistema,
            "intervalos_km": intervalos,
        })

    result.sort(key=lambda x: x["total_custo"], reverse=True)
    return result


@router.get("/api/maintenance_analysis/intervalos")
def get_intervalos_analysis(sistema: str = Query(...)):
    """
    Análise de intervalos entre eventos de um mesmo sistema por veículo.
    Usa TODO o histórico (Excel + SQL, todos os anos) para intervalos reais.
    Para Pneu: agrupa por especificação e inclui KM atual do veículo via MAPWS.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from datetime import date, timedelta

    is_revisao = sistema.strip().lower() in ("revisão", "revisao")
    sis_lower  = sistema.strip().lower()
    is_pneu    = sis_lower == "pneu"

    # ── Dados do SQL (todos os anos, com os_itens expandidos) ──────────
    rows_sql = pd.DataFrame()
    try:
        if is_revisao:
            sis_sql_filter = "LOWER(oi.sistema) IN ('motor', 'revisão') AND (LOWER(oi.servico) LIKE '%óleo%' OR LOWER(oi.servico) LIKE '%oleo%' OR LOWER(oi.servico) LIKE '%revis%')"
        else:
            sis_sql_filter = f"LOWER(oi.sistema) = '{sis_lower.replace(chr(39), '')}'"

        pneu_filter = ""
        if is_pneu:
            pneu_filter = """
              AND (
                LOWER(COALESCE(oi.categoria,'')) = 'compra'
                OR LOWER(COALESCE(oi.manejo_pneu,'')) = 'recapadora'
              )
            """

        with engine.connect() as conn:
            rows_sql = pd.read_sql(f"""
                SELECT
                    os.placa                                    AS placa,
                    os.modelo                                   AS modelo,
                    COALESCE(f.implemento, os.implemento, '')   AS implemento,
                    COALESCE(os.data_execucao, os.data_entrada) AS data_exec,
                    os.km                                       AS km,
                    os.numero_os                                AS numero_os,
                    oi.sistema                                  AS sistema_val,
                    oi.servico                                  AS servico,
                    oi.descricao                                AS descricao,
                    oi.qtd_itens                                AS qtd_itens,
                    oi.posicao_pneu                             AS posicao_pneu,
                    oi.qtd_pneu                                 AS qtd_pneu,
                    oi.espec_pneu                               AS espec_pneu,
                    oi.marca_pneu                               AS marca_pneu,
                    oi.modelo_pneu                              AS modelo_pneu,
                    oi.condicao_pneu                            AS condicao_pneu,
                    oi.manejo_pneu                              AS manejo_pneu,
                    oi.categoria                                AS categoria,
                    os.fornecedor                               AS fornecedor
                FROM ordens_servico os
                JOIN os_itens oi  ON oi.os_id = os.id
                LEFT JOIN frota f ON f.placa   = os.placa
                WHERE os.deletado_em IS NULL
                  AND os.status_os   = 'finalizada'
                  AND {sis_sql_filter}
                  {pneu_filter}
            """, conn)
            rows_sql["fonte"] = "sql"
    except Exception as e:
        logger.error("Erro ao carregar SQL em /api/intervalos: %s", e)

    # ── Usar dados SQL diretamente ───────────────────────────────────
    if rows_sql.empty:
        return {"sistema": sistema, "fleet": {}, "por_placa": []}

    combined = rows_sql.copy()

    combined["km"]        = pd.to_numeric(combined["km"], errors="coerce")
    combined["data_exec"] = pd.to_datetime(combined["data_exec"], errors="coerce")

    # ── 3.1. Enriquecer data_exec, modelo e km ausentes a partir do SQL ──────
    # OS registradas apenas no novo sistema (SQL) mas sem posicao_pneu caem no
    # caminho Excel e ficam sem data/modelo/km. Busca ordens_servico para preencher.
    if not combined.empty:
        null_mask = (
            combined["data_exec"].isna()
            | combined["modelo"].fillna("").str.strip().eq("")
            | combined["km"].isna()
        )
        if null_mask.any():
            nos_list = combined.loc[null_mask, "numero_os"].dropna().unique().tolist()
            if nos_list:
                nos_str = ", ".join(f"'{n.replace(chr(39), '')}'" for n in nos_list)
                try:
                    with engine.connect() as _c:
                        enrich_df = pd.read_sql(
                            f"SELECT numero_os, COALESCE(data_execucao, data_entrada) AS data_exec_sql, "
                            f"modelo AS modelo_sql, km AS km_sql FROM ordens_servico "
                            f"WHERE deletado_em IS NULL AND numero_os IN ({nos_str})",
                            _c,
                        )
                    if not enrich_df.empty:
                        enrich_df["data_exec_sql"] = pd.to_datetime(enrich_df["data_exec_sql"], errors="coerce")
                        enrich_df["km_sql"] = pd.to_numeric(enrich_df["km_sql"], errors="coerce")
                        combined = combined.merge(enrich_df, on="numero_os", how="left")
                        m_date   = combined["data_exec"].isna() & combined["data_exec_sql"].notna()
                        combined.loc[m_date, "data_exec"] = combined.loc[m_date, "data_exec_sql"]
                        m_mod    = combined["modelo"].fillna("").str.strip().eq("") & combined["modelo_sql"].notna() & (combined["modelo_sql"].fillna("") != "")
                        combined.loc[m_mod, "modelo"] = combined.loc[m_mod, "modelo_sql"]
                        m_km     = combined["km"].isna() & combined["km_sql"].notna()
                        combined.loc[m_km, "km"] = combined.loc[m_km, "km_sql"]
                        combined.drop(columns=["data_exec_sql", "modelo_sql", "km_sql"], inplace=True)
                except Exception as _e:
                    logger.warning("Erro ao enriquecer data/modelo/km em intervalos: %s", _e)

    # ── 3.2. Enriquecer campos os_itens para rows Excel de pneu ───────────────────────
    # Rows Excel não carregam posicao_pneu, espec_pneu, servico, categoria, descricao etc.
    # Consulta os_itens para backfill desses campos quando disponíveis no SQL.
    if is_pneu and not combined.empty and "fonte" in combined.columns:
        xl_mask = combined["fonte"].eq("excel")
        xl_nos  = combined.loc[xl_mask, "numero_os"].dropna().unique().tolist()
        if xl_nos:
            nos_str2 = ", ".join(f"'{n.replace(chr(39), '')}'" for n in xl_nos)
            try:
                with engine.connect() as _c2:
                    enrich_items = pd.read_sql(f"""
                        SELECT os.numero_os,
                               oi.posicao_pneu  AS posicao_pneu_sql,
                               oi.espec_pneu    AS espec_pneu_sql,
                               oi.qtd_pneu      AS qtd_pneu_sql,
                               oi.marca_pneu    AS marca_pneu_sql,
                               oi.modelo_pneu   AS modelo_pneu_sql,
                               oi.condicao_pneu AS condicao_pneu_sql,
                               oi.servico       AS servico_sql,
                               oi.categoria     AS categoria_sql,
                               oi.descricao     AS descricao_sql,
                               oi.qtd_itens     AS qtd_itens_sql
                        FROM ordens_servico os
                        JOIN os_itens oi ON oi.os_id = os.id
                        WHERE os.deletado_em IS NULL
                          AND LOWER(oi.sistema) = 'pneu'
                          AND (LOWER(COALESCE(oi.categoria,'')) = 'compra'
                               OR LOWER(COALESCE(oi.manejo_pneu,'')) = 'recapadora')
                          AND os.numero_os IN ({nos_str2})
                    """, _c2)
                if not enrich_items.empty:
                    combined = combined.merge(enrich_items, on="numero_os", how="left")
                    for _field in ["posicao_pneu", "espec_pneu", "qtd_pneu", "marca_pneu",
                                   "modelo_pneu", "condicao_pneu", "servico", "categoria",
                                   "descricao", "qtd_itens"]:
                        _sql_col = f"{_field}_sql"
                        if _sql_col in combined.columns:
                            _m = combined[_field].isna() & combined[_sql_col].notna()
                            combined.loc[_m, _field] = combined.loc[_m, _sql_col]
                    combined.drop(
                        columns=[c for c in combined.columns if c.endswith("_sql")],
                        inplace=True,
                    )
            except Exception as _e2:
                logger.warning("Erro ao enriquecer os_itens pneu em intervalos: %s", _e2)

    # ── 3.5. Carregar rodízios (Pneu) — indexados por os_ref para montagem de fases ──
    rods_by_os: dict = {}
    if is_pneu and not combined.empty:
        try:
            placas_list = list(combined["placa"].dropna().unique())
            placas_str  = ", ".join(f"'{p}'" for p in placas_list)
            with engine.connect() as conn:
                rod_df = pd.read_sql(
                    "SELECT id, placa, data, km, posicao_anterior, posicao_nova, "
                    "espec_pneu, marca_pneu, qtd, os_ref FROM pneu_rodizios "
                    f"WHERE placa IN ({placas_str})",
                    conn,
                )
            if not rod_df.empty:
                rod_df["data"] = pd.to_datetime(rod_df["data"], errors="coerce")
                rod_df["km"]   = pd.to_numeric(rod_df["km"], errors="coerce")
                for _, r in rod_df.iterrows():
                    key = str(r.get("os_ref") or "").strip()
                    if not key:
                        continue
                    rods_by_os.setdefault(key, []).append({
                        "id":               int(r["id"]) if pd.notna(r.get("id")) else None,
                        "km":               float(r["km"]) if pd.notna(r.get("km")) else None,
                        "data":             r["data"] if pd.notna(r.get("data")) else None,
                        "posicao_anterior": str(r["posicao_anterior"]) if pd.notna(r.get("posicao_anterior")) else None,
                        "posicao_nova":     str(r["posicao_nova"]) if pd.notna(r.get("posicao_nova")) else None,
                    })
                for key in rods_by_os:
                    rods_by_os[key].sort(key=lambda x: x["km"] or 0)
        except Exception as e:
            logger.warning("Erro ao carregar rodízios em intervalos: %s", e)

    # ── 4. KM atual via MAPWS (Pneu only — parallel) ─────────────────
    def _mapws_latest_km(placa: str):
        """Retorna (km_fim, date_str) do registro mais recente nos últimos 30 dias."""
        today = date.today()
        start = today - timedelta(days=30)
        try:
            resp = _requests.get(
                f"{MAPWS_BASE}/api/details/{placa}",
                params={"start_date": str(start), "end_date": str(today)},
                timeout=5,
            )
            if resp.status_code != 200:
                return None, None
            data = resp.json()
            records = data if isinstance(data, list) else (data.get("data") or data.get("records") or [])
            # API retorna registros do mais recente para o mais antigo (índice 0 = hoje)
            for rec in records:
                val = rec.get("km_fim") or rec.get("km_acumulado") or rec.get("odometro")
                dt  = rec.get("data") or rec.get("date")
                if val is not None:
                    # Converter DD/MM/YYYY → YYYY-MM-DD para cálculos com pandas
                    if dt and "/" in str(dt):
                        parts = str(dt).split("/")
                        dt = f"{parts[2]}-{parts[1]}-{parts[0]}" if len(parts) == 3 else dt
                    return float(val), str(dt)[:10] if dt else None
        except Exception:
            pass
        return None, None

    km_atual_map: dict = {}
    if is_pneu:
        placas_unicas = [str(p).replace("-","").strip().upper() for p in combined["placa"].dropna().unique()]
        with ThreadPoolExecutor(max_workers=min(len(placas_unicas), 8)) as ex:
            futures = {ex.submit(_mapws_latest_km, p): p for p in placas_unicas}
            for fut in as_completed(futures, timeout=12):
                placa_k = futures[fut]
                try:
                    km_atual_map[placa_k] = fut.result()
                except Exception:
                    km_atual_map[placa_k] = (None, None)

    # ── 5. Calcular intervalos por placa (e por medida para Pneu) ────
    all_km_diffs  = []
    all_dia_diffs = []
    por_placa     = []

    def _sv(row, col):
        v = row.get(col)
        return None if (v is None or (isinstance(v, float) and pd.isna(v))) else v

    def _build_eventos(sub_grp, prev_eventos=None):
        """Constrói lista de eventos com delta_km/delta_dias, acumulando em prev_eventos."""
        evts = list(prev_eventos) if prev_eventos else []
        km_diffs, dia_diffs = [], []
        for _, row in sub_grp.iterrows():
            km_val      = float(row["km"])           if pd.notna(row["km"])        else None
            data_val    = str(row["data_exec"])[:10] if pd.notna(row["data_exec"]) else None
            tipo_evento = row.get("tipo_evento") or "compra"
            delta_km = delta_dias = None
            if evts:
                prev = evts[-1]
                if km_val is not None and prev["km"] is not None:
                    d = km_val - prev["km"]
                    if d > 0:
                        delta_km = round(d)
                        # Só conta nas estatísticas de frota se for compra de pneu
                        if tipo_evento == "compra":
                            km_diffs.append(delta_km)
                if data_val and prev["data"]:
                    try:
                        d2 = (pd.Timestamp(data_val) - pd.Timestamp(prev["data"])).days
                        if d2 > 0:
                            delta_dias = d2
                            if tipo_evento == "compra":
                                dia_diffs.append(delta_dias)
                    except Exception:
                        pass
            id_rod = row.get("id_rodizio")
            ev = {
                "numero_os":       _sv(row, "numero_os"),
                "data":            data_val,
                "km":              km_val,
                "delta_km":        delta_km,
                "delta_dias":      delta_dias,
                "categoria":       _sv(row, "categoria"),
                "servico":         _sv(row, "servico"),
                "descricao":       _sv(row, "descricao"),
                "qtd_itens":       int(row["qtd_itens"])  if pd.notna(row.get("qtd_itens")) else None,
                "posicao_pneu":    _sv(row, "posicao_pneu"),
                "posicao_anterior":_sv(row, "posicao_anterior"),
                "qtd_pneu":        int(row["qtd_pneu"])   if pd.notna(row.get("qtd_pneu"))  else None,
                "espec_pneu":      _sv(row, "espec_pneu"),
                "marca_pneu":      _sv(row, "marca_pneu"),
                "manejo_pneu":     _sv(row, "manejo_pneu"),
                "tipo_evento":     tipo_evento,
                "id_rodizio":      int(id_rod) if id_rod is not None and not (isinstance(id_rod, float) and pd.isna(id_rod)) else None,
            }
            evts.append(ev)
        return evts, km_diffs, dia_diffs

    for placa_val, grp in combined.groupby("placa"):
        grp = grp.sort_values(["km", "data_exec"], na_position="last").reset_index(drop=True)
        modelo_val     = next((str(v) for v in grp["modelo"].dropna()     if str(v).strip()), None)
        implemento_val = next((str(v) for v in grp["implemento"].dropna() if str(v).strip()), None)

        if is_pneu:
            grp["_espec"] = grp["espec_pneu"].fillna("—")
            por_medida:    list = []
            all_conjs_flat: list = []

            # KM atual — necessário para calcular km_rodado da fase em uso
            placa_norm = str(placa_val).replace("-", "").strip().upper()
            km_atual, km_atual_data = km_atual_map.get(placa_norm, (None, None))

            def _pos_parts(p: str) -> list:
                """Divide 'DIANTEIRO + TRASEIRO' em ['DIANTEIRO', 'TRASEIRO']."""
                return [x.strip() for x in (p or "").split("+") if x.strip()]

            for espec_val, espec_grp in grp.groupby("_espec", sort=False):
                espec_grp = espec_grp.sort_values(["km", "data_exec"], na_position="last").reset_index(drop=True)

                # ── CORREÇÃO BUG: Inferência de posicao_pneu por look-ahead / look-behind ─
                # Quando posicao_pneu = NULL (ex: OS cadastrada sem informar posição), o
                # algoritmo de tokenização ignora o conjunto (pos == "—"), impedindo a
                # detecção de substituição cruzada.  A heurística:
                #   1. Look-ahead: se a próxima compra desta especificação tem posição definida,
                #      herda essa posição (padrão: substituto é instalado no mesmo eixo).
                #   2. Look-behind: se não há próxima, herda da compra anterior mais recente.
                _valid_pos_m = (
                    espec_grp["posicao_pneu"].notna()
                    & (espec_grp["posicao_pneu"].astype(str).str.strip() != "")
                    & (~espec_grp["posicao_pneu"].astype(str).str.strip().isin(["—", "nan", "None", "none"]))
                )
                _km_num_col = pd.to_numeric(espec_grp["km"], errors="coerce").fillna(-1.0)
                for _idx in espec_grp.index:
                    _p = str(espec_grp.at[_idx, "posicao_pneu"] or "").strip()
                    if not _p or _p in ("—", "nan", "None", "none"):
                        _km_i = _km_num_col.at[_idx]
                        _ahead = espec_grp[_valid_pos_m & (_km_num_col > _km_i)]
                        if not _ahead.empty:
                            espec_grp.at[_idx, "posicao_pneu"] = _ahead.iloc[0]["posicao_pneu"]
                        else:
                            _behind = espec_grp[_valid_pos_m & (_km_num_col < _km_i)]
                            if not _behind.empty:
                                espec_grp.at[_idx, "posicao_pneu"] = _behind.iloc[-1]["posicao_pneu"]

                # ── CORREÇÃO BUG: Inferência de qtd_pneu ──────────────────────────────────
                # Quando qtd_pneu = NULL, herda o qtd da compra mais próxima na mesma posição
                # e mesma especificação para garantir que a tokenização gere o número correto
                # de tokens e marque todos os pneus substituídos (não apenas o primeiro).
                for _idx in espec_grp.index:
                    if pd.isna(espec_grp.at[_idx, "qtd_pneu"]) or espec_grp.at[_idx, "qtd_pneu"] is None:
                        _pos_i = str(espec_grp.at[_idx, "posicao_pneu"] or "").strip()
                        if _pos_i and _pos_i not in ("—", "nan", "None"):
                            _qtd_src = espec_grp[
                                espec_grp["qtd_pneu"].notna()
                                & (espec_grp["posicao_pneu"].astype(str).str.strip() == _pos_i)
                            ]
                            if not _qtd_src.empty:
                                espec_grp.at[_idx, "qtd_pneu"] = _qtd_src.iloc[0]["qtd_pneu"]

                conjs:     list = []
                km_diffs:  list = []
                dia_diffs: list = []
                prev_km_by_pos:   dict = {}  # posicao -> km anterior nessa posição
                prev_data_by_pos: dict = {}

                for _, row in espec_grp.iterrows():
                    os_ref      = _sv(row, "numero_os") or ""
                    km_compra   = float(row["km"])       if pd.notna(row.get("km"))        else None
                    data_compra = row["data_exec"]       if pd.notna(row.get("data_exec")) else None
                    pos_inicial = _sv(row, "posicao_pneu") or "—"
                    pos_parts   = _pos_parts(pos_inicial) or [pos_inicial]

                    # Posições compostas (ex: DIANTEIRO + TRASEIRO) geram conjuntos independentes
                    qtd_row     = int(row["qtd_pneu"]) if pd.notna(row.get("qtd_pneu")) else None
                    qtd_per_pos = (qtd_row // len(pos_parts)) if (qtd_row and len(pos_parts) > 1) else qtd_row

                    for pos_single in pos_parts:
                        delta_km = delta_dias = None
                        prev_km   = prev_km_by_pos.get(pos_single)
                        prev_data = prev_data_by_pos.get(pos_single)
                        if prev_km is not None and km_compra is not None:
                            d = km_compra - prev_km
                            if d > 0:
                                delta_km = round(d)
                                km_diffs.append(delta_km)
                        if prev_data is not None and data_compra is not None:
                            try:
                                d2 = (data_compra - prev_data).days
                                if d2 > 0:
                                    delta_dias = d2
                                    dia_diffs.append(delta_dias)
                            except Exception:
                                pass
                        prev_km_by_pos[pos_single]   = km_compra
                        prev_data_by_pos[pos_single] = data_compra

                        # Apenas rodízios cuja posicao_anterior bate com este sub-conjunto
                        rods  = [r for r in rods_by_os.get(os_ref, []) if r["posicao_anterior"] == pos_single]
                        fases = []
                        km_f   = km_compra or 0.0
                        data_f = data_compra
                        pos_f  = pos_single

                        for rod in rods:
                            km_r   = rod["km"] or 0.0
                            dias_f = None
                            if rod.get("data") is not None and data_f is not None:
                                try:
                                    dias_f = (pd.Timestamp(rod["data"]) - pd.Timestamp(str(data_f)[:10])).days
                                except Exception:
                                    pass
                            fases.append({
                                "posicao":     pos_f,
                                "km_inicio":   round(km_f),
                                "data_inicio": str(data_f)[:10] if data_f is not None else None,
                                "km_fim":      round(km_r),
                                "data_fim":    str(rod["data"])[:10] if rod.get("data") is not None else None,
                                "km_rodado":   max(0, round(km_r - km_f)),
                                "dias":        dias_f,
                                "em_uso":      False,
                                "id_rodizio":  rod.get("id"),
                            })
                            km_f   = km_r
                            data_f = rod["data"] if rod.get("data") is not None else data_f
                            pos_f  = rod["posicao_nova"] or pos_f

                        # Fase atual (pneu ainda em uso)
                        km_rodado_cur = round(float(km_atual or 0) - km_f) if km_atual else None
                        dias_cur = None
                        if km_atual_data and data_f is not None:
                            try:
                                dias_cur = (pd.Timestamp(km_atual_data) - pd.Timestamp(str(data_f)[:10])).days
                            except Exception:
                                pass
                        fases.append({
                            "posicao":     pos_f,
                            "km_inicio":   round(km_f),
                            "data_inicio": str(data_f)[:10] if data_f is not None else None,
                            "km_fim":      None,
                            "data_fim":    None,
                            "km_rodado":   max(0, km_rodado_cur) if km_rodado_cur is not None else None,
                            "dias":        dias_cur,
                            "em_uso":      True,
                            "id_rodizio":  None,
                        })

                        km_total = sum(f["km_rodado"] for f in fases if f["km_rodado"] is not None)
                        conjs.append({
                            "os_ref":          os_ref,
                            "compra_composta": len(pos_parts) > 1,  # veio de pos. composta, ex: DIANTEIRO+TRASEIRO
                            "data_compra":   str(data_compra)[:10] if data_compra is not None else None,
                            "km_compra":     round(km_compra) if km_compra is not None else None,
                            "marca":    _sv(row, "marca_pneu"),
                            "modelo":   _sv(row, "modelo_pneu"),
                            "condicao": _sv(row, "condicao_pneu"),
                            "recapado": "recap" in str(_sv(row, "manejo_pneu") or "").lower()
                                        or "recap" in str(_sv(row, "servico") or "").lower(),
                            "espec":    _sv(row, "espec_pneu"),
                            "qtd":           qtd_per_pos,
                            "delta_km":      delta_km,
                            "delta_dias":    delta_dias,
                            "km_total":      km_total,
                            "posicao_atual": pos_f,
                            "fases":         fases,
                        })

                all_km_diffs.extend(km_diffs)
                all_dia_diffs.extend(dia_diffs)
                all_conjs_flat.extend(conjs)
                total_pneus = sum(c["qtd"] or 0 for c in conjs)
                por_medida.append({
                    "espec":       espec_val,
                    "n_eventos":   len(conjs),
                    "total_pneus": total_pneus,
                    "avg_km":      round(sum(km_diffs) / len(km_diffs)) if km_diffs else None,
                    "min_km":      round(min(km_diffs)) if km_diffs else None,
                    "max_km":      round(max(km_diffs)) if km_diffs else None,
                    "conjuntos":   conjs,
                })

            # ── KM timeline do veículo (para interpolação quando OS sem km) ─────────
            _km_tl = sorted(
                ((str(row["data_exec"])[:10], float(row["km"]))
                 for _, row in grp.iterrows()
                 if pd.notna(row.get("km")) and float(row["km"]) > 0
                 and pd.notna(row.get("data_exec"))),
                key=lambda x: x[0],
            )

            def _km_at_date(dt_str):
                """Último km registrado em OS na data ou antes dela."""
                if not dt_str or not _km_tl:
                    return None
                best = None
                for d, km in _km_tl:
                    if d <= dt_str:
                        best = km
                    else:
                        break
                return best

            # ── Detectar descarte GLOBAL (cross-espec) ────────────────────────────
            # Qualquer novo pneu na mesma posição (independente de medida) descarta
            # o conjunto anterior. A lógica por-espec dentro do loop não captura isso.
            # ── Detectar descarte GLOBAL (cross-espec) com rastreamento por unidade ──────
            # Implementa fila de consumo dinâmico para suportar substituições parciais (ex: 1 novo repõe 1 de 2 antigos).
            import copy
            from collections import defaultdict
            
            # 1. Tokenização: Transforma conjuntos em tokens unitários independentes
            all_tokens = []
            for conj in all_conjs_flat:
                last_f = conj["fases"][-1]
                pos = last_f.get("posicao")
                if not pos or pos == "—": continue
                
                qtd = max(1, int(conj.get("qtd") or 1))
                for i in range(qtd):
                    for pp in (_pos_parts(pos) or [pos]):
                        all_tokens.append({
                            "conj_id": id(conj),
                            "conj": conj,
                            "pos": pp,
                            "km": last_f["km_inicio"] or 0,
                            "dt": last_f.get("data_inicio") or "",
                            "replaced_by": None
                        })
            
            # Ordena cronologicamente (km depois data)
            all_tokens.sort(key=lambda t: (t["km"], t["dt"] or ""))
            
            # 2. Algoritmo de Consumo Stateful: Cada token novo consome o token ativo mais antigo
            active_tokens_by_pos = {}
            for token in all_tokens:
                p = token["pos"]
                pool = active_tokens_by_pos.setdefault(p, [])
                
                # Candidatos a substituição: Devem ter chegado ANTES em km ou data, e vir de outro evento
                victims = [
                    v for v in pool 
                    if v["conj_id"] != token["conj_id"] 
                    and (token["km"] > v["km"] or (token["km"] == v["km"] and (token["dt"] or "") > (v["dt"] or "")))
                ]
                
                if victims:
                    victim = victims[0] # FIFO: consome o mais antigo da fila ativa
                    victim["replaced_by"] = token
                    pool.remove(victim)
                
                pool.append(token)

            # 3. Reconstrução Dinâmica: Divide conjuntos originais se houver destinos parciais mistos
            final_all_conjs = []
            
            # Mapeia tokens de volta para seu conjunto original para agrupar
            conj_to_tokens = defaultdict(list)
            for t in all_tokens:
                conj_to_tokens[id(t["conj"])].append(t)
                
            for orig_conj in all_conjs_flat:
                toks = conj_to_tokens.get(id(orig_conj))
                if not toks:
                    final_all_conjs.append(orig_conj)
                    continue
                
                # Agrupa tokens deste conjunto pelo destino do replacement (True/False e ID do causador)
                by_fate = defaultdict(list)
                for t in toks:
                    # Identificador do destino: None se ativo, ou ID do conj substituto se descartado
                    rid = id(t["replaced_by"]["conj"]) if t["replaced_by"] else None
                    by_fate[rid].append(t)
                
                # Gera conjuntos fracionados na saída
                for rid, sub_toks in by_fate.items():
                    c_split = copy.deepcopy(orig_conj)
                    c_split["qtd"] = len(sub_toks) # quantidade residual da fatia
                    l_f = c_split["fases"][-1]
                    
                    rep = sub_toks[0]["replaced_by"]
                    if rep:
                        r_f = rep["conj"]["fases"][-1]
                        nk = r_f["km_inicio"]
                        nd = r_f.get("data_inicio")
                        
                        l_f["km_fim"]   = nk if nk else None
                        l_f["data_fim"] = nd
                        km_entry = l_f["km_inicio"] or 0
                        
                        if (nk and km_entry) or (nk and not km_entry and nk > 0):
                            km_rod = max(0, round(nk - km_entry))
                        else:
                            d0 = l_f.get("data_inicio")
                            km_d0 = _km_at_date(d0) if d0 else None
                            km_d1 = _km_at_date(nd) if nd else None
                            km_rod = max(0, round(km_d1 - km_d0)) if (km_d0 is not None and km_d1 is not None) else None
                            
                        l_f["km_rodado"]  = km_rod
                        l_f["em_uso"]     = False
                        l_f["descartado"] = True
                        c_split["descartado"] = True
                    else:
                        # Sem substituto: Mantém ativo
                        l_f["em_uso"]     = True
                        l_f["descartado"] = False
                        c_split["descartado"] = False
                    
                    c_split["km_total"] = sum(f.get("km_rodado") or 0 for f in c_split["fases"])
                    final_all_conjs.append(c_split)

            # 4. Sincronização dos Resultados Finais
            all_conjs_flat = final_all_conjs # Atualiza lista plana global
            
            # Atualiza a árvore hierárquica retornada para o frontend
            for med in por_medida:
                m_espec = med["espec"]
                # Filtra da nova lista unificada apenas os que pertencem a esta medida específica
                med["conjuntos"] = [cj for cj in final_all_conjs if (cj.get("espec") or "—") == m_espec]
                med["n_eventos"] = len(med["conjuntos"])
                med["total_pneus"] = sum(cj.get("qtd") or 0 for cj in med["conjuntos"])


            # ── Recomputar ∆ KM / ∆ Dias globalmente por posição (cross-espec) ──
            # Ordena todos os conjuntos por km_compra e recalcula o delta contra o
            # conjunto ANTERIOR na mesma posição, independentemente da medida.
            pos_prev_km:   dict = {}
            pos_prev_data: dict = {}
            for conj in sorted(all_conjs_flat, key=lambda c: (c.get("km_compra") or 0)):
                pos = conj["fases"][0]["posicao"]
                prev_km   = pos_prev_km.get(pos)
                prev_data = pos_prev_data.get(pos)
                delta_km = delta_dias = None
                km_c   = conj.get("km_compra")
                data_c = conj.get("data_compra")
                if prev_km is not None and km_c is not None:
                    d = km_c - prev_km
                    if d > 0:
                        delta_km = round(d)
                if prev_data and data_c:
                    try:
                        d2 = (pd.Timestamp(data_c) - pd.Timestamp(prev_data)).days
                        if d2 > 0:
                            delta_dias = d2
                    except Exception:
                        pass
                conj["delta_km"]   = delta_km
                conj["delta_dias"] = delta_dias
                pos_prev_km[pos]   = km_c
                pos_prev_data[pos] = data_c

            por_medida.sort(key=lambda x: x["n_eventos"], reverse=True)

            # Per-posição: fase atual de cada conjunto, agrupado por posição
            # Posições compostas (ex: "DIANTEIRO + TRASEIRO") geram entradas em cada posição individual
            pos_map: dict = {}
            for conj in all_conjs_flat:
                if conj.get("descartado"):
                    continue
                last_f = conj["fases"][-1]
                for pp in _pos_parts(last_f["posicao"]) or [last_f["posicao"]]:
                    cur = pos_map.get(pp)
                    # Prioriza o conjunto instalado mais recentemente nessa posição
                    if cur is None or (conj.get("km_compra") or 0) > (cur["conj"].get("km_compra") or 0):
                        pos_map[pp] = {"conj": conj, "fase": last_f}

            km_por_posicao = [
                {
                    "posicao":      pos,
                    "km_troca":     item["fase"]["km_inicio"],
                    "data_troca":   item["fase"]["data_inicio"],
                    "marca":        item["conj"]["marca"],
                    "espec":        item["conj"]["espec"],
                    "qtd":          item["conj"]["qtd"],
                    "numero_os":    item["conj"]["os_ref"],
                    "km_rodado":    item["conj"]["km_total"],
                    "dias_rodando": sum(f["dias"] or 0 for f in item["conj"]["fases"]),
                }
                for pos, item in sorted(pos_map.items())
            ]

            kms_all = [c["km_compra"] for c in all_conjs_flat if c["km_compra"] is not None]
            por_placa.append({
                "placa":          placa_val,
                "modelo":         modelo_val,
                "implemento":     implemento_val,
                "n_eventos":      len(all_conjs_flat),
                "km_min":         round(min(kms_all)) if kms_all else None,
                "km_max":         round(max(kms_all)) if kms_all else None,
                "km_atual":       round(km_atual) if km_atual else None,
                "km_atual_data":  km_atual_data,
                "km_por_posicao": km_por_posicao,
                "por_medida":     por_medida,
            })
        else:
            evts, km_d, dia_d = _build_eventos(grp)
            all_km_diffs.extend(km_d)
            all_dia_diffs.extend(dia_d)
            kms = [e["km"] for e in evts if e["km"] is not None]
            por_placa.append({
                "placa":      placa_val,
                "modelo":     modelo_val,
                "implemento": implemento_val,
                "n_eventos":  len(evts),
                "km_min":     round(min(kms)) if kms else None,
                "km_max":     round(max(kms)) if kms else None,
                "eventos":    evts,
            })

    por_placa.sort(key=lambda x: x["n_eventos"], reverse=True)

    def _stats(lst):
        if not lst:
            return {"min": None, "avg": None, "max": None, "n": 0}
        return {"min": round(min(lst)), "avg": round(sum(lst)/len(lst)), "max": round(max(lst)), "n": len(lst)}

    return {
        "sistema": sistema,
        "fleet": {
            "km":             _stats(all_km_diffs),
            "dias":           _stats(all_dia_diffs),
            "total_eventos":  sum(p["n_eventos"] for p in por_placa),
            "total_veiculos": len(por_placa),
        },
        "por_placa": por_placa,
    }
