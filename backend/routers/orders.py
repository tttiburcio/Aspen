from fastapi import APIRouter, Query, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session, selectinload
from database import get_db
import models, schemas
from services.os_helpers import (
    generate_numero_os_atomic,
    validar_consistencia_os,
    _resolve_fornecedor_id
)
from services.excel_io import _sync_os_to_excel
import logging

logger = logging.getLogger("locadora")

router = APIRouter(tags=["Orders"])

# ── Ordens de Serviço ────────────────────────────────────────────────

@router.get("/api/db/os", response_model=list[schemas.OsResponse])
def list_os(
    status: str = Query(None, description="Filtrar por status_os"),
    placa:  str = Query(None, description="Filtrar por placa"),
    empresa: str = Query(None, description="Filtrar por empresa"),
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.OrdemServico)
        .options(
            selectinload(models.OrdemServico.itens),
            selectinload(models.OrdemServico.notas_fiscais)
            .selectinload(models.NotaFiscal.parcelas),
        )
        .filter(models.OrdemServico.deletado_em.is_(None))
    )
    if status:
        q = q.filter(models.OrdemServico.status_os == status)
    if placa:
        q = q.filter(models.OrdemServico.placa == placa.upper())
    if empresa:
        # Resolve sigla → id_empresa e filtra ao nível da NF
        row_emp = db.execute(
            text("SELECT id FROM empresas WHERE UPPER(sigla) = UPPER(:s)"),
            {"s": empresa.strip()},
        ).fetchone()
        if row_emp:
            emp_id = row_emp[0]
            q = q.filter(
                models.OrdemServico.notas_fiscais.any(
                    (models.NotaFiscal.id_empresa == emp_id) &
                    models.NotaFiscal.deletado_em.is_(None)
                ) |
                (
                    ~models.OrdemServico.notas_fiscais.any(
                        models.NotaFiscal.deletado_em.is_(None)
                    ) &
                    (models.OrdemServico.id_empresa == emp_id)
                )
            )
        else:
            q = q.filter(models.OrdemServico.id == None)  # empresa não encontrada → sem resultado
    return q.order_by(models.OrdemServico.criado_em.desc()).all()


# ── Merge assistido ──────────────────────────────────────────────────

@router.get("/api/db/os/merge-sugestoes", response_model=list[schemas.MergeSugestao])
def merge_sugestoes(db: Session = Depends(get_db)):
    """Sugestões de OS candidatas a merge. Usuário confirma caso-a-caso."""
    from datetime import timedelta
    oss = (
        db.query(models.OrdemServico)
        .filter(models.OrdemServico.deletado_em.is_(None))
        .filter(models.OrdemServico.status_os != "finalizada")
        .all()
    )
    sugestoes = []
    vistos: set[int] = set()

    # Agrupa por id_veiculo + fornecedor + janela de 3 dias
    for i, os_a in enumerate(oss):
        if os_a.id in vistos:
            continue
        grupo = [os_a]
        for os_b in oss[i + 1:]:
            if os_b.id in vistos:
                continue
            if os_b.id_veiculo != os_a.id_veiculo:
                continue
            if (os_a.fornecedor or "") != (os_b.fornecedor or ""):
                continue
            # janela de data_execucao ou data_entrada
            data_a = os_a.data_execucao or os_a.data_entrada
            data_b = os_b.data_execucao or os_b.data_entrada
            if data_a and data_b:
                if abs((data_a - data_b).days) > 3:
                    continue
            grupo.append(os_b)

        if len(grupo) >= 2:
            motivos = ["mesmo veículo", "mesmo fornecedor", "datas próximas (±3 dias)"]
            sugestoes.append(schemas.MergeSugestao(
                os_ids=[o.id for o in grupo],
                placa=os_a.placa,
                fornecedor=os_a.fornecedor,
                id_ord_serv=os_a.numero_os,
                data_execucao=os_a.data_execucao,
                total_itens=sum(len(o.itens) for o in grupo),
                total_nfs=sum(len([nf for nf in o.notas_fiscais if nf.deletado_em is None]) for o in grupo),
                motivos=motivos,
            ))
            for o in grupo:
                vistos.add(o.id)
    return sugestoes


