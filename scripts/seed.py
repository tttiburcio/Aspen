#!/usr/bin/env python3
"""
Seed script — popula locadora.db com 3 anos (2023-2025) de dados fictícios realistas.

Executar a partir da raiz do projeto:
    pip install faker
    python scripts/seed.py

O banco é criado do zero; execute sempre que precisar reiniciar os dados de demonstração.
"""

import sys
import os
import random
from datetime import date, timedelta
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from faker import Faker
from sqlalchemy.orm import Session

from database import engine, Base
import models

# ── Reprodutibilidade ────────────────────────────────────────────────────────
random.seed(42)
fake = Faker("pt_BR")
Faker.seed(42)

# ── Constantes de negócio ────────────────────────────────────────────────────
ANOS = [2023, 2024, 2025]

EMPRESAS_DATA = [
    {"id": 1, "nome": "TKA Transportes e Logística LTDA", "sigla": "TKA",
     "cnpj_cpf": "12.345.678/0001-99", "municipio": "São Paulo", "estado": "SP"},
    {"id": 2, "nome": "Landtrack Locações e Serviços LTDA", "sigla": "LTK",
     "cnpj_cpf": "98.765.432/0001-11", "municipio": "Campinas", "estado": "SP"},
    {"id": 3, "nome": "Meridian Gerenciamento SA", "sigla": "MRD",
     "cnpj_cpf": "45.678.901/0001-23", "municipio": "Santos", "estado": "SP"},
]

# (marca, modelo, tipagem, implemento, valor_tabela_faixa, valor_impl_faixa, ano_min, ano_max)
VEICULOS_CATALOGO = [
    ("Volvo",          "FH 460 Globetrotter",    "Cavalo Mecânico", "Carreta Baú 14m",        320000, 380000, 250000, 320000, 2019, 2023),
    ("Volvo",          "FH 500 Globetrotter",    "Cavalo Mecânico", "Carreta Graneleira",      360000, 420000, 200000, 280000, 2020, 2023),
    ("Scania",         "R 450 Highline",         "Cavalo Mecânico", "Carreta Frigorífica",     310000, 370000, 300000, 400000, 2019, 2022),
    ("Scania",         "R 500 Highline",         "Cavalo Mecânico", "Carreta Tanque",          350000, 410000, 350000, 500000, 2020, 2023),
    ("Mercedes-Benz",  "Actros 2546",            "Truck",           "Sider 14m",               280000, 340000, 150000, 200000, 2018, 2022),
    ("Mercedes-Benz",  "Atego 2429",             "Toco",            "Baú Fechado 9m",          180000, 220000, 90000,  130000, 2019, 2022),
    ("Ford",           "Cargo 2429E",            "Truck",           "Prancha Extensível",      210000, 260000, 180000, 250000, 2018, 2021),
    ("Volkswagen",     "Constellation 25-390",   "Truck",           "Carreta Baú 14m",         240000, 290000, 250000, 320000, 2019, 2022),
    ("Volkswagen",     "Constellation 19-330",   "Toco",            "Baú Isotérmico",          200000, 245000, 120000, 170000, 2020, 2023),
    ("MAN",            "TGX 28.480",             "Cavalo Mecânico", "Carreta Graneleira",      330000, 390000, 200000, 270000, 2020, 2023),
]

SISTEMAS = ["Motor", "Pneu", "Freio", "Elétrico", "Suspensão", "Cabine", "Hidráulico", "Transmissão", "Embreagem"]

