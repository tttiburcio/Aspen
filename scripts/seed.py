#!/usr/bin/env python3
"""
Seed script — popula locadora.db com dados fictícios realistas de 2023-01 a 2026-05.

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
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import engine, Base
import models

# ── Reprodutibilidade ────────────────────────────────────────────────────────
random.seed(42)
fake = Faker("pt_BR")
Faker.seed(42)

# ── Constantes de negócio ────────────────────────────────────────────────────
ANOS      = [2023, 2024, 2025, 2026]
ANO_ATUAL = 2026
MES_ATUAL = 5   # maio 2026 — último mês com dados completos

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

MODELOS_PNEU = {
    "Bridgestone": ["R89", "M709", "L315", "R168"],
    "Michelin":    ["X Multi Z", "X Line Energy", "X Works Z", "X Multi D"],
    "Goodyear":    ["KMAX D", "KMAX S", "OMNIMAX S2A", "G291"],
    "Continental": ["HSD3+", "HSC1", "HSU1", "EcoPlus HT3"],
    "Pirelli":     ["Formula Driver", "TH01", "H01", "ST01"],
}

MANEJO_POR_SERVICO_PNEU = {
    "Substituição de pneu novo": "Substituição",
    "Recapagem de pneu":         "Recapagem",
    "Calibração e alinhamento":  "Calibração",
    "Balanceamento de rodas":    "Balanceamento",
    "Troca de câmara":           "Troca de Câmara",
}

TECNICOS = [
    "Carlos Andrade", "Fábio Mendes", "Roberto Souza", "Leandro Costa",
    "Paulo Ferreira", "Marcos Oliveira", "Tiago Lima", "André Santos",
]

SEGURADORAS = [
    "Porto Seguro", "Bradesco Seguros", "SulAmérica Seguros",
    "Tokio Marine", "Allianz Seguros", "Mapfre Seguros",
]

MODELOS_COBERTURA = [
    "Compreensivo com RCF-DC",
    "RCF-DC Básico",
    "Terceiros + Roubo e Furto",
    "Compreensivo Total",
]

CORRETORES_DATA = [
    {
        "nome": "Marcos Aurélio Corretora de Seguros Ltda",
        "cnpj": "11.222.333/0001-44",
        "susep": "10.024.781/0-91",
        "telefone": "(11) 3456-7890",
        "email": "contato@macorretora.com.br",
    },
    {
        "nome": "Delta Risk Seguros e Consultoria",
        "cnpj": "55.666.777/0001-88",
        "susep": "10.032.456/0-23",
        "telefone": "(11) 2345-6789",
        "email": "contato@deltarisk.com.br",
    },
    {
        "nome": "Fênix Assessoria em Seguros",
        "cnpj": "22.333.444/0001-55",
        "susep": "10.018.992/0-67",
        "telefone": "(19) 3344-5566",
        "email": "contato@fenixseguros.com.br",
    },
]

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


def meses_do_ano(ano: int) -> range:
    """Retorna range de meses válidos para o ano (limita ANO_ATUAL a MES_ATUAL)."""
    return range(1, (MES_ATUAL if ano == ANO_ATUAL else 12) + 1)


def ultimo_dia_ano(ano: int) -> date:
    """Último dia do último mês com dados para o ano."""
    m = MES_ATUAL if ano == ANO_ATUAL else 12
    return date(ano, m, 28)


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
    """
    Gera 4 contratos por empresa: 2 Ativo + 2 Encerrado (garantidos).
    Os campos de forma/assinado são calculados APÓS as datas para não deslocar
    o estado do gerador aleatório nas chamadas subsequentes (frota, OS, etc.).
    """
    objs = []
    cid = 1
    for emp in empresas:
        clientes_restantes = list(clientes)
        random.shuffle(clientes_restantes)
        # ── 2 contratos Ativos ──────────────────────────────────────────
        for k in range(2):
            cliente = clientes_restantes[k % len(clientes_restantes)]
            cidade, estado = random.choice(CIDADES_OPERACAO)
            inicio = date(random.choice([2022, 2022, 2023]), random.randint(1, 6), 1)
            fim    = date(random.choice([2026, 2027]), random.randint(6, 12), 28)
            forma  = random.choices(["PIX", "Boleto"], weights=[60, 40])[0]
            medicoes_total = (fim.year - inicio.year) * 12 + (fim.month - inicio.month) + 1
            ct = models.Contrato(
                id=cid, empresa_id=emp.id, cliente_id=cliente.id,
                nome_cliente=cliente.nome,
                cidade_operacao=cidade, estado_operacao=estado,
                data_inicio=inicio, data_fim=fim,
                data_encerramento=None,
                status_contrato="Ativo",
                forma_pagamento=forma,
                multa_pct=Decimal("2.00") if forma == "Boleto" else None,
                juros_pct=Decimal("1.0000") if forma == "Boleto" else None,
                dias_protesto=random.choice([15, 20, 30]) if forma == "Boleto" else None,
                medicoes_total=medicoes_total,
                assinado=True,
            )
            db.add(ct); objs.append(ct); cid += 1
        # ── 2 contratos Encerrados ──────────────────────────────────────
        for k in range(2):
            cliente = clientes_restantes[(k + 2) % len(clientes_restantes)]
            cidade, estado = random.choice(CIDADES_OPERACAO)
            inicio = date(random.choice([2020, 2021, 2022]), random.randint(1, 6), 1)
            fim    = date(random.choice([2023, 2024]), random.randint(1, 9), 28)
            forma  = random.choices(["PIX", "Boleto"], weights=[60, 40])[0]
            medicoes_total = (fim.year - inicio.year) * 12 + (fim.month - inicio.month) + 1
            ct = models.Contrato(
                id=cid, empresa_id=emp.id, cliente_id=cliente.id,
                nome_cliente=cliente.nome,
                cidade_operacao=cidade, estado_operacao=estado,
                data_inicio=inicio, data_fim=fim,
                data_encerramento=fim,
                status_contrato="Encerrado",
                forma_pagamento=forma,
                multa_pct=Decimal("2.00") if forma == "Boleto" else None,
                juros_pct=Decimal("1.0000") if forma == "Boleto" else None,
                dias_protesto=random.choice([15, 20, 30]) if forma == "Boleto" else None,
                medicoes_total=medicoes_total,
                assinado=True,
            )
            db.add(ct); objs.append(ct); cid += 1
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
            # valor_mensal ≈ 0,8–1,2 % do valor total do veículo, arredondado em R$50
            taxa = random.uniform(0.008, 0.012)
            valor_mensal = Decimal(str(round(float(v.valor_total) * taxa / 50) * 50))
            db.add(models.ContratoVeiculo(
                contrato_id=ct.id, id_veiculo=v.id, sequencia=seq,
                valor_mensal=valor_mensal,
            ))
            inseridos += 1
    db.commit()
    print(f"  {inseridos} vinculos contrato <-> veiculo criados.")


# ── Faturamento Unitário ──────────────────────────────────────────────────────

def seed_fat_unitario(db: Session, frota: list) -> None:
    """Gera receita mensal por veículo (2023-01 a 2026-05)."""
    veiculos_ativos = [v for v in frota if v.status in ("Frota", "Sublocado")]
    registros = []

    for ano in ANOS:
        for mes in meses_do_ano(ano):
            dia = first_day(ano, mes)
            for v in veiculos_ativos:
                # ~12% de chance de o veículo estar parado/sem faturamento no mês
                if random.random() < 0.12:
                    continue
                trabalhado = random.randint(16, 26)
                parado     = random.randint(2, 10)
                medicao    = rand_dec(3_800, 8_500)
                registros.append(models.FatUnitario(
                    mes=dia, id_veiculo=v.id, id_empresa=v.id_empresa,
                    medicao=medicao, trabalhado=trabalhado, parado=parado,
                ))

    db.bulk_save_objects(registros)
    db.commit()
    print(f"  {len(registros)} registros de faturamento unitário.")


# ── Faturamento Mensal ────────────────────────────────────────────────────────

def seed_faturamento(db: Session) -> None:
    """
    Gera uma fatura por contrato × mês.
    Valor = soma da medicao dos veículos do contrato naquele mês via fat_unitario.
    """
    from sqlalchemy import text as _text

    contratos = db.query(models.Contrato).all()
    ct_by_id  = {c.id: c for c in contratos}
    clientes  = {c.id: c for c in db.query(models.Cliente).all()}

    # Veículos por contrato
    cv_rows = db.query(models.ContratoVeiculo).all()
    veics_por_contrato: dict[int, list[int]] = {}
    for cv in cv_rows:
        veics_por_contrato.setdefault(cv.contrato_id, []).append(cv.id_veiculo)

    # Medicao por (id_veiculo, mes) da fat_unitario já inserida
    fat_rows = db.execute(_text(
        "SELECT id_veiculo, mes, medicao FROM fat_unitario"
    )).fetchall()
    medicao_map: dict[tuple, Decimal] = {}
    for row in fat_rows:
        medicao_map[(row[0], str(row[1])[:7])] = Decimal(str(row[2] or 0))

    numero_por_empresa: dict[int, int] = {}
    mensais = []
    for ano in ANOS:
        for mes in meses_do_ano(ano):
            mes_str = f"{ano}-{mes:02d}"
            emissao = date(ano, mes, 1)
            for ct in contratos:
                fim = ct.data_fim or date(2099, 1, 1)
                if not (ct.data_inicio <= emissao <= fim):
                    continue

                vids = veics_por_contrato.get(ct.id, [])
                if not vids:
                    continue

                total = sum(medicao_map.get((vid, mes_str), Decimal("0")) for vid in vids)
                if total == 0:
                    continue

                status = random.choices(["Recebido", "Pendente"], weights=[80, 20])[0]
                recebido = rand_dec(float(total) * 0.93, float(total)) if status == "Recebido" else Decimal("0")
                cliente  = clientes.get(ct.cliente_id)

                aliquota      = Decimal("11.33")
                valor_imposto = (total * aliquota / Decimal("100")).quantize(Decimal("0.01"))
                valor_liquido = total - valor_imposto

                status_imp = random.choices(["Pago", "Pendente"], weights=[75, 25])[0] if status == "Recebido" else "Pendente"
                data_pgto_imp = (emissao + timedelta(days=random.randint(30, 75))) if status_imp == "Pago" else None
                encargo_imp = rand_dec(0, float(valor_imposto) * 0.05) if status_imp == "Pago" and random.random() < 0.1 else Decimal("0")

                num_fat = numero_por_empresa.get(ct.empresa_id, 0) + 1
                numero_por_empresa[ct.empresa_id] = num_fat

                mensais.append(models.FaturamentoMensal(
                    numero_fatura=num_fat,
                    id_empresa=ct.empresa_id,
                    id_contrato=ct.id,
                    id_cliente=ct.cliente_id,
                    emissao=emissao,
                    vencimento=emissao + timedelta(days=30),
                    valor_locacoes=total,
                    valor_recebido=recebido,
                    status_recebimento=status,
                    empresa=cliente.nome if cliente else None,
                    aliquota_imposto=aliquota,
                    valor_imposto=valor_imposto,
                    valor_liquido=valor_liquido,
                    status_imposto=status_imp,
                    data_pgto_imposto=data_pgto_imp,
                    encargo_imposto=encargo_imp if encargo_imp > 0 else None,
                ))

    db.bulk_save_objects(mensais)
    db.commit()
    print(f"  {len(mensais)} faturas mensais (por contrato × mês).")


# ── Corretores ────────────────────────────────────────────────────────────────

def seed_corretores(db: Session) -> list[models.Corretor]:
    objs = []
    for i, d in enumerate(CORRETORES_DATA, start=1):
        objs.append(models.Corretor(id=i, **d))
        db.add(objs[-1])
    db.commit()
    print(f"  {len(objs)} corretores cadastrados.")
    return objs


# ── Apólices de Seguro + SeguroVeiculo ────────────────────────────────────────

def seed_seguros_apolices(
    db: Session,
    empresas: list,
    frota: list,
    corretores: list,
) -> dict:
    """Cria 1 apólice por empresa × ano e os vínculos seguro_veiculo.

    Retorna mapa {(id_empresa, ano): {"apolice_id": int, "valor_mensal": {id_veiculo: Decimal}}}
    para ser consumido por seed_seguro_mensal.
    """
    apolice_map: dict = {}
    apolice_id = 1

    for emp in empresas:
        veiculos_emp = [v for v in frota if v.id_empresa == emp.id]
        # Empresa sem veículos não gera apólice
        if not veiculos_emp:
            continue

        corretor      = random.choice(corretores)
        seguradora    = random.choice(SEGURADORAS)
        cobertura     = random.choice(MODELOS_COBERTURA)
        dia_venc      = random.choice([5, 10, 15, 20])

        for ano in ANOS:
            status = "Vencida" if ano < max(ANOS) else "Ativa"
            apolice = models.Seguro(
                id=apolice_id,
                numero_apolice=f"APL-{emp.sigla}-{ano}-{apolice_id:04d}",
                seguradora=seguradora,
                corretor_id=corretor.id,
                modelo_cobertura=cobertura,
                id_empresa=emp.id,
                data_inicio=date(ano, 1, 1),
                data_fim=date(ano, 12, 31),
                num_parcelas=12,
                dia_vencimento=dia_venc,
                status_apolice=status,
            )
            db.add(apolice)
            db.flush()   # garante apolice.id antes de criar seguro_veiculo

            # Prêmio anual por veículo = 3,5% a 6% do valor FIPE+implemento
            valor_total = Decimal("0")
            valor_mensal_map: dict[int, Decimal] = {}
            for v in veiculos_emp:
                premio_anual  = rand_dec(float(v.valor_total) * 0.035, float(v.valor_total) * 0.060)
                premio_mensal = Decimal(str(round(float(premio_anual) / 12, 2)))
                db.add(models.SeguroVeiculo(
                    apolice_id=apolice.id,
                    id_veiculo=v.id,
                    valor_veiculo=premio_anual,
                ))
                valor_total += premio_anual
                valor_mensal_map[v.id] = premio_mensal

            apolice.valor_total_apolice = valor_total
            apolice_map[(emp.id, ano)] = {
                "apolice_id":   apolice.id,
                "valor_mensal": valor_mensal_map,
                "dia_venc":     dia_venc,
            }
            apolice_id += 1

    db.commit()
    n_apolices  = apolice_id - 1
    n_sv = db.execute(text("SELECT COUNT(*) FROM seguro_veiculo")).scalar()
    print(f"  {n_apolices} apolices criadas, {n_sv} vinculos seguro_veiculo.")
    return apolice_map


# ── Seguro Mensal  (parcelas derivadas das apólices) ──────────────────────────

def seed_seguro_mensal(db: Session, frota: list, apolice_map: dict) -> None:
    """Gera parcelas mensais coerentes com os prêmios definidos nas apólices."""
    objs = []
    for v in frota:
        for ano in ANOS:
            entry = apolice_map.get((v.id_empresa, ano))
            if not entry:
                continue
            apolice_id   = entry["apolice_id"]
            valor_mensal = entry["valor_mensal"].get(v.id)
            dia_venc     = entry["dia_venc"]
            if valor_mensal is None:
                continue
            for mes in meses_do_ano(ano):
                vencimento = date(ano, mes, dia_venc)
                objs.append(models.SeguroMensal(
                    apolice_id=apolice_id,
                    vencimento=vencimento,
                    id_veiculo=v.id,
                    id_empresa=v.id_empresa,
                    valor=valor_mensal,
                ))
    db.bulk_save_objects(objs)
    db.commit()
    print(f"  {len(objs)} parcelas de seguro mensal.")


# ── Constantes de multas de trânsito ──────────────────────────────────────────

INFRACOES_TRANSITO = [
    ("Excesso de velocidade leve (até 20% acima do limite)",       "DETRAN-SP",  195.23),
    ("Excesso de velocidade moderado (20%-50% acima do limite)",   "PRF",        293.47),
    ("Excesso de velocidade grave (acima de 50% do limite)",       "SEMOB",      880.41),
    ("Estacionamento em local proibido",                           "CET-SP",     195.23),
    ("Avanço de sinal vermelho ou amarelo",                        "DETRAN-SP",  293.47),
    ("Uso de celular ao volante",                                  "PRF",        293.47),
    ("Excesso de peso em balança rodoviária",                      "PRF",        550.00),
    ("Condução sem CNH ou com CNH vencida",                        "DETRAN-SP",  880.41),
    ("Farol apagado durante o dia em rodovia",                     "PRF",        130.16),
    ("Ultrapassagem indevida em local proibido",                   "PRF",        880.41),
    ("Ausência de tacógrafo ou tacógrafo adulterado",              "PRF",        1467.35),
    ("Falta de equipamento de segurança obrigatório",              "CETESB",     195.23),
    ("Transporte de carga acima do limite dimensional",            "ANTT",       550.00),
]


# ── Débitos Documentais (IPVA + Licenciamento) ────────────────────────────────

def seed_debitos_documentais(db: Session, frota: list) -> list:
    """Cria um DebitoDocumental por veículo × exercício com IPVA e licenciamento realistas."""

    def _pgto(status: str, venc: date, valor: Decimal):
        """Retorna (data_pgto, encargo, valor_pago) conforme o status."""
        if status == "Pago":
            dias = random.randint(-5, 8)
            dp = venc + timedelta(days=max(dias, -30))
            enc = Decimal(str(round(float(valor) * 0.02, 2))) if dias > 0 else Decimal("0.00")
            return dp, enc, valor + enc
        if status == "Vencido":
            dias = random.randint(6, 75)
            dp = venc + timedelta(days=dias)
            enc = Decimal(str(round(float(valor) * (0.02 + 0.001 * dias), 2)))
            return dp, enc, valor + enc
        return None, None, None

    objs = []
    for v in frota:
        fipe = float(v.tabela_fipe or 180_000)
        placa = v.placa or "AAA0000"
        ult = placa[-1]
        # vencimento SP: dígito da placa determina o mês (1→Jan, 2→Jan, 3→Fev …)
        dig = int(ult) if ult.isdigit() else 0
        mes_venc = (dig % 5) + 1   # 1-5 → Jan-Mai

        for ano in ANOS:
            # IPVA: 1,5% do FIPE para veículos de carga em SP
            valor_ipva   = Decimal(str(round(fipe * 0.015, 2)))
            valor_licenc = rand_dec(220, 480)

            dia = random.choice([15, 20, 28])
            venc_ipva    = date(ano, mes_venc, dia)
            venc_licenc  = date(ano, mes_venc, dia)

            # Status: histórico tem mais "Pago", ano corrente tem mais "Pendente"
            if ano < 2025:
                pesos = [0.75, 0.15, 0.10]
            elif ano == 2025:
                pesos = [0.50, 0.10, 0.40]
            else:  # 2026 — ano em curso, maioria ainda pendente
                pesos = [0.20, 0.05, 0.75]

            st_ipva   = random.choices(["Pago", "Vencido", "Pendente"], pesos)[0]
            st_licenc = random.choices(["Pago", "Vencido", "Pendente"], pesos)[0]

            dp_ipva,   enc_ipva,   val_ipva_pago  = _pgto(st_ipva,   venc_ipva,   valor_ipva)
            dp_licenc, enc_licenc, val_licenc_pago = _pgto(st_licenc, venc_licenc, valor_licenc)

            objs.append(models.DebitoDocumental(
                id_veiculo=v.id,
                id_empresa=v.id_empresa,
                exercicio=ano,
                ano_ref_ipva=ano,
                valor_ipva=valor_ipva,
                vencimento_ipva=venc_ipva,
                status_ipva=st_ipva,
                valor_ipva_pago=val_ipva_pago,
                data_pgto_ipva=dp_ipva,
                encargo_ipva=enc_ipva,
                valor_licenciamento=valor_licenc,
                vencimento_licenciamento=venc_licenc,
                status_licenciamento=st_licenc,
                valor_licenciamento_pago=val_licenc_pago,
                data_pgto_licenciamento=dp_licenc,
                encargo_licenciamento=enc_licenc,
                valor_multas=Decimal("0.00"),
                encargo_multas=Decimal("0.00"),
            ))

    db.bulk_save_objects(objs)
    db.commit()
    print(f"  {len(objs)} débitos documentais (IPVA + licenciamento).")
    return db.query(models.DebitoDocumental).all()


# ── Multas de Trânsito ────────────────────────────────────────────────────────

def _fake_cpf() -> str:
    d = [random.randint(0, 9) for _ in range(9)]
    return (
        f"{''.join(map(str,d[:3]))}."
        f"{''.join(map(str,d[3:6]))}."
        f"{''.join(map(str,d[6:9]))}-"
        f"{random.randint(0,9)}{random.randint(0,9)}"
    )


def _pgto_multa(status: str, venc: date, valor: Decimal, desconto_pct: float = 20.0):
    """
    Retorna (data_pagamento, encargo, valor_pago, aplicou_desconto) conforme o status.

    Regra:
      - Pago até data_vencimento  → desconto de desconto_pct% aplicado; sem encargo
      - Pago após data_vencimento → valor nominal + mora de 20% + 0,1%/dia; sem desconto
      - Vencido                   → em atraso, ainda não pago; sem dados de pagamento
    """
    if status == "Pago":
        # 65% chance de pagar antes do vencimento (com desconto)
        if random.random() < 0.65:
            dias = random.randint(-20, 0)
            dp   = venc + timedelta(days=dias)
            val_pago = Decimal(str(round(float(valor) * (1 - desconto_pct / 100), 2)))
            return dp, Decimal("0.00"), val_pago, True
        else:
            dias = random.randint(1, 30)
            dp   = venc + timedelta(days=dias)
            enc  = Decimal(str(round(float(valor) * (0.20 + 0.001 * dias), 2)))
            return dp, enc, valor + enc, False
    if status == "Vencido":
        # Vencido = em atraso, ainda não pago; para o seed registramos o pagamento tardio
        dias = random.randint(6, 90)
        dp   = venc + timedelta(days=dias)
        enc  = Decimal(str(round(float(valor) * (0.20 + 0.001 * dias), 2)))
        return dp, enc, valor + enc, False
    return None, Decimal("0.00"), None, None


def seed_multas(db: Session, frota: list, debitos: list) -> None:
    """
    Gera multas de trânsito para ~40% dos veículos por ano.

    Fluxo por infração:
      1. Notificação: data_infracao + data_emissao_notificacao + data_limite_indicacao
      2. Indicação: 70% indicam o condutor; 30% não indicam
      3. Multa emitida com tipo_multa='Infração'
      4. Se NÃO indicado: gera multa adicional tipo_multa='Não Indicação de Condutor'
         com valor = 2× original e multa_origem_id = original.id
    """
    dd_map = {(d.id_veiculo, d.exercicio): d for d in debitos}

    # Mapa: id_veiculo → lista de Contratos com cliente_id
    cv_rows  = db.query(models.ContratoVeiculo).all()
    ct_by_id = {c.id: c for c in db.query(models.Contrato).all()}
    contrato_map: dict[int, list] = {}
    for cv in cv_rows:
        ct = ct_by_id.get(cv.contrato_id)
        if ct:
            contrato_map.setdefault(cv.id_veiculo, []).append(ct)

    def _contrato_em(vid: int, dt: date):
        for ct in contrato_map.get(vid, []):
            fim = ct.data_fim or date(2099, 1, 1)
            if ct.data_inicio <= dt <= fim:
                return ct
        lista = contrato_map.get(vid, [])
        return lista[0] if lista else None

    totais: dict[int, tuple[Decimal, Decimal]] = {}  # dd_id → (val_multas, enc_multas)
    total_inseridas = 0

    for v in frota:
        for ano in ANOS:
            if random.random() > 0.40:
                continue

            n_inf = random.randint(1, 3)
            dd    = dd_map.get((v.id, ano))
            val_acum = Decimal("0.00")
            enc_acum = Decimal("0.00")

            for _ in range(n_inf):
                desc, orgao, base = random.choice(INFRACOES_TRANSITO)
                val_base = Decimal(str(round(base * random.uniform(0.97, 1.03), 2)))

                # ── Fase 1 — Notificação ─────────────────────────────────
                max_mes_inf = MES_ATUAL if ano == ANO_ATUAL else 12
                data_inf  = date(ano, random.randint(1, max_mes_inf), random.randint(1, 28))
                data_notif = data_inf + timedelta(days=random.randint(15, 30))
                data_limite = data_notif + timedelta(days=30)

                ct = _contrato_em(v.id, data_inf)
                id_contrato = ct.id           if ct else None
                id_cliente  = ct.cliente_id   if ct else None

                # ── Fase 2 — Indicação do condutor ───────────────────────
                if ano < 2025:
                    indicado = random.random() < 0.70
                elif ano == 2025:
                    indicado = random.random() < 0.60
                else:  # 2026
                    indicado = random.random() < 0.55

                nome_condutor = cpf_condutor = data_indicacao = None
                if indicado:
                    nome_condutor  = fake.name()
                    cpf_condutor   = _fake_cpf()
                    data_indicacao = data_limite - timedelta(days=random.randint(1, 10))

                # ── Fase 3 — Multa emitida ───────────────────────────────
                data_emissao = data_limite + timedelta(days=random.randint(5, 20))
                data_venc    = data_emissao + timedelta(days=30)

                if ano == ANO_ATUAL:  # 2026 — ano em curso
                    pesos_st = [0.08, 0.06, 0.04, 0.02, 0.80]
                else:  # anos históricos — todos quitados
                    pesos_st = [1.00, 0.00, 0.00, 0.00, 0.00]
                status = random.choices(
                    ["Pago", "Vencido", "Recorrido", "Cancelado", "Pendente"], pesos_st
                )[0]

                desc_pct   = Decimal("20.00")
                val_desc   = Decimal(str(round(float(val_base) * 0.80, 2)))
                dp, enc, val_pago, aplicou = _pgto_multa(status, data_venc, val_base)

                original = models.Multa(
                    id_veiculo=v.id,
                    id_empresa=v.id_empresa,
                    id_contrato=id_contrato,
                    id_cliente=id_cliente,
                    debito_documental_id=dd.id if dd else None,
                    ait=f"AT-{ano}-{fake.numerify('########')}",
                    orgao_emissor=orgao,
                    data_infracao=data_inf,
                    data_emissao_notificacao=data_notif,
                    motivo_infracao=desc,
                    data_limite_indicacao=data_limite,
                    condutor_indicado=indicado,
                    nome_condutor=nome_condutor,
                    cpf_condutor=cpf_condutor,
                    data_indicacao=data_indicacao,
                    tipo_multa="Infração",
                    data_emissao_multa=data_emissao,
                    data_vencimento=data_venc,
                    valor_multa=val_base,
                    desconto_pct=desc_pct,
                    valor_com_desconto=val_desc,
                    exercicio=ano,
                    multa_origem_id=None,
                    status_multa=status,
                    aplicou_desconto=aplicou,
                    data_pagamento=dp,
                    valor_pago=val_pago,
                    encargo=enc if enc else None,
                )
                db.add(original)
                db.flush()   # garante original.id antes do NIC
                total_inseridas += 1

                if status not in ("Cancelado", "Pago"):
                    val_acum += val_base
                    enc_acum += enc if enc else Decimal("0.00")

                # ── NIC: multa por não indicação de condutor ─────────────
                if not indicado:
                    val_nic       = val_base * 2   # dobro da original (CTB Art. 257 §8)
                    val_desc_nic  = Decimal(str(round(float(val_nic) * 0.80, 2)))
                    data_venc_nic = data_venc + timedelta(days=random.randint(5, 15))

                    # NIC usa mesmos pesos do ano (histórico = sempre Pago)
                    st_nic = random.choices(
                        ["Pago", "Vencido", "Recorrido", "Cancelado", "Pendente"],
                        pesos_st,
                    )[0]
                    dp_nic, enc_nic, val_pago_nic, aplicou_nic = _pgto_multa(st_nic, data_venc_nic, val_nic)

                    nic = models.Multa(
                        id_veiculo=v.id,
                        id_empresa=v.id_empresa,
                        id_contrato=id_contrato,
                        id_cliente=id_cliente,
                        debito_documental_id=dd.id if dd else None,
                        ait=f"NIC-{original.ait}",
                        orgao_emissor=orgao,
                        data_infracao=data_inf,
                        data_emissao_notificacao=data_notif,
                        motivo_infracao="Não indicação de condutor responsável (CTB Art. 257 §8)",
                        data_limite_indicacao=data_limite,
                        condutor_indicado=False,
                        nome_condutor=None,
                        cpf_condutor=None,
                        data_indicacao=None,
                        tipo_multa="Não Indicação de Condutor",
                        data_emissao_multa=data_emissao + timedelta(days=random.randint(3, 10)),
                        data_vencimento=data_venc_nic,
                        valor_multa=val_nic,
                        desconto_pct=Decimal("20.00"),
                        valor_com_desconto=val_desc_nic,
                        exercicio=ano,
                        multa_origem_id=original.id,
                        status_multa=st_nic,
                        aplicou_desconto=aplicou_nic,
                        data_pagamento=dp_nic,
                        valor_pago=val_pago_nic,
                        encargo=enc_nic if enc_nic else None,
                    )
                    db.add(nic)
                    total_inseridas += 1

                    if st_nic not in ("Cancelado", "Pago"):
                        val_acum += val_nic
                        enc_acum += enc_nic if enc_nic else Decimal("0.00")

            if dd and val_acum > 0:
                totais[dd.id] = (
                    totais.get(dd.id, (Decimal("0.00"), Decimal("0.00")))[0] + val_acum,
                    totais.get(dd.id, (Decimal("0.00"), Decimal("0.00")))[1] + enc_acum,
                )

    db.commit()

    # Atualiza agregado valor_multas / encargo_multas nos débitos documentais
    if totais:
        for dd_id, (val, enc) in totais.items():
            db.execute(
                text(
                    "UPDATE debitos_documentais "
                    "SET valor_multas = :v, encargo_multas = :e "
                    "WHERE id = :id"
                ),
                {"v": float(val), "e": float(enc), "id": dd_id},
            )
        db.commit()

    print(f"  {total_inseridas} multas de trânsito (infrações + NICs).")


# ── Rastreamento ──────────────────────────────────────────────────────────────

def seed_rastreamento(db: Session, frota: list) -> None:
    objs = []
    for v in frota:
        for ano in ANOS:
            for mes in meses_do_ano(ano):
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

    # Mapa veículo → lista de contratos (para preencher id_contrato na OS)
    from models import ContratoVeiculo, Contrato
    cv_rows = db.query(ContratoVeiculo).all()
    contrato_map: dict[int, list] = {}  # vid → [Contrato]
    ct_by_id = {c.id: c for c in db.query(Contrato).all()}
    for cv in cv_rows:
        contrato_map.setdefault(cv.id_veiculo, []).append(ct_by_id[cv.contrato_id])

    def _contrato_para_data(vid: int, dt: date):
        for ct in contrato_map.get(vid, []):
            if ct.data_inicio <= dt <= (ct.data_fim or date(2099, 1, 1)):
                return str(ct.id)
        contratos = contrato_map.get(vid, [])
        return str(contratos[0].id) if contratos else None

    # KM base por veículo: crescente de 2023 a 2025
    km_atual: dict[int, int] = {}
    for v in veiculos_ativos:
        km_atual[v.id] = random.randint(80_000, 160_000)

    os_counters: dict[int, int] = {2023: 0, 2024: 0, 2025: 0, 2026: 0}
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
            # 3-6 OS por veículo por ano (proporcional em 2026)
            n_os = random.randint(1, 3) if ano == ANO_ATUAL else random.randint(3, 6)
            fim_os = ultimo_dia_ano(ano)
            datas_os = sorted([rand_date(date(ano, 1, 10), fim_os) for _ in range(n_os)])

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

                tecnico = random.choice(TECNICOS)

                os_obj = models.OrdemServico(
                    id=os_id, numero_os=numero_os,
                    status_os="finalizada",
                    status_execucao="Executado",
                    id_veiculo=v.id, placa=v.placa, modelo=v.modelo,
                    id_empresa=v.id_empresa, implemento=v.implemento,
                    id_contrato=_contrato_para_data(v.id, dt),
                    fornecedor=forn, tipo_manutencao=tipo, categoria=categ,
                    total_os=total_os, responsavel_tec=tecnico,
                    km=km_ref, data_entrada=dt - timedelta(days=random.randint(1, 5)),
                    data_execucao=dt, prox_km=prox_km, prox_data=prox_data,
                    indisponivel=random.random() < 0.1,
                )
                os_objs.append(os_obj)

                # OsItem  ──────────────────────────────────────
                is_pneu      = sistema == "Pneu"
                posicao_pneu = random.choice(POSICOES_PNEU) if is_pneu else None
                qtd_pneu     = random.choice([2, 4])        if is_pneu else None
                espec_pneu   = random.choice(ESPEC_PNEUS)   if is_pneu else None
                marca_pneu   = random.choice(MARCAS_PNEU)   if is_pneu else None
                modelo_pneu  = random.choice(MODELOS_PNEU[marca_pneu]) if is_pneu else None
                manejo_pneu  = MANEJO_POR_SERVICO_PNEU.get(servico, "Substituição") if is_pneu else None

                item_obj = models.OsItem(
                    id=os_item_id, os_id=os_id,
                    categoria=categ, sistema=sistema, servico=servico,
                    qtd_itens=random.randint(1, 4),
                    posicao_pneu=posicao_pneu, qtd_pneu=qtd_pneu,
                    espec_pneu=espec_pneu, marca_pneu=marca_pneu,
                    modelo_pneu=modelo_pneu, manejo_pneu=manejo_pneu,
                    condicao_pneu="Novo" if is_pneu else None,
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
                        tipo_custo=categ,
                        data_vencimento=venc,
                        data_vencimento_original=venc,
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

    # ── Lookups de suporte ────────────────────────────────────────────
    from models import ContratoVeiculo, Contrato, OrdemServico as OS
    cv_rows  = db.query(ContratoVeiculo).all()
    ct_by_id = {c.id: c for c in db.query(Contrato).all()}
    contrato_map: dict[int, list] = {}          # vid → [Contrato]
    for cv in cv_rows:
        contrato_map.setdefault(cv.id_veiculo, []).append(ct_by_id[cv.contrato_id])

    # vid → [numero_os] de OS finalizadas — para reembolsos de Manutenção
    os_por_veiculo: dict[int, list[str]] = {}
    for os_obj in db.query(OS.id_veiculo, OS.numero_os).filter(OS.status_os == "finalizada").all():
        if os_obj.numero_os:
            os_por_veiculo.setdefault(os_obj.id_veiculo, []).append(os_obj.numero_os)

    def _contrato_ativo_reimb(vid: int, dt: date):
        """Retorna o contrato ativo para o veículo na data, ou o primeiro disponível."""
        for ct in contrato_map.get(vid, []):
            if ct.data_inicio <= dt <= (ct.data_fim or date(2099, 1, 1)):
                return ct
        lista = contrato_map.get(vid, [])
        return lista[0] if lista else None

    objs = []
    rid = 1

    for ano in ANOS:
        n_reimb = 20 if ano == ANO_ATUAL else 40
        for _ in range(n_reimb):
            tipo   = random.choices(TIPOS_REEMBOLSO, weights=[25, 20, 25, 15, 10, 5])[0]
            v      = random.choice(veiculos)
            emp    = next(e for e in empresas if e.id == v.id_empresa)
            emis   = rand_date(date(ano, 1, 5), ultimo_dia_ano(ano))
            venc   = emis + timedelta(days=random.randint(15, 45))
            valor  = rand_dec(200, 6_500)
            status = random.choices(["Recebido", "Pendente", "Vencido"], weights=[65, 25, 10])[0]
            recebido = valor if status == "Recebido" else rand_dec(0, float(valor) * 0.5)

            # ── Vínculos contextuais por tipo ─────────────────────────
            ct = _contrato_ativo_reimb(v.id, emis)
            id_contrato = ct.id        if ct else None
            id_cliente  = ct.cliente_id if ct else None

            numero_os  = None
            fatura_mes = None
            if tipo in ("Manutenção", "Franquia de Seguro"):
                os_list = os_por_veiculo.get(v.id, [])
                numero_os = random.choice(os_list) if os_list else None
            elif tipo == "Encargo de Faturamento":
                fatura_mes = emis.strftime("%Y-%m")

            objs.append(models.Reembolso(
                id=rid,
                tipo=tipo,
                id_empresa=emp.id,
                id_contrato=id_contrato,
                id_cliente=id_cliente,
                id_veiculo=v.id,
                recibo=f"REC-{ano}-{rid:04d}",
                emissao=emis,
                vencimento=venc,
                empresa=emp.nome,
                numero_os=numero_os,
                id_ord_serv=numero_os,   # alias legado — mesmo valor
                fatura_mes=fatura_mes,
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

    # Mapa placa → [(data_execucao_str, numero_os)] — prioridade: OS de Pneu; fallback: qualquer OS
    pneu_os_map: dict[str, list] = {}   # apenas Pneu
    all_os_map:  dict[str, list] = {}   # todas as OS (fallback)
    rows = db.execute(text("""
        SELECT f.placa, os.data_execucao, os.numero_os,
               MAX(CASE WHEN oi.sistema = 'Pneu' THEN 1 ELSE 0 END) AS tem_pneu
        FROM ordens_servico os
        JOIN os_itens oi ON oi.os_id = os.id
        JOIN frota f ON f.id = os.id_veiculo
        WHERE os.numero_os IS NOT NULL
        GROUP BY os.id
        ORDER BY os.data_execucao
    """)).fetchall()
    for placa, dt_exec, num_os, tem_pneu in rows:
        entry = (str(dt_exec), num_os)
        all_os_map.setdefault(placa, []).append(entry)
        if tem_pneu:
            pneu_os_map.setdefault(placa, []).append(entry)

    def _os_ref_pneu(placa: str, dt: date) -> str | None:
        """Retorna o numero_os da OS de Pneu mais recente antes de dt.
        Fallback para qualquer OS do veículo se nunca houve OS de Pneu."""
        dt_str = dt.isoformat()
        fonte  = pneu_os_map.get(placa) or all_os_map.get(placa) or []
        antes  = [(d, n) for d, n in fonte if d <= dt_str]
        return antes[-1][1] if antes else (fonte[-1][1] if fonte else None)

    objs = []

    for v in veiculos:
        km_base = random.randint(80_000, 200_000)
        for ano in ANOS:
            n_rod = random.randint(1, 2) if ano == ANO_ATUAL else random.randint(1, 3)
            for _ in range(n_rod):
                km_base += random.randint(30_000, 60_000)
                fim_rod = date(ano, MES_ATUAL, 15) if ano == ANO_ATUAL else date(ano, 12, 15)
                dt = rand_date(date(ano, 1, 15), fim_rod)
                pos_ant = random.choice(POSICOES_PNEU[:3])
                pos_nov = random.choice([p for p in POSICOES_PNEU if p != pos_ant])
                marca   = random.choice(MARCAS_PNEU)
                objs.append(models.PneuRodizio(
                    placa=v.placa,
                    data=dt, km=km_base,
                    posicao_anterior=pos_ant, posicao_nova=pos_nov,
                    espec_pneu=random.choice(ESPEC_PNEUS),
                    marca_pneu=marca,
                    qtd=2,
                    os_ref=_os_ref_pneu(v.placa, dt),
                ))

    db.bulk_save_objects(objs)
    db.commit()
    print(f"  {len(objs)} rodizios de pneu registrados.")


# ── Manutencoes (tabela legada — espelho flat das OS) ─────────────────────────

def seed_manutencoes(db: Session, frota: list) -> None:
    """Popula a tabela manutencoes como visão desnormalizada das ordens_servico.

    A tabela manutencoes é o modelo legado (um registro por OS, tudo flat).
    O modelo novo e hierárquico é ordens_servico + os_itens + notas_fiscais.
    Ambas coexistem: o dashboard usa ordens_servico; o CRUD legado usa manutencoes.
    """
    frota_map = {v.id: v for v in frota}
    os_list = db.query(models.OrdemServico).filter(
        models.OrdemServico.deletado_em.is_(None)
    ).all()

    objs = []
    for os_obj in os_list:
        v = frota_map.get(os_obj.id_veiculo)
        # Pega o primeiro OsItem para sistema/servico/pneu
        item = os_obj.itens[0] if os_obj.itens else None
        objs.append(models.Manutencao(
            status_manutencao="finalizada",
            id_veiculo=os_obj.id_veiculo,
            placa=os_obj.placa,
            modelo=os_obj.modelo,
            id_empresa=os_obj.id_empresa,
            id_contrato=os_obj.id_contrato,
            implemento=os_obj.implemento,
            id_ord_serv=os_obj.numero_os,
            total_os=os_obj.total_os,
            categoria=os_obj.categoria,
            fornecedor=os_obj.fornecedor,
            tipo_manutencao=os_obj.tipo_manutencao,
            sistema=item.sistema if item else None,
            servico=item.servico if item else None,
            qtd_itens=item.qtd_itens if item else 1,
            posicao_pneu=item.posicao_pneu if item else None,
            qtd_pneu=item.qtd_pneu if item else None,
            espec_pneu=item.espec_pneu if item else None,
            marca_pneu=item.marca_pneu if item else None,
            manejo_pneu=item.manejo_pneu if item else None,
            km=os_obj.km,
            data_entrada=os_obj.data_entrada,
            data_execucao=os_obj.data_execucao,
            prox_km=os_obj.prox_km,
            prox_data=os_obj.prox_data,
            indisponivel=os_obj.indisponivel or False,
            responsavel_tec=os_obj.responsavel_tec,
        ))

    db.bulk_save_objects(objs)
    db.commit()

    # Preenche manutencao_id nas parcelas existentes via join OS → NF → parcela
    db.execute(text("""
        UPDATE manutencao_parcelas
        SET manutencao_id = (
            SELECT m.id
            FROM manutencoes m
            JOIN ordens_servico os ON os.numero_os = m.id_ord_serv
            JOIN notas_fiscais nf  ON nf.os_id = os.id
            WHERE nf.id = manutencao_parcelas.nf_id
            LIMIT 1
        )
        WHERE nf_id IS NOT NULL
    """))
    db.commit()
    print(f"  {len(objs)} registros na tabela manutencoes (espelho flat das OS).")
    atualizadas = db.execute(text(
        "SELECT COUNT(*) FROM manutencao_parcelas WHERE manutencao_id IS NOT NULL"
    )).scalar()
    print(f"  {atualizadas} parcelas com manutencao_id preenchido.")


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    print("Recriando schema (drop + create all)...")
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        print("Populando empresas...")
        empresas = seed_empresas(db)

        print("Populando clientes...")
        clientes = seed_clientes(db)

        print("Populando contratos...")
        contratos = seed_contratos(db, empresas, clientes)

        print("Populando frota...")
        frota = seed_frota(db, empresas)

        print("Vinculando contratos a veiculos...")
        seed_contrato_veiculo(db, contratos, frota)

        print("Populando faturamento unitario...")
        seed_fat_unitario(db, frota)

        print("Populando faturamento mensal (por contrato × mês)...")
        seed_faturamento(db)

        print("Populando corretores...")
        corretores = seed_corretores(db)

        print("Populando apolices de seguro...")
        apolice_map = seed_seguros_apolices(db, empresas, frota, corretores)

        print("Populando seguro mensal...")
        seed_seguro_mensal(db, frota, apolice_map)

        print("Populando debitos documentais (IPVA + licenciamento)...")
        debitos = seed_debitos_documentais(db, frota)

        print("Populando multas de transito...")
        seed_multas(db, frota, debitos)

        print("Populando rastreamento...")
        seed_rastreamento(db, frota)

        print("Populando ordens de servico (OS + itens + NFs + parcelas)...")
        seed_os(db, frota, empresas)

        print("Populando manutencoes (tabela legada)...")
        seed_manutencoes(db, frota)

        print("Populando reembolsos...")
        seed_reembolsos(db, frota, empresas)

        print("Populando rodizios de pneu...")
        seed_pneu_rodizios(db, frota)

    print("\nSeed concluido com sucesso!")
    print("Inicie o backend: cd backend && python -m uvicorn main:app --reload --port 8000")


if __name__ == "__main__":
    main()
