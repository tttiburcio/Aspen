"""
Router de Empresas.

Expõe GET /api/companies — lista todas as empresas do banco.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from services import regras

router = APIRouter(tags=["Companies"])


@router.get("/api/companies", response_model=list[schemas.EmpresaResponse])
def list_companies(db: Session = Depends(get_db)):
    """Retorna todas as empresas cadastradas."""
    rows = db.query(models.Empresa).order_by(models.Empresa.id).all()

    # Enriquece com a sigla inferida se não estiver preenchida no banco
    result = []
    for emp in rows:
        d = schemas.EmpresaResponse.model_validate(emp)
        if not d.sigla:
            d.sigla = _infer_sigla(emp.nome)
        result.append(d)

    return result


@router.get("/api/enums")
def get_enums():
    """Returns all business-rule enumerations used by the frontend."""
    return {
        "coberturas_seguro":   regras.COBERTURAS_SEGURO,
        "status_apolice":      regras.STATUS_APOLICE,
        "status_rastreamento": regras.STATUS_RASTREAMENTO,
        "orgaos_emissores":    regras.ORGAOS_EMISSORES,
        "status_multa":        regras.STATUS_MULTA,
        "status_contrato":     regras.STATUS_CONTRATO,
        "tipos_reembolso":     regras.TIPOS_REEMBOLSO,
        "status_recebimento":  regras.STATUS_RECEBIMENTO,
    }


def _infer_sigla(nome: str) -> str:
    """Heurística simples: pega as iniciais das palavras relevantes (≤ 3 letras)."""
    stopwords = {"de", "e", "do", "da", "dos", "das", "em", "ltda", "sa", "me"}
    parts = [w for w in nome.upper().split() if w.lower() not in stopwords]
    if len(parts) == 1:
        return parts[0][:6]
    return "".join(p[0] for p in parts[:4])
