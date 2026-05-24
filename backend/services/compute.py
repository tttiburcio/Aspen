"""
Motor analítico do Aspen (Compute).

Lê os DataFrames do banco SQL, aplica regras de negócio
e gera dados de dashboard (kpis, monthly, etc).
"""
import logging
import pandas as pd
import numpy as np
import threading

from sqlalchemy import text
from database import engine
from utils.converters import safe, _dedup_manut, _col_like

logger = logging.getLogger("locadora")

# Cache thread-safe para o compute (Fase 6 implementada)
_compute_cache = {}
_compute_lock = threading.Lock()

MESES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
            "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

def _parse(df: pd.DataFrame, col: str) -> pd.DataFrame:
    if not df.empty and col in df.columns:
        df = df.copy()
        df[col] = pd.to_datetime(df[col], errors="coerce")
    return df

def _filter_year(df: pd.DataFrame, col: str, year: int) -> pd.DataFrame:
    if df.empty or col not in df.columns:
        return df
    return df[df[col].dt.year == year].copy()

def _empresa_nome(empresa_code) -> str | None:
    """Converte código numérico de empresa (ex: '1.0') para RazaoSocial via SQL."""
    if empresa_code is None:
        return None
    try:
        eid = int(float(empresa_code))
    except (ValueError, TypeError):
        return str(empresa_code)
    try:
        from sqlalchemy import text as _text
        with engine.connect() as conn:
            row = conn.execute(_text("SELECT nome FROM empresas WHERE id = :e"), {"e": eid}).fetchone()
            if row and row[0]:
                return str(row[0])
    except Exception as _e:
        logger.warning("empresa_nome SQL erro=%s", _e)
    return str(empresa_code)

def _contrato_ativo(id_veiculo, data_exec) -> dict | None:
    """Retorna o contrato ativo para um veículo em uma data de execução via SQL."""
    if not id_veiculo or not data_exec:
        return None
    try:
        id_veiculo = int(id_veiculo)
        dc_str = str(pd.Timestamp(data_exec))[:10]
    except Exception:
        return None
    try:
        from sqlalchemy import text as _text
        with engine.connect() as conn:
            row = conn.execute(_text("""
                SELECT c.nome_cliente, c.cidade_operacao, c.data_inicio,
                       c.data_fim, c.data_encerramento, c.status_contrato
                FROM contrato_veiculo cv
                JOIN contratos c ON c.id = cv.contrato_id
                WHERE cv.id_veiculo = :idv
                  AND (c.data_inicio IS NULL OR c.data_inicio <= :dt)
                  AND (c.data_encerramento IS NULL OR c.data_encerramento >= :dt)
                ORDER BY c.data_inicio DESC
                LIMIT 1
            """), {"idv": id_veiculo, "dt": dc_str}).fetchone()
            if row:
                return {
                    "contrato_nome":   str(row[0] or ""),
                    "contrato_cidade": str(row[1] or ""),
                    "contrato_inicio": str(row[2])[:10] if row[2] else None,
                    "contrato_fim":    str(row[3])[:10] if row[3] else None,
                    "contrato_status": str(row[5] or ""),
                }
    except Exception as _e:
        logger.warning("contrato_ativo SQL erro=%s", _e)
    return None

