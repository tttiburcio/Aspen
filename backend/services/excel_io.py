"""
Leitura e sincronização Excel ↔ SQLite.

Contém:
- load_raw(): leitura cacheada de todas as abas do Excel
- sync_excel_to_db(): importa OS do Excel → banco
- sync_db_to_excel(): exporta OS finalizadas do banco → Excel
- _sync_manutencoes_background(): orquestra sync bidirecional em background
- _sync_os_to_excel(): sincroniza uma OS específica para o Excel
"""
import logging
import threading

import numpy as np
import pandas as pd
from pathlib import Path

from config import EXCEL_PATH, SHEETS
from database import SessionLocal, engine
from utils.converters import _sv_str, _sv_float, _sv_int, _sv_date, _col_like
import models

logger = logging.getLogger("locadora")

# ── Cache com invalidação por mtime ──────────────────────────────────
_cache: dict = {}
_cache_mtime: float = 0.0
_cache_lock = threading.Lock()


def load_raw(force: bool = False) -> dict:
    global _cache_mtime
    with _cache_lock:
        try:
            mtime = EXCEL_PATH.stat().st_mtime
        except OSError:
            mtime = 0.0
        if not force and _cache and mtime == _cache_mtime:
            return _cache
        _cache.clear()
        _cache_mtime = mtime
        if not EXCEL_PATH.exists():
            logger.warning("Excel não encontrado em %s — operando em modo SQL-only", EXCEL_PATH)
            _cache.update({k: pd.DataFrame() for k in SHEETS})
            return _cache
        with pd.ExcelFile(EXCEL_PATH) as xl:
            for key, name in SHEETS.items():
                try:
                    _cache[key] = xl.parse(name)
                except Exception as e:
                    logger.warning("Sheet '%s' não encontrada: %s", name, e)
                    _cache[key] = pd.DataFrame()
        return _cache


def sync_excel_to_db() -> int:
    """Importa do Excel MANUTENCOES → ordens_servico/os_itens os IDOrdServ ausentes no banco.

    Idempotente: pula OS cujo numero_os já existe em ordens_servico.
    Retorna o número de OS importadas.
    """
    raw = load_raw()
    manut = raw.get("manutencoes", pd.DataFrame())
    frota_df = raw.get("frota", pd.DataFrame())

    if manut.empty or "IDOrdServ" not in manut.columns:
        return 0

    db = SessionLocal()
    try:
        existing_os: set[str] = set(
            x[0] for x in db.query(models.OrdemServico.numero_os)
            .filter(models.OrdemServico.numero_os.isnot(None)).all()
        )

        col_serv  = _col_like(manut, "servi") or "Serviço"
        col_pos   = _col_like(manut, "posi",    "pneu")
        col_espec = _col_like(manut, "especif", "pneu")
        col_data  = _col_like(manut, "data", "exec") or "DataExecução"

        imported = 0
        for raw_id, grp in manut.dropna(subset=["IDOrdServ"]).groupby("IDOrdServ"):
            id_ord = _sv_str(raw_id)
            if not id_ord or id_ord in existing_os:
                continue

            first = grp.iloc[0]

            id_veiculo = _sv_int(first.get("IDVeiculo"))
            if id_veiculo is None:
                continue

            # Placa via frota lookup
            placa = None
            if not frota_df.empty and "IDVeiculo" in frota_df.columns and "Placa" in frota_df.columns:
                fr = frota_df[frota_df["IDVeiculo"] == id_veiculo]
                if not fr.empty:
                    placa = _sv_str(fr.iloc[0].get("Placa"))

            os_obj = models.OrdemServico(
                numero_os      = id_ord,
                status_os      = "finalizada",
                id_veiculo     = id_veiculo,
                placa          = placa or _sv_str(first.get("Placa")),
                data_execucao  = _sv_date(first.get(col_data)),
                km             = _sv_int(first.get("KM")),
                total_os       = _sv_float(first.get("TotalOS")),
                categoria      = _sv_str(first.get("Categoria")),
                fornecedor     = _sv_str(first.get("Fornecedor")),
                tipo_manutencao= _sv_str(first.get("TipoManutencao")),
                migrado_de_ids = '["excel_sync"]',
            )
            db.add(os_obj)
            db.flush()

            # Itens: um por combinação única (sistema, serviço, posição)
            seen_items: set = set()
            for _, row in grp.iterrows():
                sistema = _sv_str(row.get("Sistema"))
                servico = _sv_str(row.get(col_serv)) if col_serv else None
                posicao = _sv_str(row.get(col_pos))  if col_pos  else None
                espec   = _sv_str(row.get(col_espec)) if col_espec else None
                cat     = _sv_str(row.get("Categoria"))

                key = (sistema, servico, posicao, espec)
                if key in seen_items:
                    continue
                seen_items.add(key)

                db.add(models.OsItem(
                    os_id        = os_obj.id,
                    categoria    = cat,
                    sistema      = sistema,
                    servico      = servico,
                    posicao_pneu = posicao,
                    qtd_pneu     = _sv_int(row.get("QtdPneu")),
                    espec_pneu   = espec,
                    marca_pneu    = _sv_str(row.get("MarcaPneu")),
                    modelo_pneu   = _sv_str(row.get("ModeloPneu")),
                    condicao_pneu = _sv_str(row.get("CondicaoPneu")),
                    manejo_pneu   = _sv_str(row.get("ManejoPneu")),
                ))

            db.commit()
            existing_os.add(id_ord)
            imported += 1

        return imported
    except Exception as e:
        db.rollback()
        logger.error("sync_excel_to_db error: %s", e)
        return 0
    finally:
        db.close()