SERVICOS_POR_SISTEMA = {
    "Motor":       ["Troca de óleo e filtros", "Revisão de válvulas", "Reparo de vazamento de óleo",
                    "Substituição de correia dentada", "Limpeza de injetores", "Troca do kit de juntas"],
    "Pneu":        ["Substituição de pneu novo", "Recapagem de pneu", "Calibração e alinhamento",
                    "Balanceamento de rodas", "Troca de câmara"],
    "Freio":       ["Substituição de pastilhas de freio", "Troca de disco de freio", "Ajuste de tambor",
                    "Reparo de cilindro de freio", "Troca de fluido de freio"],
    "Elétrico":    ["Troca de bateria", "Reparo de alternador", "Diagnóstico elétrico geral",
                    "Reparo de chicote elétrico", "Instalação de acessório"],
    "Suspensão":   ["Troca de mola a ar", "Substituição de amortecedor", "Regulagem de eixo",
                    "Troca de bucha de suspensão", "Reparo de barra estabilizadora"],
    "Cabine":      ["Reparo de janela da cabine", "Troca de estofamento", "Reparo de porta",
                    "Pintura parcial de cabine", "Reparo de para-choque"],
    "Hidráulico":  ["Troca de óleo hidráulico", "Reparo de bomba hidráulica", "Substituição de mangueira"],
    "Transmissão": ["Troca de óleo de câmbio", "Reparo de câmbio automático", "Substituição de sincronizador"],
    "Embreagem":   ["Substituição de kit embreagem", "Ajuste de embreagem", "Troca de disco de embreagem"],
}

FORNECEDORES = [
    "Mega Peças Automotivas Ltda",
    "Auto Truck Service ME",
    "Tecno Diesel Manutenção",
    "BR Parts Comércio de Peças",
    "Freitas & Irmãos Oficina",
    "Central Pneus e Serviços",
    "ViaFlex Manutenção Pesada",
    "Maxiparts Distribuidora",
    "Omega Truck Center",
    "Dinâmica Peças e Serviços",
    "Norte Sul Mecânica Pesada",
    "Confiança Auto Center LTDA",
]

TIPOS_REEMBOLSO = [
    "Transporte", "Manutenção", "Multa de Trânsito",
    "Franquia de Seguro", "Encargo de Faturamento", "Outro",
]

POSICOES_PNEU = [
    "DIANTEIRO", "TRAÇÃO - LADO DIREITO", "TRAÇÃO - LADO ESQUERDO",
    "CARRETA - EIX. 1", "CARRETA - EIX. 2",
]
ESPEC_PNEUS  = ["275/80R22.5", "295/80R22.5", "315/80R22.5", "11R22.5", "12R22.5"]
MARCAS_PNEU  = ["Bridgestone", "Michelin", "Goodyear", "Continental", "Pirelli"]

CIDADES_OPERACAO = [
    ("Cubatão", "SP"), ("São Bernardo do Campo", "SP"), ("Guarulhos", "SP"),
    ("Jundiaí", "SP"), ("Piracicaba", "SP"), ("Ribeirão Preto", "SP"),
    ("Belo Horizonte", "MG"), ("Uberlândia", "MG"), ("Curitiba", "PR"),
    ("Joinville", "SC"), ("Goiânia", "GO"),
]

SETORES_CLIENTE = [
    "Indústria Alimentícia", "Construção Civil", "Agronegócio",
    "Comércio Varejista", "Siderurgia", "Química e Petroquímica",
    "Papel e Celulose", "Mineração",
]


# ── Helpers ──────────────────────────────────────────────────────────────────

def rand_date(start: date, end: date) -> date:
    delta = (end - start).days
    if delta <= 0:
        return start
    return start + timedelta(days=random.randint(0, delta))


def rand_dec(lo: float, hi: float) -> Decimal:
    return Decimal(str(round(random.uniform(lo, hi), 2)))


def first_day(year: int, month: int) -> date:
    return date(year, month, 1)


def gerar_placa_mercosul(usadas: set) -> str:
    letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    digitos = "0123456789"
    for _ in range(1000):
        p = (
            random.choice(letras) + random.choice(letras) + random.choice(letras)
            + random.choice(digitos)
            + random.choice(letras)
            + random.choice(digitos) + random.choice(digitos)
        )
        if p not in usadas:
            usadas.add(p)
            return p
    raise RuntimeError("Não foi possível gerar placa única")


# ── Limpeza ──────────────────────────────────────────────────────────────────

def clear_all(db: Session) -> None:
    for model in [
        models.PneuRodizio, models.ManutencaoParcela, models.NfItem,
        models.NotaFiscal, models.OsItem, models.OrdemServico,
        models.Manutencao, models.Reembolso, models.Rastreamento,
        models.Imposto, models.SeguroMensal, models.FaturamentoMensal,
        models.Faturamento, models.FatUnitario, models.ContratoVeiculo,
        models.Contrato, models.Frota, models.Cliente, models.Empresa,
        models.OsCounter,
    ]:
        db.query(model).delete()
    db.commit()
    print("  Tabelas limpas.")