def _load_db_financials(year: int) -> dict:
    """Lê fat_unitario, seguro_mensal, impostos e rastreamento direto do banco.
    Retorna DataFrames com os mesmos nomes de coluna que o Excel (IDVeiculo, Medicao…).
    O banco é mais completo e atualizado que o Excel para essas tabelas."""
    result = {}
    try:
        with engine.connect() as conn:
            result["fat"] = pd.read_sql(
                "SELECT id_veiculo AS IDVeiculo, mes AS Mes, "
                "medicao AS Medicao, trabalhado AS Trabalhado, parado AS Parado, "
                "id_empresa AS IDEmpresa "
                "FROM fat_unitario WHERE strftime('%Y', mes) = :y",
                conn, params={"y": str(year)},
            )
            result["fat"]["Mes"] = pd.to_datetime(result["fat"]["Mes"])

            result["seg"] = pd.read_sql(
                "SELECT id_veiculo AS IDVeiculo, vencimento AS Vencimento, valor AS Valor, "
                "id_empresa AS IDEmpresa "
                "FROM seguro_mensal WHERE strftime('%Y', vencimento) = :y",
                conn, params={"y": str(year)},
            )
            result["seg"]["Vencimento"] = pd.to_datetime(result["seg"]["Vencimento"])

            result["imp"] = pd.read_sql(
                "SELECT id_veiculo AS IDVeiculo, exercicio AS Exercicio, "
                "valor_ipva AS ValorIpva, valor_licenciamento AS ValorLicenc, "
                "valor_multas AS ValorMultas, id_empresa AS IDEmpresa "
                "FROM debitos_documentais WHERE exercicio = :y",
                conn, params={"y": year},
            )

            result["rast"] = pd.read_sql(
                "SELECT id_veiculo AS IDVeiculo, "
                "  vencimento AS Vencimento, "
                "  valor_mensal * 12 AS Valor, "
                "  id_empresa AS IDEmpresa "
                "FROM rastreamento "
                "WHERE COALESCE(vencimento, :y || '-12-31') >= :y || '-01-01' "
                "  AND COALESCE(data_inicio, :y || '-01-01') <= :y || '-12-31'",
                conn, params={"y": str(year)},
            )
            if not result["rast"].empty:
                result["rast"]["Vencimento"] = pd.to_datetime(result["rast"]["Vencimento"])

            result["reimb"] = pd.read_sql(
                "SELECT id_veiculo AS IDVeiculo, emissao AS Emissão, "
                "valor_reembolso AS ValorReembolso, id_empresa AS IDEmpresa "
                "FROM reembolsos WHERE strftime('%Y', emissao) = :y",
                conn, params={"y": str(year)},
            )
            if not result["reimb"].empty:
                result["reimb"]["Emissão"] = pd.to_datetime(result["reimb"]["Emissão"])

            result["fat_sh"] = pd.read_sql(
                "SELECT emissao AS Emissão, valor_locacoes AS ValorLocacoes, "
                "valor_recebido AS ValorRecebido "
                "FROM faturamento_mensal WHERE strftime('%Y', emissao) = :y",
                conn, params={"y": str(year)},
            )
            if not result["fat_sh"].empty:
                result["fat_sh"]["Emissão"] = pd.to_datetime(result["fat_sh"]["Emissão"])
    except Exception as e:
        logger.error("Erro ao carregar financeiros do banco: %s", e)
    return result

def _check_inconsistencias(df_active, year):
    issues = []
    if df_active.empty:
        return issues
    sold = df_active[df_active["Status"].str.upper().str.contains("VEND", na=False)]
    for _, row in sold.iterrows():
        issues.append({
            "tipo": "vendido_com_movimento",
            "placa": str(row["Placa"]),
            "descricao": (
                f"{row['Placa']} ({row.get('Modelo','')}) consta como vendido "
                f"mas possui lançamentos em {year} "
                f"(receita {safe(row['ReceitaTotal']):.2f} / custo {safe(row['CustoTotal']):.2f})"
            ),
        })
    return issues

def _linear_projection(monthly_data: list, n_future: int = 4) -> list:
    """Simple linear regression projection on non-zero months."""
    pts = [(i + 1, v) for i, v in enumerate(monthly_data) if v > 0]
    if len(pts) < 2:
        return []
    xs = np.array([p[0] for p in pts])
    ys = np.array([p[1] for p in pts])
    coeffs = np.polyfit(xs, ys, 1)
    slope, intercept = coeffs
    resid  = ys - np.polyval(coeffs, xs)
    std    = float(np.std(resid))
    last_x = int(xs[-1])
    proj   = []
    for i in range(1, n_future + 1):
        x   = last_x + i
        val = float(np.polyval(coeffs, x))
        proj.append({
            "x": x,
            "projected": max(0.0, round(val, 2)),
            "low":       max(0.0, round(val - std, 2)),
            "high":      max(0.0, round(val + std, 2)),
        })
    return proj