def sync_db_to_excel() -> int:
    """Acrescenta na planilha MANUTENCOES as OS finalizadas do banco ausentes no Excel.

    Usa o mesmo formato de linha que _sync_os_to_excel (uma linha por NF/parcela).
    OS sem NFs registradas escrevem uma linha de resumo sem dados financeiros.
    Retorna o número de linhas acrescentadas.
    """
    if not EXCEL_PATH.exists():
        return 0

    raw = load_raw()
    manut_excel = raw.get("manutencoes", pd.DataFrame())
    excel_ids: set[str] = set()
    if not manut_excel.empty and "IDOrdServ" in manut_excel.columns:
        excel_ids = set(manut_excel["IDOrdServ"].dropna().astype(str).unique())

    db = SessionLocal()
    try:
        os_list = (
            db.query(models.OrdemServico)
            .filter(
                models.OrdemServico.status_os == "finalizada",
                models.OrdemServico.deletado_em.is_(None),
                models.OrdemServico.numero_os.isnot(None),
            )
            .all()
        )
        new_os = [o for o in os_list if o.numero_os not in excel_ids]
        if not new_os:
            return 0

        # Lê arquivo uma vez; detecta sheet name
        try:
            with pd.ExcelFile(EXCEL_PATH) as xl:
                sheet_name = next((s for s in xl.sheet_names if "manutencao" in s.lower().replace("ç","c").replace("ã","a")), None)
                if not sheet_name:
                    sheet_name = SHEETS["manutencoes"]
                if sheet_name not in xl.sheet_names:
                    return 0
                df = xl.parse(sheet_name)
        except PermissionError:
            logger.warning("sync_db_to_excel: Excel aberto por outro processo — ignorado")
            return 0
        except Exception as e:
            logger.error("sync_db_to_excel leitura: %s", e)
            return 0

        next_id = 1
        if not df.empty and "IDManutencao" in df.columns:
            valid_ids = pd.to_numeric(df["IDManutencao"], errors="coerce").dropna()
            if not valid_ids.empty:
                next_id = int(valid_ids.max()) + 1

        all_new_rows: list[dict] = []
        for os_obj in new_os:
            first_item = os_obj.itens[0] if os_obj.itens else None
            nfs_ativas  = [nf for nf in os_obj.notas_fiscais if nf.deletado_em is None]

            if nfs_ativas:
                for nf in nfs_ativas:
                    # Agrupar peso por sistema para o caso de múltiplos itens do mesmo sistema na mesma NF
                    total_items_cost = sum(float(it.valor_total_item or 0) for it in nf.itens) if getattr(nf, 'itens', None) else 0
                    sys_info = {}
                    if total_items_cost > 0 and len(nf.itens) > 1:
                        for it in nf.itens:
                            sn = (it.os_item.sistema if it.os_item else None) or "Outros"
                            if sn not in sys_info:
                                sys_info[sn] = {"cost": 0.0, "item_ref": it}
                            sys_info[sn]["cost"] += float(it.valor_total_item or 0)
                    
                    for p in [px for px in nf.parcelas if px.deletado_em is None]:
                        # Se houver repartição por sistema calculada
                        if sys_info:
                            for sname, sdict in sys_info.items():
                                ratio = sdict["cost"] / total_items_cost
                                it_ref = sdict["item_ref"]
                                row_val = float(p.valor_parcela) if p.valor_parcela else 0.0
                                
                                all_new_rows.append({
                                    "IDManutencao":       next_id,
                                    "IDOrdServ":          os_obj.numero_os,
                                    "TotalOS":            float(os_obj.total_os) if os_obj.total_os else np.nan,
                                    "Empresa":            os_obj.id_empresa,
                                    "Placa":              os_obj.placa,
                                    "IDVeiculo":          os_obj.id_veiculo,
                                    "Modelo":             os_obj.modelo,
                                    "Implemento":         os_obj.implemento,
                                    "Fornecedor":         nf.fornecedor or os_obj.fornecedor,
                                    "Nota":               nf.numero_nf,
                                    "Data Venc.":         pd.to_datetime(p.data_vencimento).strftime("%Y-%m-%d") if p.data_vencimento else np.nan,
                                    "ParcelaAtual":       p.parcela_atual,
                                    "ParcelaTotal":       p.parcela_total,
                                    "ValorParcela":       round(row_val * ratio, 2),
                                    "FormaPgto":          p.forma_pgto,
                                    "Categoria":          nf.tipo_nf or os_obj.categoria,
                                    "Status":             p.status_pagamento,
                                    "TipoManutencao":     os_obj.tipo_manutencao,
                                    "Sistema":            sname,
                                    "Serviço":            it_ref.os_item.servico if (it_ref and it_ref.os_item) else np.nan,
                                    "KM":                 float(os_obj.km) if os_obj.km else np.nan,
                                    "DataExecução":       pd.to_datetime(os_obj.data_execucao or os_obj.data_entrada).strftime("%Y-%m-%d") if (os_obj.data_execucao or os_obj.data_entrada) else np.nan,
                                    "PosiçãoPneu":        it_ref.os_item.posicao_pneu if (it_ref and it_ref.os_item) else np.nan,
                                    "QtdPneu":            it_ref.os_item.qtd_pneu if (it_ref and it_ref.os_item) else np.nan,
                                    "EspecificaçãoPneu":  it_ref.os_item.espec_pneu if (it_ref and it_ref.os_item) else np.nan,
                                    "MarcaPneu":          it_ref.os_item.marca_pneu    if (it_ref and it_ref.os_item) else np.nan,
                                    "ModeloPneu":         it_ref.os_item.modelo_pneu   if (it_ref and it_ref.os_item) else np.nan,
                                    "CondicaoPneu":       it_ref.os_item.condicao_pneu if (it_ref and it_ref.os_item) else np.nan,
                                    "ManejoPneu":         it_ref.os_item.manejo_pneu   if (it_ref and it_ref.os_item) else np.nan,
                                })
                                next_id += 1
                        else:
                            # Caso contrário (1 item ou sem custos), usa o fluxo antigo com fallback de dados
                            all_new_rows.append({
                                "IDManutencao":       next_id,
                                "IDOrdServ":          os_obj.numero_os,
                                "TotalOS":            float(os_obj.total_os) if os_obj.total_os else np.nan,
                                "Empresa":            os_obj.id_empresa,
                                "Placa":              os_obj.placa,
                                "IDVeiculo":          os_obj.id_veiculo,
                                "Modelo":             os_obj.modelo,
                                "Implemento":         os_obj.implemento,
                                "Fornecedor":         nf.fornecedor or os_obj.fornecedor,
                                "Nota":               nf.numero_nf,
                                "Data Venc.":         pd.to_datetime(p.data_vencimento).strftime("%Y-%m-%d") if p.data_vencimento else np.nan,
                                "ParcelaAtual":       p.parcela_atual,
                                "ParcelaTotal":       p.parcela_total,
                                "ValorParcela":       float(p.valor_parcela) if p.valor_parcela else np.nan,
                                "FormaPgto":          p.forma_pgto,
                                "Categoria":          nf.tipo_nf or os_obj.categoria,
                                "Status":             p.status_pagamento,
                                "TipoManutencao":     os_obj.tipo_manutencao,
                                "Sistema":            first_item.sistema if first_item else np.nan,
                                "Serviço":            first_item.servico if first_item else np.nan,
                                "KM":                 float(os_obj.km) if os_obj.km else np.nan,
                                "DataExecução":       pd.to_datetime(os_obj.data_execucao or os_obj.data_entrada).strftime("%Y-%m-%d") if (os_obj.data_execucao or os_obj.data_entrada) else np.nan,
                                "PosiçãoPneu":        first_item.posicao_pneu if first_item else np.nan,
                                "QtdPneu":            first_item.qtd_pneu if first_item else np.nan,
                                "EspecificaçãoPneu":  first_item.espec_pneu if first_item else np.nan,
                                "MarcaPneu":          first_item.marca_pneu    if first_item else np.nan,
                                "ModeloPneu":         first_item.modelo_pneu   if first_item else np.nan,
                                "CondicaoPneu":       first_item.condicao_pneu if first_item else np.nan,
                                "ManejoPneu":         first_item.manejo_pneu   if first_item else np.nan,
                            })
                            next_id += 1
            else:
                # OS sem NFs: grava linha de resumo
                all_new_rows.append({
                    "IDManutencao":   next_id,
                    "IDOrdServ":      os_obj.numero_os,
                    "TotalOS":        float(os_obj.total_os) if os_obj.total_os else np.nan,
                    "Placa":          os_obj.placa,
                    "IDVeiculo":      os_obj.id_veiculo,
                    "Modelo":         os_obj.modelo,
                    "Implemento":     os_obj.implemento,
                    "Fornecedor":     os_obj.fornecedor,
                    "Categoria":      os_obj.categoria,
                    "TipoManutencao": os_obj.tipo_manutencao,
                    "Sistema":        first_item.sistema if first_item else np.nan,
                    "Serviço":        first_item.servico if first_item else np.nan,
                    "KM":             float(os_obj.km) if os_obj.km else np.nan,
                    "DataExecução":   pd.to_datetime(os_obj.data_execucao or os_obj.data_entrada).strftime("%Y-%m-%d") if (os_obj.data_execucao or os_obj.data_entrada) else np.nan,
                    "PosiçãoPneu":    first_item.posicao_pneu if first_item else np.nan,
                    "QtdPneu":        first_item.qtd_pneu if first_item else np.nan,
                    "EspecificaçãoPneu": first_item.espec_pneu if first_item else np.nan,
                    "MarcaPneu":      first_item.marca_pneu    if first_item else np.nan,
                    "ModeloPneu":     first_item.modelo_pneu   if first_item else np.nan,
                    "CondicaoPneu":   first_item.condicao_pneu if first_item else np.nan,
                    "ManejoPneu":     first_item.manejo_pneu   if first_item else np.nan,
                })
                next_id += 1

        if not all_new_rows:
            return 0

        df_new = pd.DataFrame(all_new_rows)
        # Normaliza case de colunas para corresponder às existentes
        col_map = {c.lower(): c for c in df.columns}
        df_new.rename(columns={c: col_map.get(c.lower(), c) for c in df_new.columns}, inplace=True)
        for col in df.columns:
            if col not in df_new.columns:
                df_new[col] = np.nan
        df_new = df_new.reindex(columns=df.columns)

        df_final = pd.concat([df, df_new], ignore_index=True)
        try:
            with pd.ExcelWriter(EXCEL_PATH, mode="a", engine="openpyxl", if_sheet_exists="replace") as writer:
                df_final.to_excel(writer, sheet_name=sheet_name, index=False)
            _cache.clear()
            logger.info("sync_db_to_excel: %d linhas adicionadas ao Excel", len(all_new_rows))
        except PermissionError:
            logger.warning("sync_db_to_excel: Excel aberto — não foi possível salvar")
            return 0
        except Exception as e:
            logger.error("sync_db_to_excel escrita: %s", e)
            return 0

        return len(all_new_rows)
    except Exception as e:
        logger.error("sync_db_to_excel error: %s", e)
        return 0
    finally:
        db.close()