@router.post("/api/db/os/merge", response_model=schemas.OsResponse)
def merge_os(payload: schemas.MergeRequest, db: Session = Depends(get_db)):
    import json
    if payload.os_destino_id not in payload.os_ids:
        raise HTTPException(400, "os_destino_id deve estar em os_ids")

    destino = db.get(models.OrdemServico, payload.os_destino_id)
    if not destino or destino.deletado_em is not None:
        raise HTTPException(404, "OS destino não encontrada")

    origens = [
        db.get(models.OrdemServico, oid)
        for oid in payload.os_ids if oid != payload.os_destino_id
    ]
    for o in origens:
        if not o or o.deletado_em is not None:
            raise HTTPException(404, "Uma das OS origem não encontrada")
        if o.id_veiculo != destino.id_veiculo:
            raise HTTPException(400, "Veículos divergentes entre OS")
        if (o.fornecedor or "") != (destino.fornecedor or ""):
            raise HTTPException(400, "Fornecedores divergentes entre OS")

    # Acumula ids absorvidos
    ids_absorvidos = json.loads(destino.migrado_de_ids or "[]")
    for o in origens:
        ids_absorvidos.extend(json.loads(o.migrado_de_ids or f"[{o.id}]"))
        for item in list(o.itens):
            item.os_id = destino.id
        for nf in list(o.notas_fiscais):
            nf.os_id = destino.id

    destino.migrado_de_ids = json.dumps(sorted(set(ids_absorvidos)))
    db.flush()
    from datetime import datetime as _dt
    for o in origens:
        o.deletado_em = _dt.utcnow()
    db.commit()
    db.refresh(destino)
    return destino


@router.get("/api/db/os/{os_id}", response_model=schemas.OsResponse)
def get_os(os_id: int, db: Session = Depends(get_db)):
    obj = db.get(models.OrdemServico, os_id)
    if not obj or obj.deletado_em is not None:
        raise HTTPException(404, "OS não encontrada")
    return obj


@router.post("/api/db/os", response_model=schemas.OsResponse, status_code=201)
def abrir_os(payload: schemas.OsAbrir, db: Session = Depends(get_db)):
    veiculo = db.get(models.Frota, payload.id_veiculo)
    if not veiculo:
        raise HTTPException(404, f"Veículo {payload.id_veiculo} não encontrado")

    data = payload.model_dump(exclude={"itens"})
    
    # Auto-preenchimento de dados da frota
    if not data.get("modelo"):     data["modelo"]     = veiculo.modelo
    if not data.get("placa"):      data["placa"]      = veiculo.placa
    if not data.get("implemento"): data["implemento"] = veiculo.implemento
    if not data.get("empresa"):    data["empresa"]    = veiculo.empresa

    # Auto-preenchimento de categoria da OS pelo 1º item se vazio
    if not data.get("categoria") and payload.itens:
        first_cat = payload.itens[0].categoria
        if first_cat:
            data["categoria"] = first_cat

    # Resolução de fornecedor_id
    if data.get("fornecedor"):
        data["fornecedor_id"] = _resolve_fornecedor_id(db, data.get("fornecedor"))

    data["numero_os"] = generate_numero_os_atomic(db)
    
    os = models.OrdemServico(**data)
    db.add(os)
    db.flush()

    for it in payload.itens:
        item = models.OsItem(os_id=os.id, **it.model_dump())
        db.add(item)

    db.commit()
    db.refresh(os)
    return os


