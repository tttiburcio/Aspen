from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from services.os_helpers import (
    generate_numero_os_atomic,
    _resolve_fornecedor_id,
    _validar_nf_duplicada
)
import logging

logger = logging.getLogger("locadora")



router = APIRouter(tags=["Invoices"])

# ── NFs ──────────────────────────────────────────────────────────────

@router.get("/api/db/os/{os_id}/nfs", response_model=list[schemas.NotaFiscalResponse])
def listar_nfs(os_id: int, db: Session = Depends(get_db)):
    os = db.get(models.OrdemServico, os_id)
    if not os:
        raise HTTPException(404, "OS não encontrada")
    return [nf for nf in os.notas_fiscais if nf.deletado_em is None]


@router.post("/api/db/os/{os_id}/nfs", response_model=schemas.NotaFiscalResponse, status_code=201)
def adicionar_nf(os_id: int, payload: schemas.NotaFiscalCreate, db: Session = Depends(get_db)):
    os = db.get(models.OrdemServico, os_id)
    if not os or os.deletado_em is not None:
        raise HTTPException(404, "OS não encontrada")

    _validar_nf_duplicada(db, payload.numero_nf, payload.fornecedor, os_id=os_id)

    # Gera numero_os atomicamente na 1ª NF
    if os.numero_os is None:
        os.numero_os = generate_numero_os_atomic(db)

    # Propaga fornecedor para o cabeçalho da OS
    if payload.fornecedor:
        os.fornecedor = payload.fornecedor
        os.fornecedor_id = _resolve_fornecedor_id(db, payload.fornecedor)

    nf_data = payload.model_dump(exclude={"itens", "parcelas"})
    nf = models.NotaFiscal(os_id=os_id, **nf_data)
    db.add(nf)
    db.flush()

    for it in payload.itens:
        nf_item = models.NfItem(nf_id=nf.id, **it.model_dump())
        db.add(nf_item)

    for p in payload.parcelas:
        parcela = models.ManutencaoParcela(nf_id=nf.id, fornecedor=nf.fornecedor, **p.model_dump())
        db.add(parcela)

    db.commit()
    db.refresh(nf)
    return nf


@router.put("/api/db/os/{os_id}/nfs-sync", response_model=list[schemas.NotaFiscalResponse])
def sync_nfs(os_id: int, payload: list[schemas.NotaFiscalCreate], db: Session = Depends(get_db)):
    """Substitui a lista inteira de Notas Fiscais da OS (sync destrutivo/recreativo)."""
    os_obj = db.get(models.OrdemServico, os_id)
    if not os_obj or os_obj.deletado_em is not None:
        raise HTTPException(404, "OS não encontrada")

    # Permite edição/recriação completa durante a finalização/edição da OS
    # para permitir que o usuário adicione notas fiscais e atualize parcelas.
    for old_nf in list(os_obj.notas_fiscais):
        db.delete(old_nf)
    db.flush()

    if os_obj.numero_os is None and payload:
        os_obj.numero_os = generate_numero_os_atomic(db)

    # Propaga o fornecedor da primeira Nota Fiscal recebida para o cabeçalho da OS
    if payload:
        first_f = payload[0].fornecedor
        if first_f:
            os_obj.fornecedor = first_f
            os_obj.fornecedor_id = _resolve_fornecedor_id(db, first_f)

    nfs_criadas = []
    for nf_data in payload:
        _validar_nf_duplicada(db, nf_data.numero_nf, nf_data.fornecedor, os_id=os_id)
        data = nf_data.model_dump(exclude={"itens", "parcelas"})
        nf = models.NotaFiscal(os_id=os_id, **data)
        db.add(nf)
        db.flush()

        for it in nf_data.itens:
            db.add(models.NfItem(nf_id=nf.id, **it.model_dump()))
        
        for p in nf_data.parcelas:
            db.add(models.ManutencaoParcela(
                nf_id=nf.id, 
                fornecedor=nf.fornecedor, 
                **p.model_dump()
            ))
            
        nfs_criadas.append(nf)

    db.commit()
    for nf in nfs_criadas:
        db.refresh(nf)
    return nfs_criadas


@router.patch("/api/db/nfs/{nf_id}", response_model=schemas.NotaFiscalResponse)
def atualizar_nf(nf_id: int, payload: schemas.NotaFiscalUpdate, db: Session = Depends(get_db)):
    nf = db.get(models.NotaFiscal, nf_id)
    if not nf or nf.deletado_em is not None:
        raise HTTPException(404, "NF não encontrada")

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(nf, field, value)

    _validar_nf_duplicada(db, nf.numero_nf, nf.fornecedor, current_nf_id=nf.id, os_id=nf.os_id)

    db.commit()
    db.refresh(nf)
    return nf


@router.delete("/api/db/nfs/{nf_id}", status_code=204)
def deletar_nf(nf_id: int, db: Session = Depends(get_db)):
    """Soft delete. Bloqueado se houver parcela paga."""
    from datetime import datetime as _dt
    nf = db.get(models.NotaFiscal, nf_id)
    if not nf or nf.deletado_em is not None:
        raise HTTPException(404, "NF não encontrada")
    for p in nf.parcelas:
        if p.deletado_em is None and (p.status_pagamento or "").lower() == "pago":
            raise HTTPException(400, "NF com parcela paga — não pode ser removida")
    nf.deletado_em = _dt.utcnow()
    # Soft delete também nas parcelas ativas
    for p in nf.parcelas:
        if p.deletado_em is None:
            p.deletado_em = _dt.utcnow()
    db.commit()


# ── Itens da NF ──────────────────────────────────────────────────────

@router.post("/api/db/nfs/{nf_id}/itens", response_model=schemas.NfItemResponse, status_code=201)
def adicionar_nf_item(nf_id: int, payload: schemas.NfItemCreate, db: Session = Depends(get_db)):
    nf = db.get(models.NotaFiscal, nf_id)
    if not nf or nf.deletado_em is not None:
        raise HTTPException(404, "NF não encontrada")
    os_item = db.get(models.OsItem, payload.os_item_id)
    if not os_item or os_item.os_id != nf.os_id:
        raise HTTPException(400, "os_item_id não pertence à OS desta NF")
    item = models.NfItem(nf_id=nf_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/api/db/nfs/{nf_id}/itens/{item_id}", response_model=schemas.NfItemResponse)
def atualizar_nf_item(nf_id: int, item_id: int, payload: schemas.NfItemUpdate, db: Session = Depends(get_db)):
    item = db.get(models.NfItem, item_id)
    if not item or item.nf_id != nf_id:
        raise HTTPException(404, "Item de NF não encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/api/db/nfs/{nf_id}/itens/{item_id}", status_code=204)
def deletar_nf_item(nf_id: int, item_id: int, db: Session = Depends(get_db)):
    item = db.get(models.NfItem, item_id)
    if not item or item.nf_id != nf_id:
        raise HTTPException(404, "Item de NF não encontrado")
    db.delete(item)
    db.commit()


# ── Parcelas vinculadas a NF (novo fluxo) ────────────────────────────

@router.post("/api/db/nfs/{nf_id}/parcelas", response_model=schemas.ParcelaResponse, status_code=201)
def adicionar_parcela_nf(nf_id: int, payload: schemas.ParcelaCreate, db: Session = Depends(get_db)):
    nf = db.get(models.NotaFiscal, nf_id)
    if not nf or nf.deletado_em is not None:
        raise HTTPException(404, "NF não encontrada")
    parcela = models.ManutencaoParcela(nf_id=nf_id, **payload.model_dump())
    db.add(parcela)
    db.commit()
    db.refresh(parcela)
    return parcela