# ── Empresas ─────────────────────────────────────────────────────────────────

def seed_empresas(db: Session) -> list[models.Empresa]:
    objs = []
    for d in EMPRESAS_DATA:
        e = models.Empresa(
            id=d["id"], nome=d["nome"], sigla=d["sigla"],
            cnpj_cpf=d["cnpj_cpf"], municipio=d["municipio"], estado=d["estado"],
        )
        db.add(e)
        objs.append(e)
    db.commit()
    print(f"  {len(objs)} empresas criadas.")
    return objs


# ── Clientes ─────────────────────────────────────────────────────────────────

def seed_clientes(db: Session) -> list[models.Cliente]:
    nomes = [
        "Petroquímica Atlântico SA", "Agromax Distribuição LTDA", "Cerâmica Sul Catarinense",
        "Mineração Planalto Central", "Indústria Têxtil Horizonte", "Siderúrgica do Vale LTDA",
        "Frigorífico Bom Pastor SA", "Comércio Atacadista Maracanã", "Papel & Cia Distribuidora",
        "Construções Araguaia LTDA", "Química Nordeste Industrial", "Grãos do Brasil LTDA",
        "Metalúrgica Central Paulista", "Bebidas Nacionais SA", "Logística Integrada Brasil",
    ]
    estados = ["SP", "MG", "PR", "SC", "GO", "RS", "BA", "ES"]
    objs = []
    for i, nome in enumerate(nomes, start=1):
        c = models.Cliente(
            id=i, nome=nome,
            cnpj_cpf=f"{random.randint(10,99)}.{random.randint(100,999)}.{random.randint(100,999)}/0001-{random.randint(10,99):02d}",
            municipio=fake.city(),
            estado=random.choice(estados),
            status_cliente="Ativo",
        )
        db.add(c)
        objs.append(c)
    db.commit()
    print(f"  {len(objs)} clientes criados.")
    return objs


# ── Contratos ────────────────────────────────────────────────────────────────

def seed_contratos(db: Session, empresas: list, clientes: list) -> list[models.Contrato]:
    objs = []
    cid = 1
    for emp in empresas:
        # 4 contratos por empresa
        clientes_restantes = list(clientes)
        random.shuffle(clientes_restantes)
        for k in range(4):
            cliente = clientes_restantes[k % len(clientes_restantes)]
            cidade, estado = random.choice(CIDADES_OPERACAO)
            inicio = date(random.choice([2021, 2022, 2022, 2023]), random.randint(1, 6), 1)
            fim    = date(inicio.year + random.randint(2, 4), random.randint(6, 12), 28)
            status = "Ativo" if fim >= date(2025, 12, 31) else "Encerrado"
            ct = models.Contrato(
                id=cid, empresa_id=emp.id, cliente_id=cliente.id,
                nome_cliente=cliente.nome,
                cidade_operacao=cidade, estado_operacao=estado,
                data_inicio=inicio, data_fim=fim,
                data_encerramento=fim if status == "Encerrado" else None,
                status_contrato=status,
            )
            db.add(ct)
            objs.append(ct)
            cid += 1
    db.commit()
    print(f"  {len(objs)} contratos criados.")
    return objs


# ── Frota ────────────────────────────────────────────────────────────────────

def seed_frota(db: Session, empresas: list) -> list[models.Frota]:
    objs = []
    placas_usadas: set = set()
    vid = 1

    # Distribuição: 25 TKA, 7 LTK, 3 MRD  →  35 total
    distribuicao = [(empresas[0], 25), (empresas[1], 7), (empresas[2], 3)]

    for emp, qtd in distribuicao:
        status_pool = (
            ["Frota"] * (qtd - 2) + ["Sublocado", "Frota"]
            if qtd > 4 else ["Frota"] * qtd
        )
        random.shuffle(status_pool)
        for i in range(qtd):
            cat = random.choice(VEICULOS_CATALOGO)
            marca, modelo, tipagem, implemento, vt_lo, vt_hi, vi_lo, vi_hi, ano_min, ano_max = cat
            tab_fipe  = rand_dec(vt_lo, vt_hi)
            val_impl  = rand_dec(vi_lo, vi_hi)
            ano_mod   = str(random.randint(ano_min, ano_max))
            status    = status_pool[i] if i < len(status_pool) else "Frota"
            placa     = gerar_placa_mercosul(placas_usadas)
            v = models.Frota(
                id=vid, placa=placa, id_empresa=emp.id,
                marca=marca, modelo=modelo, ano_modelo=ano_mod,
                status=status, tipagem=tipagem, implemento=implemento,
                tabela_fipe=tab_fipe, valor_implemento=val_impl,
                valor_total=Decimal(str(float(tab_fipe) + float(val_impl))),
            )
            db.add(v)
            objs.append(v)
            vid += 1

    db.commit()
    print(f"  {len(objs)} veículos na frota.")
    return objs