@router.patch("/api/db/os/{os_id}", response_model=schemas.OsResponse)
def atualizar_os(os_id: int, payload: schemas.OsUpdate, db: Session = Depends(get_db)):
    os = db.get(models.OrdemServico, os_id)
    if not os or os.deletado_em is not None:
        raise HTTPException(404, "OS não encontrada")
    if os.status_os == "finalizada":
        raise HTTPException(400, "OS finalizada — use endpoints financeiros para edição")

    data = payload.model_dump(exclude_unset=True)
    novos_itens = data.pop("itens", None)

    for field, value in data.items():
        setattr(os, field, value)

    # Substituir itens: lógica inteligente para evitar quebra de FK
    if novos_itens is not None:
        item_map = {it.id: it for it in os.itens}
        incoming_ids = {it.get("id") for it in novos_itens if it.get("id") is not None}

        # 1. Update or Add
        for it_data in novos_itens:
            iid = it_data.pop("id", None)
            if iid and iid in item_map:
                target = item_map[iid]
                for k, v in it_data.items():
                    if hasattr(target, k):
                        setattr(target, k, v)
            else:
                db.add(models.OsItem(os_id=os.id, **it_data))

        # 2. Delete missing items (apenas se não houver vínculos impeditivos, ou confia no erro controlado)
        for iid, it in item_map.items():
            if iid not in incoming_ids:
                db.delete(it)

    db.commit()
    db.refresh(os)
    return os


@router.patch("/api/db/os/{os_id}/editar", response_model=schemas.OsResponse)
def editar_os_finalizada(os_id: int, payload: schemas.OsEditarFinalizada, db: Session = Depends(get_db)):
    """Edição de campos de execução e itens de uma OS finalizada."""
    try:
        # Explicitamente carregar as relações para evitar problemas de lazy-loading
        os = db.query(models.OrdemServico).options(
            selectinload(models.OrdemServico.itens),
            selectinload(models.OrdemServico.notas_fiscais)
        ).filter(models.OrdemServico.id == os_id).first()

        if not os or os.deletado_em is not None:
            raise HTTPException(404, "OS não encontrada")

        data = payload.model_dump(exclude_unset=True)
        novos_itens = data.pop("itens", None)

        # Campos permitidos para atualização direta no cabeçalho da OS
        for field, value in data.items():
            if hasattr(os, field):
                setattr(os, field, value)

        if novos_itens is not None:
            item_map = {it.id: it for it in os.itens}
            incoming_ids = {it.get("id") for it in novos_itens if it.get("id") is not None}

            # 1. Update or Add
            for it_data in novos_itens:
                # it_data já é um dict pois veio de payload.model_dump()
                iid = it_data.pop("id", None)
                if iid and iid in item_map:
                    # Update existing item
                    target = item_map[iid]
                    for k, v in it_data.items():
                        if hasattr(target, k):
                            setattr(target, k, v)
                else:
                    # Add new item
                    db.add(models.OsItem(os_id=os.id, **it_data))

            # 2. Delete missing items
            for iid, it in item_map.items():
                if iid not in incoming_ids:
                    # Check if referenced in nf_itens
                    is_referenced = db.query(models.NfItem).filter(models.NfItem.os_item_id == iid).first()
                    if is_referenced:
                        label = it.servico or it.sistema or f"Item #{iid}"
                        raise HTTPException(400, f"O item '{label}' não pode ser excluído porque já está vinculado a uma Nota Fiscal. Remova o vínculo na NF primeiro.")
                    db.delete(it)

        db.commit()
        db.refresh(os)
        return os
    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(400, f"Erro interno ao salvar OS: {str(e)}")


@router.delete("/api/db/os/{os_id}", status_code=204)
def deletar_os(os_id: int, db: Session = Depends(get_db)):
    """Soft delete em cascata para OS, NFs e Parcelas."""
    from datetime import datetime as _dt
    os = db.get(models.OrdemServico, os_id)
    if not os or os.deletado_em is not None:
        raise HTTPException(404, "OS não encontrada")

    agora = _dt.utcnow()
    os.deletado_em = agora

    for nf in os.notas_fiscais:
        if nf.deletado_em is None:
            nf.deletado_em = agora
            for p in nf.parcelas:
                if p.deletado_em is None:
                    p.deletado_em = agora

    db.commit()


