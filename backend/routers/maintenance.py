from fastapi import APIRouter, Query, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from services.compute import _empresa_nome, _contrato_ativo
import logging

logger = logging.getLogger("locadora")

router = APIRouter(tags=["Maintenance"])

# ═══════════════════════════════════════════════════════════════════
#  CRUD — MANUTENÇÕES (banco SQLite)
# ═══════════════════════════════════════════════════════════════════

@router.get("/api/db/manutencoes", response_model=list[schemas.ManutencaoResponse])
def list_manutencoes(
    status: str = Query(None, description="Filtrar por status_manutencao"),
    placa:  str = Query(None, description="Filtrar por placa"),
    empresa: str = Query(None, description="Filtrar por empresa"),
    db: Session = Depends(get_db),
):
    """Lista todas as OS. Filtros opcionais: ?status=em_andamento&placa=ABC1234&empresa=1"""
    q = db.query(models.Manutencao)
    if status:
        q = q.filter(models.Manutencao.status_manutencao == status)
    if placa:
        q = q.filter(models.Manutencao.placa == placa.upper())
    if empresa:
        # aceita sigla ou id inteiro; normaliza para id_empresa
        from sqlalchemy import text as _t
        row = db.execute(_t("SELECT id FROM empresas WHERE UPPER(sigla) = UPPER(:s)"), {"s": empresa}).fetchone()
        if row:
            q = q.filter(models.Manutencao.id_empresa == row[0])
        else:
            q = q.filter(models.Manutencao.id_empresa == None)  # noqa: E711
    return q.order_by(models.Manutencao.criado_em.desc()).all()


@router.get("/api/db/manutencoes/{manutencao_id}", response_model=schemas.ManutencaoResponse)
def get_manutencao(manutencao_id: int, db: Session = Depends(get_db)):
    obj = db.get(models.Manutencao, manutencao_id)
    if not obj:
        raise HTTPException(404, "Manutenção não encontrada")
    return obj


@router.post("/api/db/manutencoes", response_model=schemas.ManutencaoResponse, status_code=201)
def abrir_manutencao(payload: schemas.ManutencaoAbrir, db: Session = Depends(get_db)):
    """Abre uma nova OS (veículo entrou em manutenção)."""
    veiculo = db.get(models.Frota, payload.id_veiculo)
    if not veiculo:
        raise HTTPException(404, f"Veículo {payload.id_veiculo} não encontrado na frota")

    obj = models.Manutencao(**payload.model_dump())
    if not obj.placa:
        obj.placa = veiculo.placa
    if not obj.modelo:
        obj.modelo = veiculo.modelo

    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.patch("/api/db/manutencoes/{manutencao_id}", response_model=schemas.ManutencaoResponse)
def atualizar_manutencao(
    manutencao_id: int,
    payload: schemas.ManutencaoUpdate,
    db: Session = Depends(get_db),
):
    """Atualiza status ou dados gerais de uma OS em andamento."""
    obj = db.get(models.Manutencao, manutencao_id)
    if not obj:
        raise HTTPException(404, "Manutenção não encontrada")
    if obj.status_manutencao == "finalizada":
        raise HTTPException(400, "OS já finalizada — use o endpoint de finalização para editar dados financeiros")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)

    db.commit()
    db.refresh(obj)
    return obj


@router.post("/api/db/manutencoes/{manutencao_id}/finalizar", response_model=schemas.ManutencaoResponse)
def finalizar_manutencao(
    manutencao_id: int,
    payload: schemas.ManutencaoFinalizar,
    db: Session = Depends(get_db),
):
    """Finaliza a OS (ou reedita uma já finalizada): preenche dados financeiros e recria as parcelas."""
    obj = db.get(models.Manutencao, manutencao_id)
    if not obj:
        raise HTTPException(404, "Manutenção não encontrada")

    # Atualiza campos da OS
    for field in ("id_ord_serv", "total_os", "data_execucao", "categoria",
                  "qtd_itens", "prox_km", "prox_data", "km",
                  "posicao_pneu", "qtd_pneu", "espec_pneu", "marca_pneu", "manejo_pneu"):
        val = getattr(payload, field, None)
        if val is not None:
            setattr(obj, field, val)

    obj.status_manutencao = "finalizada"
    obj.indisponivel = False

    # Substitui parcelas (apaga antigas antes de criar novas)
    for parcela_antiga in list(obj.parcelas):
        db.delete(parcela_antiga)
    db.flush()
    for p in payload.parcelas:
        parcela = models.ManutencaoParcela(manutencao_id=obj.id, **p.model_dump())
        db.add(parcela)

    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/api/db/manutencoes/{manutencao_id}", status_code=204)