_TIPO_MAP = {
    "encargos de faturamento": "Encargo de Faturamento",
    "encargo de faturamento":  "Encargo de Faturamento",
    "manutenção":              "Manutenção",
    "manutencao":              "Manutenção",
    "multa de trânsito":       "Multa de Trânsito",
    "multa de transito":       "Multa de Trânsito",
    "franquia de seguro":      "Franquia de Seguro",
    "transporte":              "Transporte",
}

def _normalizar_tipo(tipo: str | None) -> str | None:
    if not tipo:
        return tipo
    return _TIPO_MAP.get(tipo.strip().lower(), tipo.strip())


def sync_reembolsos_from_excel() -> int:
    """Importa/atualiza reembolsos da aba ↩️ REEMBOLSOS do Excel para o banco SQLite.

    Usa IDReembolso como chave natural para upsert idempotente.
    Duplicatas no Excel são ignoradas (mantém a primeira ocorrência).
    Retorna número de registros inseridos ou atualizados.
    """
    raw = load_raw()
    df = raw.get("reembolsos", pd.DataFrame())
    if df.empty:
        return 0

    # Remove linhas sem IDReembolso e deduplicata pelo ID (mantém primeira)
    df = df.dropna(subset=["IDReembolso"]).drop_duplicates(subset=["IDReembolso"], keep="first")

    db = SessionLocal()
    try:
        count = 0
        for _, row in df.iterrows():
            xid = _sv_int(row.get("IDReembolso"))
            if xid is None:
                continue

            # Dedup por chave composta (campo id_reembolso_excel foi removido do modelo)
            _tipo  = _normalizar_tipo(_sv_str(row.get("Tipo")))
            _idv   = _sv_int(row.get("IDVeiculo"))
            _emis  = _sv_date(row.get("Emissão"))
            _valor = _sv_float(row.get("ValorReembolso"))
            existing = db.query(models.Reembolso).filter(
                models.Reembolso.id_veiculo      == _idv,
                models.Reembolso.emissao         == _emis,
                models.Reembolso.tipo            == _tipo,
                models.Reembolso.valor_reembolso == _valor,
            ).first()

            vals = dict(
                tipo               = _tipo,
                id_empresa         = _sv_int(row.get("IDEmpresa")),
                id_contrato        = _sv_int(row.get("IDContrato")),
                id_cliente         = _sv_int(row.get("IDCliente")),
                id_veiculo         = _sv_int(row.get("IDVeiculo")),
                id_ord_serv        = _sv_str(row.get("IDOrdServ")),
                id_multa           = _sv_int(row.get("IDMulta")),
                recibo             = _sv_str(row.get("Recibo")),
                emissao            = _sv_date(row.get("Emissão")),
                vencimento         = _sv_date(row.get("Vencimento")),
                empresa            = _sv_str(row.get("Empresa")),
                valor_reembolso    = _sv_float(row.get("ValorReembolso")),
                data_entrada       = _sv_date(row.get("DataEntrada")),
                valor_recebido     = _sv_float(row.get("ValorRecebido")),
                encargos           = _sv_float(row.get("Encargos de Faturamento")),
                forma_recebimento  = _sv_str(row.get("FormaRecebimento")),
                status_recebimento = _sv_str(row.get("StatusRecebimento")),
                documento_rede     = _sv_str(row.get("DocumentoRede")),
            )

            if existing:
                # Preserva campos de pagamento manual (marcado via UI)
                # se o registro foi pago pela UI, o Excel ainda tem status antigo
                campos_pagamento = {'status_recebimento', 'valor_recebido', 'data_entrada', 'forma_recebimento'}
                pago_manualmente = existing.data_entrada is not None
                for k, v in vals.items():
                    if pago_manualmente and k in campos_pagamento:
                        continue
                    setattr(existing, k, v)
            else:
                db.add(models.Reembolso(**vals))
            count += 1

        db.commit()
        logger.info("sync_reembolsos_from_excel: %d registros processados", count)
        return count
    except Exception as e:
        db.rollback()
        logger.error("sync_reembolsos_from_excel error: %s", e)
        return 0
    finally:
        db.close()