# ── Contrato ↔ Veículo ────────────────────────────────────────────────────────

def seed_contrato_veiculo(db: Session, contratos: list, frota: list) -> None:
    veiculos_ativos = [v for v in frota if v.status in ("Frota", "Sublocado")]
    random.shuffle(veiculos_ativos)

    # Cada veículo ativo fica vinculado a 1-2 contratos da mesma empresa ou sublocado
    inseridos = 0
    for v in veiculos_ativos:
        contratos_compat = [c for c in contratos if c.empresa_id == v.id_empresa]
        if not contratos_compat:
            contratos_compat = contratos  # fallback
        qtd = random.randint(1, min(2, len(contratos_compat)))
        for seq, ct in enumerate(random.sample(contratos_compat, qtd), start=1):
            db.add(models.ContratoVeiculo(contrato_id=ct.id, id_veiculo=v.id, sequencia=seq))
            inseridos += 1
    db.commit()
    print(f"  {inseridos} vinculos contrato <-> veiculo criados.")


# ── Faturamento Unitário ──────────────────────────────────────────────────────

def seed_fat_unitario(db: Session, frota: list) -> list[dict]:
    """Gera receita mensal por veículo (2023-01 a 2025-12). Retorna lista de dicts para seed_faturamento."""
    veiculos_ativos = [v for v in frota if v.status in ("Frota", "Sublocado")]
    registros = []
    fat_rows = []

    for ano in ANOS:
        for mes in range(1, 13):
            dia = first_day(ano, mes)
            total_mes = Decimal("0")
            for v in veiculos_ativos:
                # ~12% de chance de o veículo estar parado/sem faturamento no mês
                if random.random() < 0.12:
                    continue
                trabalhado = random.randint(16, 26)
                parado     = random.randint(2, 10)
                medicao    = rand_dec(3_800, 8_500)
                contrato_nome = f"CT-{v.id_empresa:02d}-{random.randint(1,4):03d}"
                registros.append(models.FatUnitario(
                    mes=dia, id_veiculo=v.id, id_empresa=v.id_empresa,
                    contrato=contrato_nome, medicao=medicao,
                    trabalhado=trabalhado, parado=parado,
                ))
                total_mes += medicao
            fat_rows.append({"emissao": dia, "total": total_mes})

    db.bulk_save_objects(registros)
    db.commit()
    print(f"  {len(registros)} registros de faturamento unitário.")
    return fat_rows


# ── Faturamento ───────────────────────────────────────────────────────────────

def seed_faturamento(db: Session, fat_rows: list[dict]) -> None:
    simples = []
    mensais = []
    for row in fat_rows:
        recebimento = rand_dec(float(row["total"]) * 0.92, float(row["total"]) * 1.0)
        venc = row["emissao"] + timedelta(days=30)
        status = random.choices(["Recebido", "Pendente"], weights=[80, 20])[0]
        simples.append(models.Faturamento(
            emissao=row["emissao"],
            valor_locacoes=row["total"],
            valor_recebido=recebimento,
        ))
        mensais.append(models.FaturamentoMensal(
            emissao=row["emissao"],
            vencimento=venc,
            valor_locacoes=row["total"],
            valor_recebido=recebimento if status == "Recebido" else Decimal("0"),
            status_recebimento=status,
            origem="seed",
        ))
    db.bulk_save_objects(simples)
    db.bulk_save_objects(mensais)
    db.commit()
    print(f"  {len(mensais)} faturas mensais criadas (faturamento + faturamento_mensal).")


# ── Seguro Mensal ─────────────────────────────────────────────────────────────