@router.get("/api/db/os/{os_id}/validacao", response_model=list[str])
def validar_os(os_id: int, db: Session = Depends(get_db)):
    return validar_consistencia_os(db, os_id)


@router.post("/api/db/os/{os_id}/executar", response_model=schemas.OsResponse)
def executar_os(os_id: int, payload: schemas.OsExecutar, db: Session = Depends(get_db)):
    """Marca OS como executada (aguardando NF)."""
    os = db.get(models.OrdemServico, os_id)
    if not os or os.deletado_em is not None:
        raise HTTPException(404, "OS não encontrada")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(os, field, value)
    os.status_os = "executado_aguardando_nf"
    db.commit()
    db.refresh(os)
    return os


@router.post("/api/db/os/{os_id}/finalizar", response_model=schemas.OsResponse)
def finalizar_os(os_id: int, db: Session = Depends(get_db)):
    """Finaliza OS. Retorna 422 se inconsistência financeira."""
    os = db.get(models.OrdemServico, os_id)
    if not os or os.deletado_em is not None:
        raise HTTPException(404, "OS não encontrada")

    nfs_ativas = [nf for nf in os.notas_fiscais if nf.deletado_em is None]
    if not nfs_ativas:
        raise HTTPException(400, "OS não possui NFs — lance ao menos uma NF antes de finalizar")

    # Computa total_os como soma das NFs
    os.total_os = sum(float(nf.valor_total_nf or 0) for nf in nfs_ativas)

    erros = validar_consistencia_os(db, os_id)
    if erros:
        raise HTTPException(422, {"erros": erros})

    os.status_os = "finalizada"
    os.indisponivel = False
    _sync_os_to_excel(os)
    db.commit()
    db.refresh(os)
    return os


# ── Itens da OS ──────────────────────────────────────────────────────

@router.post("/api/db/os/{os_id}/itens", response_model=schemas.OsItemResponse, status_code=201)
def adicionar_os_item(os_id: int, payload: schemas.OsItemCreate, db: Session = Depends(get_db)):
    os = db.get(models.OrdemServico, os_id)
    if not os or os.deletado_em is not None:
        raise HTTPException(404, "OS não encontrada")
    item = models.OsItem(os_id=os_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/api/db/os/{os_id}/itens/{item_id}", response_model=schemas.OsItemResponse)
def atualizar_os_item(os_id: int, item_id: int, payload: schemas.OsItemUpdate, db: Session = Depends(get_db)):
    item = db.get(models.OsItem, item_id)
    if not item or item.os_id != os_id:
        raise HTTPException(404, "Item não encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/api/db/os/{os_id}/itens/{item_id}", status_code=204)
def deletar_os_item(os_id: int, item_id: int, db: Session = Depends(get_db)):
    item = db.get(models.OsItem, item_id)
    if not item or item.os_id != os_id:
        raise HTTPException(404, "Item não encontrado")
    if item.nf_itens:
        raise HTTPException(400, "Item vinculado a NF — remova o vínculo antes")
    db.delete(item)
    db.commit()


# ── Auditoria / Integridade ──────────────────────────────────────────

@router.get("/api/db/parcelas/integridade", response_model=schemas.IntegridadeResponse)
def integridade_parcelas(db: Session = Depends(get_db)):
    """Retorna parcelas órfãs (sem nf_id) — devem ser zero após migração."""
    total = db.query(models.ManutencaoParcela).count()
    orfas = (
        db.query(models.ManutencaoParcela.id)
        .filter(models.ManutencaoParcela.nf_id.is_(None))
        .filter(models.ManutencaoParcela.deletado_em.is_(None))
        .all()
    )
    return {"orfas": [o[0] for o in orfas], "total": total}