def deletar_manutencao(manutencao_id: int, db: Session = Depends(get_db)):
    """Remove uma OS."""
    obj = db.get(models.Manutencao, manutencao_id)
    if not obj:
        raise HTTPException(404, "Manutenção não encontrada")
    db.delete(obj)
    db.commit()


# ── Parcelas ─────────────────────────────────────────────────────────

@router.get("/api/db/parcelas", response_model=list[schemas.ParcelaFinanceiroResponse])
def listar_parcelas(year: int = None, empresa: str = None, db: Session = Depends(get_db)):
    """Retorna parcelas de OS finalizadas (novo ou legado), enriquecidas.

    Prioriza caminho autoritativo parcela → nf → os; fallback para legado manutencao.
    """
    from sqlalchemy import extract, func as sf, or_
    from sqlalchemy.orm import joinedload

    q = (
        db.query(models.ManutencaoParcela)
        .options(
            joinedload(models.ManutencaoParcela.nota_fiscal).joinedload(models.NotaFiscal.os).joinedload(models.OrdemServico.itens),
            joinedload(models.ManutencaoParcela.manutencao)
        )
        .filter(models.ManutencaoParcela.deletado_em.is_(None))
    )
    if year:
        # Robust year extraction for SQLite
        q = q.filter(sf.strftime('%Y', sf.coalesce(
            models.ManutencaoParcela.data_prevista_pagamento,
            models.ManutencaoParcela.data_vencimento
        )) == str(year))
    parcelas = q.order_by(models.ManutencaoParcela.data_vencimento.asc()).all()

    result = []
    for p in parcelas:
        # Determina contexto: preferência pelo novo modelo
        os_obj = None
        manut = None
        if p.nf_id:
            nf = p.nota_fiscal
            if nf and nf.deletado_em is None:
                os_obj = nf.os
        if not os_obj and p.manutencao_id:
            manut = p.manutencao
        d = {c.name: getattr(p, c.name) for c in p.__table__.columns}

        if not os_obj and not manut:
            # Parcela órfã (sem NF nem manutencao_id) — inclui só dados da parcela
            d["placa"] = d["modelo"] = d["empresa"] = d["empresa_nome"] = None
            d["id_contrato"] = d["fornecedor_os"] = d["fornecedor"] = None
            d["descricao"] = d["sistema"] = d["id_ord_serv"] = d["nota"] = None
            d["data_execucao"] = d["contrato_nome"] = d["contrato_cidade"] = None
            d["contrato_inicio"] = d["contrato_fim"] = d["contrato_status"] = None
            result.append(d)
            continue
        if os_obj:
            d["placa"]         = os_obj.placa
            d["modelo"]        = os_obj.modelo
            
            emp_val = nf.id_empresa or os_obj.id_empresa
            d["empresa"] = emp_val

            
            d["empresa_nome"]  = _empresa_nome(d["empresa"])
            d["id_contrato"]   = os_obj.id_contrato
            d["fornecedor_os"] = os_obj.fornecedor
            d["fornecedor"]    = getattr(p, "fornecedor", None) or nf.fornecedor or os_obj.fornecedor
            d["descricao"]     = "; ".join(filter(None, (it.servico or it.sistema for it in os_obj.itens))) or None
            d["sistema"]       = "; ".join(sorted(set(filter(None, (it.sistema for it in os_obj.itens))))) or None
            d["id_ord_serv"]   = os_obj.numero_os
            d["nota"]          = nf.numero_nf
            d["data_execucao"] = os_obj.data_execucao
            contrato = _contrato_ativo(os_obj.id_veiculo, os_obj.data_execucao)
        else:
            d["placa"]         = manut.placa
            d["modelo"]        = manut.modelo
            d["empresa"]       = manut.id_empresa
            d["empresa_nome"]  = _empresa_nome(data, manut.id_empresa)
            d["id_contrato"]   = manut.id_contrato
            d["fornecedor_os"] = manut.fornecedor
            d["fornecedor"]    = getattr(p, "fornecedor", None) or manut.fornecedor
            d["descricao"]     = manut.descricao
            d["sistema"]       = manut.sistema
            d["id_ord_serv"]   = manut.id_ord_serv
            d["data_execucao"] = manut.data_execucao
            contrato = _contrato_ativo(manut.id_veiculo, manut.data_execucao)

        d["contrato_nome"]   = contrato["contrato_nome"]   if contrato else None
        d["contrato_cidade"] = contrato["contrato_cidade"] if contrato else None
        d["contrato_inicio"] = contrato["contrato_inicio"] if contrato else None
        d["contrato_fim"]    = contrato["contrato_fim"]    if contrato else None
        d["contrato_status"] = contrato["contrato_status"] if contrato else None

        # ── EXPLOSÃO POR SISTEMA ──────────────────────────────────────
        # Se possuir múltiplos itens, replicamos a parcela prorateada por custo de cada sistema
        if os_obj and getattr(nf, 'itens', None) and len(nf.itens) > 1:
            try:
                total_cost = sum(float(it.valor_total_item or 0) for it in nf.itens)
                if total_cost > 0:
                    # Agrupar por sistema para o caso de haver múltiplos itens do mesmo sistema
                    sys_weights = {}
                    sys_descs   = {}
                    for it in nf.itens:
                        sys_name = (it.os_item.sistema if it.os_item else None) or "Outros"
                        sys_weights[sys_name] = sys_weights.get(sys_name, 0.0) + float(it.valor_total_item or 0)
                        d_txt = (it.os_item.servico or it.os_item.descricao) if it.os_item else None
                        if d_txt:
                            if sys_name not in sys_descs: sys_descs[sys_name] = []
                            sys_descs[sys_name].append(d_txt)

                    for idx, (sys_name, sys_cost) in enumerate(sys_weights.items()):
                        ratio = sys_cost / total_cost
                        sd = d.copy()
                        sd["id"] = f"{p.id}_sis_{idx}" # chave id virtual única
                        sd["sistema"] = sys_name
                        
                        v_parc = float(p.valor_parcela or 0)
                        sd["valor_parcela"] = round(v_parc * ratio, 2)
                        if p.valor_atualizado is not None:
                            v_att = float(p.valor_atualizado)
                            sd["valor_atualizado"] = round(v_att * ratio, 2)
                        
                        if sys_name in sys_descs:
                            sd["descricao"] = "; ".join(filter(None, sorted(set(sys_descs[sys_name]))))
                        
                        result.append(sd)
                    continue # não adiciona o original agregado
            except Exception as e:
                logger.error("Erro na explosão de sistemas na parcela %s: %s", p.id, e)
        
        # Fallback padrão caso só tenha 1 item ou erro
        result.append(d)

    if empresa:
        # Resolve sigla → id e compara como inteiro (d["empresa"] agora é id_empresa inteiro)
        from sqlalchemy import text as _t
        row_e = db.execute(_t("SELECT id FROM empresas WHERE UPPER(sigla) = UPPER(:s)"), {"s": empresa.strip()}).fetchone()
        if row_e:
            emp_id = row_e[0]
            result = [r for r in result if r.get("empresa") == emp_id]
        else:
            result = []
    return result

@router.post("/api/db/manutencoes/{manutencao_id}/parcelas", response_model=schemas.ParcelaResponse, status_code=201)
def adicionar_parcela(
    manutencao_id: int,
    payload: schemas.ParcelaCreate,
    db: Session = Depends(get_db),
):
    obj = db.get(models.Manutencao, manutencao_id)
    if not obj:
        raise HTTPException(404, "Manutenção não encontrada")
    parcela = models.ManutencaoParcela(manutencao_id=manutencao_id, **payload.model_dump())
    db.add(parcela)
    db.commit()
    db.refresh(parcela)
    return parcela


@router.patch("/api/db/parcelas/{parcela_id}", response_model=schemas.ParcelaResponse)
def atualizar_parcela(
    parcela_id: int,
    payload: schemas.ParcelaUpdate,
    db: Session = Depends(get_db),
):
    parcela = db.get(models.ManutencaoParcela, parcela_id)
    if not parcela:
        raise HTTPException(404, "Parcela não encontrada")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(parcela, field, value)
    db.commit()
    db.refresh(parcela)
    return parcela