def seed_seguro(db: Session, frota: list) -> None:
    objs = []
    for v in frota:
        for ano in ANOS:
            for mes in range(1, 13):
                valor = rand_dec(950, 2_800)
                dia   = first_day(ano, mes)
                objs.append(models.SeguroMensal(
                    vencimento=dia, id_veiculo=v.id, id_empresa=v.id_empresa, valor=valor,
                ))
    db.bulk_save_objects(objs)
    db.commit()
    print(f"  {len(objs)} registros de seguro mensal.")


# ── Impostos ──────────────────────────────────────────────────────────────────

def seed_impostos(db: Session, frota: list) -> None:
    objs = []
    for v in frota:
        for ano in ANOS:
            valor = rand_dec(2_800, 9_500)
            objs.append(models.Imposto(
                ano_imposto=ano, id_veiculo=v.id, id_empresa=v.id_empresa,
                valor_total_final=valor,
            ))
    db.bulk_save_objects(objs)
    db.commit()
    print(f"  {len(objs)} lançamentos de impostos.")


# ── Rastreamento ──────────────────────────────────────────────────────────────

def seed_rastreamento(db: Session, frota: list) -> None:
    objs = []
    for v in frota:
        for ano in ANOS:
            for mes in range(1, 13):
                valor = rand_dec(85, 165)
                dia   = first_day(ano, mes)
                objs.append(models.Rastreamento(
                    vencimento=dia, id_veiculo=v.id, id_empresa=v.id_empresa, valor=valor,
                ))
    db.bulk_save_objects(objs)
    db.commit()
    print(f"  {len(objs)} registros de rastreamento.")


# ── Ordens de Serviço + Itens + NFs + Parcelas ───────────────────────────────

