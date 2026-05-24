from fastapi import APIRouter

router = APIRouter()


@router.post("/api/sync")
def run_sync():
    """Sincronização Excel ↔ SQLite removida — sistema é SQL-only.

    Mantido para compatibilidade com clientes que chamam este endpoint.
    """
    return {"ok": True, "message": "Sistema SQL-only. Sincronização com Excel não é mais necessária."}
