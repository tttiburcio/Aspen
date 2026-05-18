"""
Funções de conversão de dados — puras, sem dependências externas além de pandas/numpy.

Extraídas de main.py para reutilização em services/ e routers/.
"""
import pandas as pd
import numpy as np


def _sv_str(v) -> str | None:
    """Converte valor pandas para str, retorna None se nulo/vazio."""
    if v is None:
        return None
    if isinstance(v, float) and (pd.isna(v)):
        return None
    s = str(v).strip()
    return s if s and s.lower() not in ("nan", "none", "nat") else None


def _sv_float(v) -> float | None:
    try:
        f = float(v)
        return None if pd.isna(f) else f
    except Exception:
        return None


def _sv_int(v) -> int | None:
    f = _sv_float(v)
    return int(f) if f is not None else None


def _sv_date(v):
    if v is None:
        return None
    try:
        ts = pd.Timestamp(v)
        return None if pd.isna(ts) else ts.date()
    except Exception:
        return None


def safe(v):
    """Converte valor numérico de forma segura, tratando NaN/Inf."""
    try:
        f = float(v)
        return 0.0 if (np.isnan(f) or np.isinf(f)) else round(f, 2)
    except Exception:
        return 0.0


def _col_like(df: pd.DataFrame, *fragments) -> str | None:
    """Retorna a primeira coluna cujo nome (lower) contém todos os fragmentos."""
    for c in df.columns:
        cl = c.lower()
        if all(f.lower() in cl for f in fragments):
            return c
    return None


def _dedup_manut(manut_raw: pd.DataFrame) -> pd.DataFrame:
    if not manut_raw.empty and "IDOrdServ" in manut_raw.columns:
        com_os = manut_raw.dropna(subset=["IDOrdServ"]).drop_duplicates(subset=["IDOrdServ"])
        sem_os = manut_raw[manut_raw["IDOrdServ"].isna()]
        return pd.concat([com_os, sem_os], ignore_index=True)
    return manut_raw.copy()


def _clean_year(val):
    if pd.isna(val) or val is None:
        return ""
    try:
        f = float(val)
        if f == 0.0:
            return ""
        return str(int(f))
    except Exception:
        pass
    s = str(val).strip()
    if s.lower() in ("nan", "none", "nat", "0", "0.0", "—", ""):
        return ""
    return s


def _clean_implemento(val):
    if pd.isna(val) or val is None:
        return ""
    s = str(val).strip()
    if s.lower() in ("nan", "none", "nat", "0", "0.0", "—", ""):
        return ""
    return s