def compute(year: int, empresa: str = None):
    """Executa compute() nativo, com wrapper de cache em _compute_cached"""
    return _compute_cached(year, empresa)

def _compute_core(year: int, empresa: str = None):
    # Todos os dados vêm do banco SQL
    frota = pd.DataFrame()

    _db   = _load_db_financials(year)
    fat   = _db.get("fat",   pd.DataFrame())
    seg   = _db.get("seg",   pd.DataFrame())
    imp   = _db.get("imp",   pd.DataFrame())
    rast  = _db.get("rast",  pd.DataFrame())
    reimb = _db.get("reimb", pd.DataFrame())
    fat_sh = _db.get("fat_sh", pd.DataFrame())

    # manut_raw começa vazio; OS do banco são carregadas abaixo
    manut_raw = pd.DataFrame()
    
    # ── Carregar todos os dados do banco SQL ──────────────────────────
    try:
        with engine.connect() as conn:
            # 1. Frota completa do banco
            frota = pd.read_sql(
                "SELECT id AS IDVeiculo, placa AS Placa, id_empresa AS IDEmpresa, "
                "marca AS Marca, modelo AS Modelo, status AS Status, "
                "tipagem AS Tipagem, implemento AS Implemento, "
                "ano_modelo AS AnoModelo, tabela_fipe AS TabelaFipe, "
                "valor_implemento AS ValorImplemento, valor_total AS ValorTotal FROM frota", conn)

            # ── Resolver ID da empresa filtrada ────────────────────────────────
            # Converte sigla (parâmetro externo) para ID inteiro (padrão interno do banco)
            emp_id = None
            if empresa:
                row_emp = conn.execute(
                    text("SELECT id FROM empresas WHERE UPPER(sigla) = UPPER(:s)"),
                    {"s": str(empresa).strip()}
                ).fetchone()
                emp_id = row_emp[0] if row_emp else None

            # ── Filtrar por empresa ────────────────────────────────────────────
            if emp_id is not None:
                if emp_id == 1:  # EMPRESA_A: proprietária de todos os veículos próprios
                    frota = frota[frota["IDEmpresa"] == 1].copy()
                    empresa_ids = set(frota["IDVeiculo"].dropna().tolist())
                    fat   = fat[fat["IDEmpresa"]  == 1] if not fat.empty   and "IDEmpresa" in fat.columns   else fat
                    reimb = reimb[reimb["IDEmpresa"] == 1] if not reimb.empty and "IDEmpresa" in reimb.columns else reimb
                    seg   = seg[seg["IDEmpresa"]   == 1] if not seg.empty   and "IDEmpresa" in seg.columns   else seg
                    rast  = rast[rast["IDEmpresa"]  == 1] if not rast.empty  and "IDEmpresa" in rast.columns  else rast
                    imp   = imp[imp["IDEmpresa"]   == 1] if not imp.empty   and "IDEmpresa" in imp.columns   else imp
                    if not manut_raw.empty and "IDVeiculo" in manut_raw.columns:
                        manut_raw = manut_raw[manut_raw["IDVeiculo"].isin(empresa_ids)]
                else:
                    # Outras empresas: veículos sublocados de EMPRESA_A (id=1, status=Sublocado)
                    # OU veículos de propriedade direta dessa empresa
                    if "IDEmpresa" in frota.columns and "Status" in frota.columns:
                        mask = (
                            (frota["IDEmpresa"] == emp_id) |
                            (
                                (frota["IDEmpresa"] == 1) &
                                (frota["Status"].fillna("").str.strip().str.upper() == "SUBLOCADO")
                            )
                        )
                        frota = frota[mask].copy()
                    empresa_ids = set(frota["IDVeiculo"].dropna().tolist())
                    fat   = fat[fat["IDEmpresa"]  == emp_id] if not fat.empty   and "IDEmpresa" in fat.columns   else fat
                    reimb = reimb[reimb["IDEmpresa"] == emp_id] if not reimb.empty and "IDEmpresa" in reimb.columns else reimb
                    seg   = seg[seg["IDEmpresa"]   == emp_id] if not seg.empty   and "IDEmpresa" in seg.columns   else seg
                    rast  = rast[rast["IDEmpresa"]  == emp_id] if not rast.empty  and "IDEmpresa" in rast.columns  else rast
                    imp   = imp[imp["IDEmpresa"]   == emp_id] if not imp.empty   and "IDEmpresa" in imp.columns   else imp
                    if not manut_raw.empty and "IDVeiculo" in manut_raw.columns:
                        manut_raw = manut_raw[manut_raw["IDVeiculo"].isin(empresa_ids)]

            # 2. Carregar OS Finalizadas do SQL para o ano selecionado
            # Filtro por empresa: ao nível da NF (cada NF tem id_empresa).
            # Um OS pode ter NFs de empresas diferentes; cada empresa vê apenas o custo das suas NFs.
            _os_params = {"year": str(year)}
            if emp_id is not None:
                _os_params["empresa_id"] = emp_id
                # Inclui OS se tiver pelo menos 1 NF desta empresa, ou se for OS legada sem NF com os.id_empresa correto
                _os_empresa_clause = """
                    AND (
                        EXISTS (SELECT 1 FROM notas_fiscais nf
                                WHERE nf.os_id = os.id AND nf.id_empresa = :empresa_id AND nf.deletado_em IS NULL)
                        OR (NOT EXISTS (SELECT 1 FROM notas_fiscais WHERE os_id = os.id AND deletado_em IS NULL)
                            AND os.id_empresa = :empresa_id)
                    )
                """
                # Filtro adicional dentro das subqueries de NF para somar só o custo desta empresa
                _nf_emp = "AND nf.id_empresa = :empresa_id"
            else:
                _os_empresa_clause = ""
                _nf_emp = ""

            sql_os = pd.read_sql(f"""
                SELECT os.id as id_sql, os.id_veiculo as IDVeiculo, os.placa as Placa,
                       COALESCE(os.data_execucao, os.data_entrada) as DataExecução,
                       CASE
                         WHEN EXISTS (
                           SELECT 1 FROM notas_fiscais nf
                           JOIN manutencao_parcelas p ON p.nf_id = nf.id
                           WHERE nf.os_id = os.id AND nf.deletado_em IS NULL AND p.deletado_em IS NULL
                           {_nf_emp}
                         )
                         THEN COALESCE(
                           (SELECT SUM(COALESCE(p.valor_atualizado, p.valor_parcela))
                            FROM manutencao_parcelas p
                            JOIN notas_fiscais nf ON nf.id = p.nf_id
                            WHERE nf.os_id = os.id
                              {_nf_emp}
                              AND p.deletado_em IS NULL
                              AND nf.deletado_em IS NULL
                              AND strftime('%Y', p.data_vencimento) = :year),
                           0
                         )
                         ELSE COALESCE(os.total_os, (SELECT SUM(valor_total_nf) FROM notas_fiscais WHERE os_id = os.id AND deletado_em IS NULL), 0)
                       END as TotalOS,
                       os.fornecedor as Fornecedor, os.modelo as Modelo, os.numero_os as IDOrdServ,
                       os.tipo_manutencao as TipoManutencao, os.km as KM, os.prox_km as ProxKM, os.prox_data as ProxData,
                       (SELECT sistema FROM os_itens WHERE os_id = os.id LIMIT 1) as Sistema,
                       (SELECT servico FROM os_itens WHERE os_id = os.id LIMIT 1) as Serviço,
                       (SELECT COUNT(*) FROM notas_fiscais WHERE os_id = os.id AND deletado_em IS NULL) as qtd_notas
                FROM ordens_servico os
                WHERE os.deletado_em IS NULL
                  {_os_empresa_clause}
                  AND (
                    EXISTS (
                      SELECT 1 FROM notas_fiscais nf
                      JOIN manutencao_parcelas p ON p.nf_id = nf.id
                      WHERE nf.os_id = os.id AND nf.deletado_em IS NULL AND p.deletado_em IS NULL
                        {_nf_emp}
                        AND strftime('%Y', p.data_vencimento) = :year
                    )
                    OR
                    (
                      NOT EXISTS (
                        SELECT 1 FROM notas_fiscais nf
                        JOIN manutencao_parcelas p ON p.nf_id = nf.id
                        WHERE nf.os_id = os.id AND nf.deletado_em IS NULL AND p.deletado_em IS NULL
                      )
                      AND os.status_os = 'finalizada'
                      AND strftime('%Y', COALESCE(os.data_execucao, os.data_entrada)) = :year
                    )
                  )
            """, conn, params=_os_params)
            
            if not sql_os.empty:
                # ── EXPLOSÃO DE SISTEMAS PARA O DASHBOARD ──────────────────────
                os_ids_list = [int(x) for x in sql_os["id_sql"].dropna().tolist()]
                if os_ids_list:
                    try:
                        placeholders = ','.join(['?'] * len(os_ids_list))
                        items_sql = f"""
                            SELECT i.os_id, COALESCE(i.sistema, 'Outros') as Sistema, 
                                   MAX(COALESCE(i.servico, '')) as Serviço,
                                   SUM(COALESCE(nfi.valor_total_item, 0)) as sys_cost
                            FROM os_itens i
                            LEFT JOIN nf_itens nfi ON nfi.os_item_id = i.id
                            WHERE i.os_id IN ({placeholders})
                            GROUP BY i.os_id, i.sistema
                        """
                        df_items = pd.read_sql(items_sql, conn, params=tuple(os_ids_list))
                        
                        if not df_items.empty:
                            exploded_rows = []
                            for _, os_row in sql_os.iterrows():
                                oid = int(os_row["id_sql"])
                                sub_items = df_items[df_items["os_id"] == oid]
                                
                                if sub_items.empty:
                                    exploded_rows.append(os_row)
                                    continue
                                
                                total_item_sum = float(sub_items["sys_cost"].sum())
                                orig_total = float(os_row["TotalOS"] or 0)
                                
                                if total_item_sum > 0:
                                    for _, it_row in sub_items.iterrows():
                                        nr = os_row.copy()
                                        nr["Sistema"] = it_row["Sistema"]
                                        nr["Serviço"] = it_row["Serviço"]
                                        nr["TotalOS"] = round(orig_total * (float(it_row["sys_cost"]) / total_item_sum), 2)
                                        exploded_rows.append(nr)
                                else:
                                    share = 1.0 / len(sub_items)
                                    for _, it_row in sub_items.iterrows():
                                        nr = os_row.copy()
                                        nr["Sistema"] = it_row["Sistema"]
                                        nr["Serviço"] = it_row["Serviço"]
                                        nr["TotalOS"] = round(orig_total * share, 2)
                                        exploded_rows.append(nr)
                            
                            sql_os = pd.DataFrame(exploded_rows)
                    except Exception as ex_exp:
                        logger.error("Erro ao explodir sistemas na análise compute(): %s", ex_exp)

                sql_os["DataExecução"] = pd.to_datetime(sql_os["DataExecução"])

                # SQL prevalece sobre Excel: remove TODAS as OS que existem no banco,
                # SQL é a única fonte — sql_os vai direto para manut_raw
                manut_raw = sql_os
    except Exception as e:
        logger.error("Erro ao carregar dados do banco no Dashboard: %s", e)

    # ── Reclassificação de sistemas ────────────────────────
    if not manut_raw.empty:
        def _reclassify(row):
            sistema = str(row.get("Sistema", "")).strip().lower()
            tipo    = str(row.get("TipoManutencao", "")).strip().lower()
            servico = str(row.get("Serviço", "")).strip().lower()
            os_id   = str(row.get("IDOrdServ", ""))

            is_revisao = False
            if sistema == 'revisão':
                row["Sistema"] = "Motor"
                if tipo == 'preventiva':
                    is_revisao = True

            if os_id == 'OS-2026-0205' or ('óleo' in servico):
                if tipo == 'preventiva' and str(row.get("Sistema", "")).lower() == 'motor':
                    is_revisao = True

            row["evento"] = "Revisão" if is_revisao else None
            return row

        manut_raw = manut_raw.apply(_reclassify, axis=1)

    manut = manut_raw

    # ── Receitas por veículo ─────────────────────────────────
    rev_loc  = fat.groupby("IDVeiculo")["Medicao"].sum().rename("ReceitaLocacao") if not fat.empty else pd.Series(dtype=float, name="ReceitaLocacao")
    rev_reib = (reimb.dropna(subset=["IDVeiculo"]).groupby("IDVeiculo")["ValorReembolso"].sum().rename("ReceitaReembolso")
                if not reimb.empty else pd.Series(dtype=float, name="ReceitaReembolso"))

    # ── Custos por veículo ───────────────────────────────────
    c_manut = (manut.dropna(subset=["IDVeiculo"]).groupby("IDVeiculo")["TotalOS"].sum().rename("CustoManutencao")
               if not manut.empty else pd.Series(dtype=float, name="CustoManutencao"))
    c_seg   = (seg.groupby("IDVeiculo")["Valor"].sum().rename("CustoSeguro")
               if not seg.empty else pd.Series(dtype=float, name="CustoSeguro"))
    c_rast  = (rast.groupby("IDVeiculo")["Valor"].sum().rename("CustoRastreamento")
               if not rast.empty else pd.Series(dtype=float, name="CustoRastreamento"))

    if not imp.empty and "IDVeiculo" in imp.columns:
        imp["_val"] = (
            imp.get("ValorIpva",    pd.Series(0, index=imp.index)).fillna(0)
            + imp.get("ValorLicenc",  pd.Series(0, index=imp.index)).fillna(0)
            + imp.get("ValorMultas",  pd.Series(0, index=imp.index)).fillna(0)
        )
        c_imp = imp.groupby("IDVeiculo")["_val"].sum().rename("CustoImpostos")
    else:
        c_imp = pd.Series(dtype=float, name="CustoImpostos")

    # ── Dias trabalhados / parados ───────────────────────────
    if not fat.empty and "Trabalhado" in fat.columns:
        dias = fat.groupby("IDVeiculo").agg(Trabalhado=("Trabalhado", "sum"), Parado=("Parado", "sum"))
    else:
        dias = pd.DataFrame(columns=["Trabalhado", "Parado"])

    # ── Contrato principal por veículo (mais recente) ────────
    contrato_info = pd.DataFrame(columns=["IDVeiculo", "Contrato", "CidadeOp"])
    if not fat.empty and "Contrato" in fat.columns:
        contrato_info = (fat.dropna(subset=["IDVeiculo", "Contrato"])
                         .groupby("IDVeiculo")["Contrato"]
                         .agg(lambda x: x.value_counts().index[0] if len(x) > 0 else "—")
                         .rename("Contrato")
                         .reset_index())

    base_cols = ["IDVeiculo", "Placa", "Marca", "Modelo", "Status", "Tipagem", "Implemento", "AnoModelo", "TabelaFipe", "ValorImplemento", "ValorTotal"]
    base_cols = [c for c in base_cols if c in frota.columns]

    df = (
        frota[base_cols]
        .set_index("IDVeiculo")
        .join(rev_loc,  how="left")
        .join(rev_reib, how="left")
        .join(c_manut,  how="left")
        .join(c_seg,    how="left")
        .join(c_imp,    how="left")
        .join(c_rast,   how="left")
        .join(dias,     how="left")
        .reset_index()
    )

    numeric_cols = [
        "ReceitaLocacao", "ReceitaReembolso", "ReceitaTotal", "CustoManutencao", 
        "CustoSeguro", "CustoImpostos", "CustoRastreamento", "CustoTotal", 
        "Trabalhado", "Parado"
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    if not contrato_info.empty:
        df = df.merge(contrato_info, on="IDVeiculo", how="left")
        df["Contrato"] = df["Contrato"].fillna("—")
    else:
        df["Contrato"] = "—"

    df["ReceitaTotal"] = df["ReceitaLocacao"] + df["ReceitaReembolso"]
    df["CustoTotal"]   = df["CustoManutencao"] + df["CustoSeguro"] + df["CustoImpostos"] + df["CustoRastreamento"]
    df["Margem"]       = df["ReceitaTotal"] - df["CustoTotal"]
    df["MargemPct"]    = np.where(df["ReceitaTotal"] > 0, df["Margem"] / df["ReceitaTotal"] * 100, 0)
    df["ReceitaPorDia"]= np.where(df["Trabalhado"] > 0, df["ReceitaTotal"] / df["Trabalhado"], 0)
    df["CustoPorDia"]  = np.where(df["Trabalhado"] > 0, df["CustoTotal"]  / df["Trabalhado"], 0)
    df["MargemPorDia"] = np.where(df["Trabalhado"] > 0, df["Margem"]       / df["Trabalhado"], 0)
    df["ROI"] = np.where(df.get("ValorTotal", pd.Series(0, index=df.index)) > 0,
                         df["Margem"] / df.get("ValorTotal", pd.Series(1, index=df.index)) * 100, 0) if "ValorTotal" in df.columns else 0

    df_active = df[(df["ReceitaTotal"] > 0) | (df["CustoTotal"] > 0)].copy()

    # ── Evolução mensal ──────────────────────────────────────
    def monthly_group(frame, date_col, val_col, out_col):
        if frame.empty or date_col not in frame.columns:
            return pd.DataFrame({"Mes": range(1, 13), out_col: 0.0})
        grp = frame.assign(_m=frame[date_col].dt.month).groupby("_m")[val_col].sum().reset_index()
        grp.columns = ["Mes", out_col]
        base = pd.DataFrame({"Mes": range(1, 13)})
        return base.merge(grp, on="Mes", how="left").fillna(0)

    frota_ids     = set(frota["IDVeiculo"].dropna().tolist())
    manut_frota   = (manut[manut["IDVeiculo"].isin(frota_ids)].dropna(subset=["IDVeiculo"])
                     if not manut.empty else manut)

    ml   = monthly_group(fat,         "Mes",          "Medicao",        "Locacao")
    mr   = monthly_group(reimb,       "Emissão",       "ValorReembolso", "Reembolso")
    mcm  = monthly_group(manut_frota, "DataExecução",  "TotalOS",        "CustoManutencao")
    mcs  = monthly_group(seg,         "Vencimento",    "Valor",          "CustoSeguro")
    mcr  = monthly_group(rast,        "Vencimento",    "Valor",          "CustoRastreamento")

    monthly = (ml.merge(mr, on="Mes").merge(mcm, on="Mes").merge(mcs, on="Mes").merge(mcr, on="Mes"))
    monthly["ReceitaTotal"] = monthly["Locacao"] + monthly["Reembolso"]
    monthly["CustoTotal"]   = monthly["CustoManutencao"] + monthly["CustoSeguro"] + monthly["CustoRastreamento"]
    monthly["Margem"]       = monthly["ReceitaTotal"] - monthly["CustoTotal"]
    monthly["MesLabel"]     = monthly["Mes"].apply(lambda m: MESES_PT[m - 1])

    # ── KPIs ─────────────────────────────────────────────────
    faturado   = safe(fat_sh["ValorLocacoes"].sum()) if not fat_sh.empty and "ValorLocacoes" in fat_sh.columns else 0.0
    recebido   = safe(fat_sh["ValorRecebido"].sum()) if not fat_sh.empty and "ValorRecebido" in fat_sh.columns else 0.0
    reembolsos = safe(reimb["ValorReembolso"].sum()) if not reimb.empty and "ValorReembolso" in reimb.columns else 0.0

    receita_total   = safe(df_active["ReceitaTotal"].sum())
    custo_total     = safe(df_active["CustoTotal"].sum())
    margem          = safe(df_active["Margem"].sum())
    margem_pct      = round(margem / receita_total * 100, 1) if receita_total > 0 else 0.0
    veiculos_ativos = int(len(df_active))
    veiculos_lucr   = int((df_active["Margem"] > 0).sum())

    taxa_util = 0.0
    if not fat.empty and "Trabalhado" in fat.columns and "Parado" in fat.columns:
        t = fat["Trabalhado"].sum(); p = fat["Parado"].sum()
        if (t + p) > 0:
            taxa_util = round(t / (t + p) * 100, 1)

    best_v = worst_v = None
    if not df_active.empty:
        bi = df_active["Margem"].idxmax()
        wi = df_active["Margem"].idxmin()
        best_v  = {"placa": str(df_active.loc[bi, "Placa"]), "modelo": str(df_active.loc[bi, "Modelo"]), "margem": safe(df_active.loc[bi, "Margem"])}
        worst_v = {"placa": str(df_active.loc[wi, "Placa"]), "modelo": str(df_active.loc[wi, "Modelo"]), "margem": safe(df_active.loc[wi, "Margem"])}

    kpis = {
        "veiculos_ativos":      veiculos_ativos,
        "veiculos_total":       int(len(frota)),
        "veiculos_lucrativos":  veiculos_lucr,
        "veiculos_deficitarios": veiculos_ativos - veiculos_lucr,
        "faturado":             faturado,
        "recebido":             recebido,
        "receita_locacao":      safe(df_active["ReceitaLocacao"].sum()),
        "receita_reembolso":    reembolsos,
        "receita_total":        receita_total,
        "custo_manutencao":     safe(manut["TotalOS"].sum()) if not manut.empty else 0.0,
        "custo_seguro":         safe(df_active["CustoSeguro"].sum()),
        "custo_impostos":       safe(df_active["CustoImpostos"].sum()),
        "custo_rastreamento":   safe(df_active["CustoRastreamento"].sum()),
        "custo_total":          custo_total,
        "margem":               margem,
        "margem_pct":           margem_pct,
        "taxa_utilizacao":      taxa_util,
        "melhor_veiculo":       best_v,
        "pior_veiculo":         worst_v,
        "receita_por_veiculo":  round(receita_total / veiculos_ativos, 2) if veiculos_ativos else 0.0,
        "margem_por_veiculo":   round(margem / veiculos_ativos, 2) if veiculos_ativos else 0.0,
        "custo_sobre_receita":  round(custo_total / receita_total * 100, 1) if receita_total > 0 else 0.0,
        "inconsistencias":      _check_inconsistencias(df_active, year),
    }

    return df_active, monthly, kpis, fat, reimb, manut, seg, rast, imp


def _compute_cached(year: int, empresa: str = None):
    """Wrapper thread-safe com cache por (year, empresa). Cache é invalidado na inicialização do processo."""
    key = (year, empresa)
    with _compute_lock:
        if key in _compute_cache:
            return _compute_cache[key]

    # Processa fora do lock para não bloquear a API
    result = _compute_core(year, empresa)

    with _compute_lock:
        if key not in _compute_cache:
            _compute_cache[key] = result
        return _compute_cache[key]
