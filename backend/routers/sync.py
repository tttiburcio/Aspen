from fastapi import APIRouter, HTTPException
import threading

from services.excel_io import sync_excel_to_db, sync_db_to_excel, sync_reembolsos_from_excel
from services.os_helpers import _enrich_km_from_mapws

router = APIRouter()

# Bloqueia execuções concorrentes do sync completo (Fase 6 implementada)
_sync_lock = threading.Lock()

@router.post("/api/sync")
def run_sync():
    """Executa sincronização bidirecional Excel ↔ SQLite de forma síncrona.

    Retorna contagem de registros importados em cada direção.
    """
    if not _sync_lock.acquire(blocking=False):
        raise HTTPException(409, "A sincronização já está em andamento. Aguarde.")
    try:
        n_excel_to_db = sync_excel_to_db()
        n_db_to_excel = sync_db_to_excel()
        n_reembolsos  = sync_reembolsos_from_excel()
        return {
            "ok":           True,
            "excel_to_db":  n_excel_to_db,
            "db_to_excel":  n_db_to_excel,
            "reembolsos":   n_reembolsos,
        }
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        _sync_lock.release()