def seed_os(db: Session, frota: list, empresas: list) -> None:
    """Gera OS hierárquicas: OrdemServico → OsItem → NotaFiscal → NfItem → ManutencaoParcela."""
    veiculos_ativos = [v for v in frota if v.status in ("Frota", "Sublocado")]

    # KM base por veículo: crescente de 2023 a 2025
    km_atual: dict[int, int] = {}
    for v in veiculos_ativos:
        km_atual[v.id] = random.randint(80_000, 160_000)

    os_counters: dict[int, int] = {2023: 0, 2024: 0, 2025: 0}
    os_id = 1
    os_item_id = 1
    nf_id = 1
    nf_item_id = 1
    parcela_id = 1

    os_objs = []
    item_objs = []
    nf_objs = []
    nf_item_objs = []
    parcela_objs = []

    for v in veiculos_ativos:
        for ano in ANOS:
            # 3-6 OS por veículo por ano
            n_os = random.randint(3, 6)
            datas_os = sorted([rand_date(date(ano, 1, 10), date(ano, 12, 20)) for _ in range(n_os)])

            for dt in datas_os:
                # Avanço de KM desde última OS
                km_atual[v.id] += random.randint(5_000, 15_000)
                km_ref = km_atual[v.id]

                sistema = random.choice(SISTEMAS)
                servico = random.choice(SERVICOS_POR_SISTEMA[sistema])
                tipo    = random.choices(["Preventiva", "Corretiva", "Preditiva"], weights=[35, 60, 5])[0]
                categ   = "Compra" if sistema == "Pneu" else random.choices(["Serviço", "Compra"], weights=[70, 30])[0]
                forn    = random.choice(FORNECEDORES)

                os_counters[ano] += 1
                numero_os = f"OS-{ano}-{os_counters[ano]:04d}"

                # Valor da OS: Preventiva mais barata, Corretiva mais cara
                if tipo == "Preventiva":
                    total_os = rand_dec(600, 4_500)
                elif tipo == "Corretiva":
                    total_os = rand_dec(1_200, 18_000)
                else:
                    total_os = rand_dec(800, 6_000)

                prox_km   = km_ref + random.randint(20_000, 50_000)
                prox_data = dt + timedelta(days=random.randint(90, 365))

                os_obj = models.OrdemServico(
                    id=os_id, numero_os=numero_os,
                    status_os="finalizada",
                    id_veiculo=v.id, placa=v.placa, modelo=v.modelo,
                    id_empresa=v.id_empresa, implemento=v.implemento,
                    fornecedor=forn, tipo_manutencao=tipo, categoria=categ,
                    total_os=total_os,
                    km=km_ref, data_entrada=dt - timedelta(days=random.randint(1, 5)),
                    data_execucao=dt, prox_km=prox_km, prox_data=prox_data,
                    indisponivel=random.random() < 0.1,
                )
                os_objs.append(os_obj)

                # OsItem  ──────────────────────────────────────
                posicao_pneu = random.choice(POSICOES_PNEU) if sistema == "Pneu" else None
                qtd_pneu     = random.choice([2, 4]) if sistema == "Pneu" else None
                espec_pneu   = random.choice(ESPEC_PNEUS) if sistema == "Pneu" else None
                marca_pneu   = random.choice(MARCAS_PNEU) if sistema == "Pneu" else None

                item_obj = models.OsItem(
                    id=os_item_id, os_id=os_id,
                    categoria=categ, sistema=sistema, servico=servico,
                    qtd_itens=random.randint(1, 4),
                    posicao_pneu=posicao_pneu, qtd_pneu=qtd_pneu,
                    espec_pneu=espec_pneu, marca_pneu=marca_pneu,
                    condicao_pneu="Novo" if sistema == "Pneu" else None,
                )
                item_objs.append(item_obj)

                # NotaFiscal ────────────────────────────────────
                tipo_nf   = "Produto" if categ == "Compra" else "Servico"
                numero_nf = f"NF-{ano}-{os_counters[ano]:05d}"
                nf_obj = models.NotaFiscal(
                    id=nf_id, os_id=os_id,
                    numero_nf=numero_nf, tipo_nf=tipo_nf,
                    id_empresa=v.id_empresa, fornecedor=forn,
                    valor_total_nf=total_os,
                    data_emissao=dt + timedelta(days=random.randint(0, 3)),
                )
                nf_objs.append(nf_obj)

                # NfItem ────────────────────────────────────────
                nfi_obj = models.NfItem(
                    id=nf_item_id, nf_id=nf_id,
                    os_item_id=os_item_id,
                    quantidade=Decimal("1"),
                    valor_unitario=total_os,
                    valor_total_item=total_os,
                )
                nf_item_objs.append(nfi_obj)

                # ManutencaoParcelas ────────────────────────────
                n_parcelas = random.choices([1, 2, 3], weights=[65, 25, 10])[0]
                valor_parcela = Decimal(str(round(float(total_os) / n_parcelas, 2)))
                for p in range(1, n_parcelas + 1):
                    venc = dt + timedelta(days=30 * p)
                    status_pgto = random.choices(["Pago", "Pendente"], weights=[75, 25])[0]
                    parcela_objs.append(models.ManutencaoParcela(
                        id=parcela_id,
                        nf_id=nf_id,
                        nota=numero_nf, fornecedor=forn,
                        valor_item_total=total_os,
                        data_vencimento=venc,
                        parcela_atual=p, parcela_total=n_parcelas,
                        valor_parcela=valor_parcela,
                        forma_pgto=random.choice(["Boleto", "PIX", "Transferência"]),
                        status_pagamento=status_pgto,
                        prorrogada=False,
                    ))
                    parcela_id += 1

                os_id += 1
                os_item_id += 1
                nf_id += 1
                nf_item_id += 1

    # Salvar em lotes
    db.bulk_save_objects(os_objs)
    db.commit()
    db.bulk_save_objects(item_objs)
    db.commit()
    db.bulk_save_objects(nf_objs)
    db.commit()
    db.bulk_save_objects(nf_item_objs)
    db.commit()
    db.bulk_save_objects(parcela_objs)
    db.commit()

    # os_counters
    for ano, ultimo in os_counters.items():
        db.merge(models.OsCounter(ano=ano, ultimo=ultimo))
    db.commit()

    print(f"  {len(os_objs)} ordens de serviço criadas.")
    print(f"  {len(nf_objs)} notas fiscais criadas.")
    print(f"  {len(parcela_objs)} parcelas criadas.")


# ── Reembolsos ────────────────────────────────────────────────────────────────

