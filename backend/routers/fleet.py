from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db, engine
import models
import schemas

router = APIRouter()

@router.get("/api/db/frota", response_model=list[schemas.FrotaResponse])
def listar_frota_db(db: Session = Depends(get_db)):
    ids_ativos = db.query(models.FatUnitario.id_veiculo).distinct().scalar_subquery()
    return (
        db.query(models.Frota)
        .filter(models.Frota.status.in_(["Frota", "Sublocado"]))
        .filter(models.Frota.id.in_(ids_ativos))
        .order_by(models.Frota.placa)
        .all()
    )


@router.get("/api/db/frota/all", response_model=list[schemas.FrotaResponse])
def listar_frota_all(db: Session = Depends(get_db)):
    """All vehicles without status/contract filters — for CRUD modal selectors."""
    return db.query(models.Frota).order_by(models.Frota.placa).all()


@router.get("/api/db/pneu-specs/{placa}")
def get_pneu_specs(placa: str, db: Session = Depends(get_db)):
    """Retorna specs de pneu para uma placa: por posição (para auto-fill) e
    todas as medidas únicas conhecidas (para sugestões no datalist)."""
    from sqlalchemy import text as _text
    with engine.connect() as _c:
        # Rows COM posição — para auto-fill por posição
        rows_pos = _c.execute(_text("""
            SELECT oi.posicao_pneu, oi.espec_pneu, oi.marca_pneu, oi.modelo_pneu, oi.condicao_pneu,
                   COALESCE(os.data_execucao, os.data_entrada) AS ultima_data
            FROM os_itens oi
            JOIN ordens_servico os ON os.id = oi.os_id
            WHERE UPPER(os.placa) = UPPER(:placa)
              AND oi.posicao_pneu IS NOT NULL AND oi.posicao_pneu != ''
              AND oi.espec_pneu   IS NOT NULL AND oi.espec_pneu   != ''
              AND os.deletado_em  IS NULL
              AND LOWER(oi.sistema) = 'pneu'
              AND LOWER(COALESCE(oi.categoria,'')) = 'compra'
            ORDER BY ultima_data DESC
        """), {"placa": placa}).fetchall()

        # Todas as medidas distintas do veículo (independente de posição)
        rows_specs = _c.execute(_text("""
            SELECT DISTINCT oi.espec_pneu, oi.marca_pneu, oi.modelo_pneu, oi.condicao_pneu,
                   COALESCE(os.data_execucao, os.data_entrada) AS ultima_data
            FROM os_itens oi
            JOIN ordens_servico os ON os.id = oi.os_id
            WHERE UPPER(os.placa) = UPPER(:placa)
              AND oi.espec_pneu IS NOT NULL AND oi.espec_pneu != ''
              AND os.deletado_em IS NULL
              AND LOWER(oi.sistema) = 'pneu'
              AND LOWER(COALESCE(oi.categoria,'')) = 'compra'
            ORDER BY ultima_data DESC
        """), {"placa": placa}).fetchall()

    por_posicao: dict = {}
    for r in rows_pos:
        pos = (r[0] or "").strip().upper()
        if pos and pos not in por_posicao:
            por_posicao[pos] = {
                "espec_pneu":    r[1],
                "marca_pneu":    r[2],
                "modelo_pneu":   r[3],
                "condicao_pneu": r[4],
            }

    seen: set = set()
    specs_unicas: list = []
    for r in rows_specs:
        espec = r[0]
        if espec and espec not in seen:
            seen.add(espec)
            specs_unicas.append({
                "espec_pneu":    espec,
                "marca_pneu":    r[1],
                "modelo_pneu":   r[2],
                "condicao_pneu": r[3],
            })

    return {"por_posicao": por_posicao, "specs_unicas": specs_unicas}


@router.get("/api/manut/pneu-rodizios/{placa}", response_model=list[schemas.PneuRodizioResponse])
def list_rodizios(placa: str, db: Session = Depends(get_db)):
    return db.query(models.PneuRodizio).filter(
        models.PneuRodizio.placa == placa.upper().replace("-", "")
    ).order_by(models.PneuRodizio.data).all()


@router.post("/api/manut/pneu-rodizios", response_model=schemas.PneuRodizioResponse, status_code=201)
def create_rodizio(payload: schemas.PneuRodizioCreate, db: Session = Depends(get_db)):
    obj = models.PneuRodizio(
        placa            = payload.placa.upper().replace("-", ""),
        data             = payload.data,
        km               = payload.km,
        posicao_anterior = payload.posicao_anterior,
        posicao_nova     = payload.posicao_nova,
        espec_pneu       = payload.espec_pneu,
        marca_pneu       = payload.marca_pneu,
        qtd              = payload.qtd,
        os_ref           = payload.os_ref,
        observacao       = payload.observacao,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/api/manut/pneu-rodizios/{rodizio_id}", status_code=204)
def delete_rodizio(rodizio_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.PneuRodizio).get(rodizio_id)
    if not obj:
        raise HTTPException(404, "Rodízio não encontrado")
    db.delete(obj)
    db.commit()