def _sync_manutencoes_background():
    """Executa sincronização bidirecional em background no startup."""
    try:
        n1 = sync_excel_to_db()
        n2 = sync_db_to_excel()
        n3 = sync_reembolsos_from_excel()
        if n1 or n2 or n3:
            logger.info("Sync concluído: %d Excel→DB (manut) | %d DB→Excel | %d reembolsos", n1, n2, n3)
    except Exception as e:
        logger.error("_sync_manutencoes_background error: %s", e)


def _sync_os_to_excel(os_obj):
    """Sincroniza OS finalizada para a aba 🔧 MANUTENCOES da planilha Locadora.xlsx."""
    from fastapi import HTTPException

    file_path = EXCEL_PATH
    if not file_path.exists():
        logger.warning(f"Planilha {file_path} não encontrada para sincronização.")
        return

    try:
        with pd.ExcelFile(file_path) as xl:
            sheet_name = next((s for s in xl.sheet_names if "manutencao" in s.lower()), None)
            if not sheet_name:
                logger.warning("Aba de manutenção não encontrada no Excel.")
                return
            df = xl.parse(sheet_name)
    except PermissionError:
        raise HTTPException(
            status_code=400,
            detail="Erro ao ler a planilha Excel: o arquivo Locadora.xlsx está aberto. Por favor, feche-o e tente novamente."
        )
    except Exception as e:
        logger.error(f"Erro ao ler a planilha para sincronização: {e}")
        return

    # Se a OS já existe na aba de manutenções, removemos para evitar duplicidade
    if not df.empty and "IDOrdServ" in df.columns and os_obj.numero_os:
        df = df[df["IDOrdServ"].astype(str).str.strip() != str(os_obj.numero_os).strip()].copy()

    first_item = os_obj.itens[0] if os_obj.itens else None

    # Gerar novos IDs incrementais
    next_id = 1
    if not df.empty and "IDManutencao" in df.columns:
        valid_ids = pd.to_numeric(df["IDManutencao"], errors="coerce").dropna()
        if not valid_ids.empty:
            next_id = int(valid_ids.max()) + 1

    new_rows = []
    nfs_ativas = [nf for nf in os_obj.notas_fiscais if nf.deletado_em is None]
    
    for nf in nfs_ativas:
        parcelas_ativas = [p for p in nf.parcelas if p.deletado_em is None]
        for p in parcelas_ativas:
            new_rows.append({
                "IDManutencao": next_id,
                "ValidaNovaOS": np.nan,
                "IDOrdServ": os_obj.numero_os,
                "NFOrdem": nf.nf_ordem_origem if hasattr(nf, "nf_ordem_origem") and nf.nf_ordem_origem else np.nan,
                "TotalOS": float(os_obj.total_os) if os_obj.total_os else np.nan,
                "Empresa": os_obj.empresa,
                "Placa": os_obj.placa,
                "IDVeiculo": os_obj.id_veiculo,
                "IDContrato": os_obj.id_contrato,
                "Modelo": os_obj.modelo,
                "Implemento": os_obj.implemento,
                "Fornecedor": nf.fornecedor or os_obj.fornecedor,
                "Nota": nf.numero_nf,
                "Data Venc.": pd.to_datetime(p.data_vencimento).strftime("%Y-%m-%d") if p.data_vencimento else np.nan,
                "ParcelaAtual": p.parcela_atual,
                "ParcelaTotal": p.parcela_total,
                "ValorParcela": float(p.valor_parcela) if p.valor_parcela else np.nan,
                "FormaPgto": p.forma_pgto,
                "Categoria": nf.tipo_nf or os_obj.categoria,
                "Status": p.status_pagamento,
                "TipoManutencao": os_obj.tipo_manutencao,
                "Sistema": first_item.sistema if first_item else np.nan,
                "Serviço": first_item.servico if first_item else np.nan,
                "Descricao": first_item.descricao if first_item else np.nan,
                "QtdItens": first_item.qtd_itens if first_item else np.nan,
                "KM": float(os_obj.km) if os_obj.km else np.nan,
                "PosiçãoPneu": first_item.posicao_pneu if first_item else np.nan,
                "QtdPneu": first_item.qtd_pneu if first_item else np.nan,
                "EspecificaçãoPneu": first_item.espec_pneu if first_item else np.nan,
                "MarcaPneu": first_item.marca_pneu if first_item else np.nan,
                "ManejoPneu": first_item.manejo_pneu if first_item else np.nan,
                "DataExecução": pd.to_datetime(os_obj.data_execucao or os_obj.data_entrada).strftime("%Y-%m-%d") if (os_obj.data_execucao or os_obj.data_entrada) else np.nan,
                "ResponsavelTec": os_obj.responsavel_tec,
                "Indisponível": 1 if os_obj.indisponivel else 0,
                "ProxKM": float(os_obj.prox_km) if os_obj.prox_km else np.nan,
                "ProxData": pd.to_datetime(os_obj.prox_data).strftime("%Y-%m-%d") if os_obj.prox_data else np.nan,
                "Obsercacoes": os_obj.observacoes,
            })
            next_id += 1

    if new_rows:
        # Corrige case das colunas de acordo com as colunas já existentes no dataframe
        for r in new_rows:
            r_copy = r.copy()
            for k, v in r_copy.items():
                matching_col = next((c for c in df.columns if c.lower() == k.lower()), None)
                if matching_col and matching_col != k:
                    r[matching_col] = r.pop(k)

        df_new = pd.DataFrame(new_rows)
        # Garante que todas as colunas existem
        for col in df.columns:
            if col not in df_new.columns:
                df_new[col] = np.nan
        df_new = df_new[df.columns]
        
        df_final = pd.concat([df, df_new], ignore_index=True)
        
        try:
            with pd.ExcelWriter(file_path, mode="a", engine="openpyxl", if_sheet_exists="replace") as writer:
                df_final.to_excel(writer, sheet_name=sheet_name, index=False)
        except PermissionError:
            raise HTTPException(
                status_code=400,
                detail="Erro ao salvar na planilha Excel: o arquivo Locadora.xlsx está aberto. Por favor, feche-o e tente novamente."
            )
        except Exception as e:
            logger.error(f"Erro ao gravar os dados de OS na planilha: {e}")