def seed_reembolsos(db: Session, frota: list, empresas: list) -> None:
    veiculos = [v for v in frota if v.status in ("Frota", "Sublocado")]
    objs = []
    rid = 1

    for ano in ANOS:
        # ~40 reembolsos por ano
        for _ in range(40):
            tipo  = random.choices(
                TIPOS_REEMBOLSO, weights=[25, 20, 25, 15, 10, 5]
            )[0]
            v     = random.choice(veiculos)
            emp   = next(e for e in empresas if e.id == v.id_empresa)
            emis  = rand_date(date(ano, 1, 5), date(ano, 12, 20))
            venc  = emis + timedelta(days=random.randint(15, 45))
            valor = rand_dec(200, 6_500)
            status = random.choices(["Recebido", "Pendente", "Vencido"], weights=[65, 25, 10])[0]
            recebido = valor if status == "Recebido" else rand_dec(0, float(valor) * 0.5)

            objs.append(models.Reembolso(
                id=rid,
                tipo=tipo,
                id_empresa=emp.id,
                id_veiculo=v.id,
                recibo=f"REC-{ano}-{rid:04d}",
                emissao=emis,
                vencimento=venc,
                empresa=emp.nome,
                valor_reembolso=valor,
                data_entrada=venc + timedelta(days=random.randint(-5, 20)) if status == "Recebido" else None,
                valor_recebido=recebido if status != "Pendente" else None,
                forma_recebimento=random.choice(["PIX", "Transferência", "Boleto"]) if status == "Recebido" else None,
                status_recebimento=status,
                descricao=f"{tipo} referente ao veículo {v.placa} — {fake.sentence(nb_words=6)}",
                categoria=tipo,
            ))
            rid += 1

    db.bulk_save_objects(objs)
    db.commit()
    print(f"  {len(objs)} reembolsos criados.")


# ── Rodízio de Pneus ──────────────────────────────────────────────────────────

def seed_pneu_rodizios(db: Session, frota: list) -> None:
    veiculos = [v for v in frota if v.status in ("Frota", "Sublocado")]
    objs = []

    for v in veiculos:
        km_base = random.randint(80_000, 200_000)
        for ano in ANOS:
            # ~2 rodízios por veículo por ano
            for _ in range(random.randint(1, 3)):
                km_base += random.randint(30_000, 60_000)
                dt = rand_date(date(ano, 1, 15), date(ano, 12, 15))
                pos_ant = random.choice(POSICOES_PNEU[:3])
                pos_nov = random.choice([p for p in POSICOES_PNEU if p != pos_ant])
                objs.append(models.PneuRodizio(
                    placa=v.placa,
                    data=dt, km=km_base,
                    posicao_anterior=pos_ant, posicao_nova=pos_nov,
                    espec_pneu=random.choice(ESPEC_PNEUS),
                    marca_pneu=random.choice(MARCAS_PNEU),
                    qtd=2,
                ))

    db.bulk_save_objects(objs)
    db.commit()
    print(f"  {len(objs)} rodízios de pneu registrados.")


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    print("Criando tabelas (se necessário)...")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        print("Limpando banco...")
        clear_all(db)

        print("Populando empresas...")
        empresas = seed_empresas(db)

        print("Populando clientes...")
        clientes = seed_clientes(db)

        print("Populando contratos...")
        contratos = seed_contratos(db, empresas, clientes)

        print("Populando frota...")
        frota = seed_frota(db, empresas)

        print("Vinculando contratos a veículos...")
        seed_contrato_veiculo(db, contratos, frota)

        print("Populando faturamento unitário...")
        fat_rows = seed_fat_unitario(db, frota)

        print("Populando faturamento mensal...")
        seed_faturamento(db, fat_rows)

        print("Populando seguro mensal...")
        seed_seguro(db, frota)

        print("Populando impostos...")
        seed_impostos(db, frota)

        print("Populando rastreamento...")
        seed_rastreamento(db, frota)

        print("Populando ordens de serviço (OS + itens + NFs + parcelas)...")
        seed_os(db, frota, empresas)

        print("Populando reembolsos...")
        seed_reembolsos(db, frota, empresas)

        print("Populando rodízios de pneu...")
        seed_pneu_rodizios(db, frota)

    print("\nSeed concluído com sucesso!")
    print("Inicie o backend: cd backend && python -m uvicorn main:app --reload --port 8000")


if __name__ == "__main__":
    main()
