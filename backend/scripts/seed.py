"""
seed.py — Popula o banco Aspen com dados fictícios realistas.

Uso:
    cd backend
    python scripts/seed.py

    # Para resetar e re-seedar:
    python scripts/seed.py --reset

Cria:
    3 empresas · 4 corretores · 40 veículos · 5 contratos · 3 apólices de seguro
    40 registros de rastreamento · débitos documentais (IPVA + licenciamento) 2022–2026
    multas de trânsito · OS finalizadas (2022–2026) + NFs + parcelas · reembolsos
"""

import sys
import random
import argparse
import calendar
from pathlib import Path
from datetime import date, timedelta
from decimal import Decimal

# Garante que o diretório backend/ está no path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database import SessionLocal, Base, engine
import models
from faker import Faker

fake = Faker("pt_BR")
random.seed(42)
Faker.seed(42)

# ─── Constantes realistas ─────────────────────────────────────────────────────

MARCAS_MODELOS = [
    ("Scania",      "R450"),
    ("Volvo",       "FH 460"),
    ("Mercedes",    "Actros 2546"),
    ("MAN",         "TGX 29.440"),
    ("Iveco",       "S-Way 480"),
    ("Ford",        "Cargo 2429"),
    ("Volkswagen",  "Constellation 25.420"),
    ("Toyota",      "Hilux CD"),
    ("Chevrolet",   "S10 LTZ"),
    ("Fiat",        "Toro Ranch"),
]

TIPAGENS = [
    "cavalo mecânico", "truck", "toco", "bitruck",
    "semi-reboque", "caminhão", "SUV", "picape",
]

IMPLEMENTOS = [
    "Baú Refrigerado", "Carreta Graneleira", "Tanque Combustível",
    "Plataforma Rebaixada", "Basculante", None, None, None,
]

FORNECEDORES_OS = [
    "Auto Peças Progresso Ltda", "Mecânica Central Diesel",
    "TruckCar Manutenção", "Borracharia do Zé",
    "Oficina Vale Verde", "Distribuidora Sul Peças",
]

SISTEMAS = ["Motor", "Freios", "Suspensão", "Elétrica", "Pneus", "Transmissão", "Carroceria"]
SERVICOS = ["Troca de óleo", "Revisão geral", "Troca de pneu", "Alinhamento", "Freio traseiro", "Diagnóstico"]

SEGURADORAS = ["Porto Seguro", "Allianz", "Tokio Marine", "Bradesco Seguros", "Sompo"]
COBERTURAS   = ["Compreensivo", "Terceiros", "RCF", "APP"]

RASTREADORES = ["Sascar", "Omnilink", "Onixsat", "LoJack", "Autotrac"]
MODELOS_RAST = ["ST300", "TT200", "GPS-Pro", "Trackr Mini", "Fleet X"]

MOTIVOS_INFRACAO = [
    "Excesso de velocidade 20% acima do limite (CTB Art. 218 II)",
    "Avanço de sinal vermelho (CTB Art. 208)",
    "Estacionamento proibido (CTB Art. 181 I)",
    "Uso indevido de faixa exclusiva (CTB Art. 195)",
    "Farol apagado período noturno (CTB Art. 244 III)",
]

ORGAOS = ["DETRAN", "PRF", "CET", "SEMOB", "PM"]

CLIENTES = [
    ("Transportadora Nacional S.A.",  "Ativo"),
    ("Logística Brasil Ltda.",         "Ativo"),
    ("Mineração do Norte S.A.",        "Ativo"),
    ("Agro Cooperativa Central",       "Ativo"),
    ("Construtora Horizonte Ltda.",    "Ativo"),
    ("Distribuidora Vale Ltda.",       "Suspenso"),
]

# ─── Helpers ──────────────────────────────────────────────────────────────────

def rand_date(start: date, end: date) -> date:
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, max(delta, 0)))

def rand_placa() -> str:
    letras  = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    digitos = "0123456789"
    return (
        "".join(random.choices(letras, k=3))
        + random.choice(digitos)
        + random.choice(letras)
        + "".join(random.choices(digitos, k=2))
    )

def today() -> date:
    return date.today()

def ago(days: int) -> date:
    return today() - timedelta(days=days)

def future(days: int) -> date:
    return today() + timedelta(days=days)

def add_months(d: date, months: int) -> date:
    """Adiciona meses a uma data, ajustando para o último dia do mês quando necessário."""
    total = d.month - 1 + months
    year  = d.year + total // 12
    month = total % 12 + 1
    day   = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)

# ─── Seeding ──────────────────────────────────────────────────────────────────

def seed_empresas(db) -> list[models.Empresa]:
    empresas = [
        models.Empresa(
            nome="Frota Logística S.A.",
            sigla="EMPRESA_A",
            cnpj_cpf="11.222.333/0001-44",
            municipio="São Paulo",
            estado="SP",
        ),
        models.Empresa(
            nome="Transporte Rápido Ltda.",
            sigla="EMPRESA_B",
            cnpj_cpf="55.666.777/0001-88",
            municipio="Campinas",
            estado="SP",
        ),
        models.Empresa(
            nome="Mineração Norte S.A.",
            sigla="EMPRESA_C",
            cnpj_cpf="99.000.111/0001-22",
            municipio="Belo Horizonte",
            estado="MG",
        ),
    ]
    db.add_all(empresas)
    db.flush()
    print(f"  OK {len(empresas)} empresas")
    return empresas


def seed_corretores(db) -> list[models.Corretor]:
    corretores = [
        models.Corretor(
            nome="Corretor Nacional Seguros Ltda.",
            cnpj="12.345.678/0001-90",
            susep="10203040",
            telefone="(11) 98765-4321",
            email="contato@corretornacional.com.br",
        ),
        models.Corretor(
            nome="Sul Seguros Corretora S.A.",
            cnpj="98.765.432/0001-10",
            susep="50607080",
            telefone="(51) 3333-4444",
            email="atendimento@sulseguros.com.br",
        ),
        models.Corretor(
            nome="Premiere Riscos e Seguros",
            cnpj="11.223.344/0001-55",
            susep="90100200",
            telefone="(21) 2222-9999",
            email="premiere@riscos.com.br",
        ),
        models.Corretor(
            nome="Agência Total Seguros",
            cnpj="33.445.566/0001-77",
            susep="30405060",
            telefone="(31) 4444-5555",
            email="total@agenciaseguros.com.br",
        ),
    ]
    db.add_all(corretores)
    db.flush()
    print(f"  OK {len(corretores)} corretores")
    return corretores


def seed_clientes(db) -> list[models.Cliente]:
    clientes = []
    for nome, status in CLIENTES:
        c = models.Cliente(
            nome=nome,
            cnpj_cpf=fake.cnpj(),
            municipio=fake.city(),
            estado=fake.estado_sigla(),
            status_cliente=status,
        )
        db.add(c)
        clientes.append(c)
    db.flush()
    print(f"  OK {len(clientes)} clientes")
    return clientes


def seed_frota(db, empresas: list[models.Empresa]) -> list[models.Frota]:
    placas_geradas = set()
    veiculos = []
    for i in range(40):
        while True:
            placa = rand_placa()
            if placa not in placas_geradas:
                placas_geradas.add(placa)
                break
        marca, modelo = random.choice(MARCAS_MODELOS)
        empresa  = random.choice(empresas)
        tipagem  = random.choice(TIPAGENS)
        impl     = random.choice(IMPLEMENTOS)
        tab_fipe = Decimal(str(round(random.uniform(180_000, 650_000), 2)))
        # valor_implemento: entre 15% e 40% do valor do veículo quando há implemento
        val_impl = (
            Decimal(str(round(float(tab_fipe) * random.uniform(0.15, 0.40), 2)))
            if impl is not None else None
        )
        v = models.Frota(
            placa            = placa,
            id_empresa       = empresa.id,
            marca            = marca,
            modelo           = modelo,
            ano_modelo       = str(random.randint(2018, 2024)),
            status           = random.choices(
                ["Frota", "Frota", "Frota", "Manutenção", "Inativo"], k=1
            )[0],
            tipagem          = tipagem,
            implemento       = impl,
            tabela_fipe      = tab_fipe,
            valor_implemento = val_impl,
            valor_total      = tab_fipe + (val_impl or Decimal("0")),
            renavam          = "".join(str(random.randint(0, 9)) for _ in range(11)),
        )
        db.add(v)
        veiculos.append(v)
    db.flush()
    print(f"  OK {len(veiculos)} veículos")
    return veiculos


def seed_contratos(db, empresas, clientes, veiculos) -> list[models.Contrato]:
    contratos = []
    veiculos_disponiveis = list(veiculos)
    random.shuffle(veiculos_disponiveis)

    for i, cliente in enumerate(clientes[:5]):
        empresa = empresas[i % len(empresas)]
        # Contratos que cobrem o histórico de 4 anos (2022–2026)
        inicio  = rand_date(ago(1460), ago(90))
        fim     = inicio + timedelta(days=random.choice([365, 548, 730, 912]))
        status  = "Ativo" if fim > today() else "Encerrado"
        c = models.Contrato(
            empresa_id      = empresa.id,
            cliente_id      = cliente.id,
            nome_cliente    = cliente.nome,
            cidade_operacao = fake.city(),
            estado_operacao = fake.estado_sigla(),
            data_inicio     = inicio,
            data_fim        = fim,
            status_contrato = status,
            forma_pagamento = random.choice(["PIX", "Boleto"]),
            assinado        = True,
            medicoes_total  = (fim.year - inicio.year) * 12 + (fim.month - inicio.month),
        )
        db.add(c)
        contratos.append(c)
    db.flush()

    # Associar 5–10 veículos por contrato
    vinculados = set()
    for contrato in contratos:
        n = random.randint(5, 10)
        candidatos = [v for v in veiculos_disponiveis if v.id not in vinculados]
        escolhidos = candidatos[:n]
        for seq, v in enumerate(escolhidos, 1):
            db.add(models.ContratoVeiculo(
                contrato_id  = contrato.id,
                id_veiculo   = v.id,
                sequencia    = seq,
                valor_mensal = Decimal(str(round(random.uniform(3_500, 12_000), 2))),
            ))
            vinculados.add(v.id)
    db.flush()
    print(f"  OK {len(contratos)} contratos com veículos vinculados")
    return contratos


def seed_faturamento(db, empresas, contratos, veiculos):
    """Gera FatUnitario e FaturamentoMensal para cada contrato.

    Popula FatUnitario.contrato com o nome do cliente/contrato para que
    /api/regions e o filtro por contrato no dashboard funcionem corretamente.
    Popula FaturamentoMensal.numero_fatura com numeração sequencial por empresa.
    """
    rows = []
    # Contador sequencial de numero_fatura por empresa (chave = empresa.id)
    fat_seq: dict[int, int] = {}

    for contrato in contratos:
        empresa = next((e for e in empresas if e.id == contrato.empresa_id), empresas[0])
        inicio  = contrato.data_inicio
        fim     = min(contrato.data_fim, today())
        mes     = date(inicio.year, inicio.month, 1)
        # nome da "região/contrato" que aparece nos filtros do dashboard
        nome_contrato = contrato.nome_cliente

        # coleta ids dos veículos deste contrato
        veics_contrato = [cv.id_veiculo for cv in contrato.veiculos]

        while mes <= fim:
            valor = Decimal(str(round(random.uniform(25_000, 120_000), 2)))
            aliq  = Decimal("11.33")
            imposto  = (valor * aliq / 100).quantize(Decimal("0.01"))
            recebido = valor if random.random() > 0.1 else Decimal("0")

            # fat_unitario por veículo — campo `contrato` preenchido
            for vid in veics_contrato:
                trab = random.randint(20, 30)
                db.add(models.FatUnitario(
                    mes        = mes,
                    id_veiculo = vid,
                    id_empresa = empresa.id,
                    contrato   = nome_contrato,
                    medicao    = Decimal(str(round(random.uniform(3_000, 12_000), 2))),
                    trabalhado = trab,
                    parado     = 30 - trab,
                ))

            # fatura mensal consolidada — numero_fatura sequencial por empresa
            fat_seq[empresa.id] = fat_seq.get(empresa.id, 0) + 1
            venc   = mes + timedelta(days=30)
            status = "Recebido" if recebido > 0 else "Pendente"
            db.add(models.FaturamentoMensal(
                numero_fatura      = fat_seq[empresa.id],
                id_empresa         = empresa.id,
                id_contrato        = contrato.id,
                id_cliente         = contrato.cliente_id,
                emissao            = mes,
                vencimento         = venc,
                valor_locacoes     = valor,
                valor_recebido     = recebido,
                status_recebimento = status,
                empresa            = contrato.nome_cliente,
                forma_pagamento    = contrato.forma_pagamento or "PIX",
                aliquota_imposto   = aliq,
                valor_imposto      = imposto,
                valor_liquido      = valor - imposto,
                status_imposto     = "Pago" if recebido > 0 else "Pendente",
            ))
            rows.append(mes)

            # avança um mês
            mes = add_months(mes, 1)

    db.flush()
    print(f"  OK {len(rows)} meses de faturamento unitário")


def seed_seguros(db, empresas, veiculos, corretores):
    """Cria apólices de seguro com parcelas mensais usando aritmética de datas correta."""
    apolices = []
    todos_veics = list(veiculos)
    random.shuffle(todos_veics)
    chunks = [todos_veics[:14], todos_veics[14:28], todos_veics[28:]]

    for i, (empresa, chunk) in enumerate(zip(empresas, chunks)):
        if not chunk:
            continue
        inicio = ago(random.randint(60, 400))
        fim    = inicio + timedelta(days=365)
        valor_total = Decimal(str(round(sum(random.uniform(8_000, 25_000) for _ in chunk), 2)))
        corretor = random.choice(corretores)
        apolice  = models.Seguro(
            numero_apolice      = f"AP-{2025 + i}-{1000 + i:04d}",
            seguradora          = random.choice(SEGURADORAS),
            corretor_id         = corretor.id,
            modelo_cobertura    = random.choice(COBERTURAS),
            id_empresa          = empresa.id,
            data_inicio         = inicio,
            data_fim            = fim,
            num_parcelas        = 12,
            dia_vencimento      = random.randint(5, 25),
            valor_total_apolice = valor_total,
            status_apolice      = "Ativa" if fim > today() else "Vencida",
        )
        db.add(apolice)
        db.flush()

        for v in chunk:
            premio      = Decimal(str(round(random.uniform(8_000, 25_000), 2)))
            parcela_val = (premio / 12).quantize(Decimal("0.01"))
            db.add(models.SeguroVeiculo(
                apolice_id       = apolice.id,
                id_veiculo       = v.id,
                valor_veiculo    = premio,
                cobre_implemento = v.implemento is not None,
            ))
            # Parcelas mensais — aritmética correta com add_months()
            dia_venc = apolice.dia_vencimento or 10
            base_parc = date(inicio.year, inicio.month, min(dia_venc, calendar.monthrange(inicio.year, inicio.month)[1]))
            for m in range(12):
                venc = add_months(base_parc, m)
                db.add(models.SeguroMensal(
                    apolice_id = apolice.id,
                    vencimento = venc,
                    id_veiculo = v.id,
                    valor      = parcela_val,
                    id_empresa = empresa.id,
                ))

        apolices.append(apolice)
    db.flush()
    print(f"  OK {len(apolices)} apólices de seguro")
    return apolices


def seed_rastreamento(db, empresas, veiculos):
    for v in veiculos:
        empresa = next((e for e in empresas if e.id == v.id_empresa), empresas[0])
        inicio  = ago(random.randint(100, 900))
        venc    = inicio + timedelta(days=365)
        db.add(models.Rastreamento(
            id_veiculo           = v.id,
            id_empresa           = empresa.id,
            empresa_rastreamento = random.choice(RASTREADORES),
            numero_contrato      = f"RAST-{random.randint(10000, 99999)}",
            modelo_rastreador    = random.choice(MODELOS_RAST),
            tem_bloqueador       = random.choice([True, False]),
            valor_mensal         = Decimal(str(round(random.uniform(80, 250), 2))),
            valor_total_contrato = Decimal(str(round(random.uniform(1_000, 3_000), 2))),
            data_inicio          = inicio,
            vencimento           = venc,
            dia_vencimento       = random.randint(1, 28),
            dias_sem_sinal       = random.randint(0, 5),
        ))
    db.flush()
    print(f"  OK {len(veiculos)} registros de rastreamento")


def seed_debitos_e_multas(db, empresas, veiculos):
    """Gera IPVA + licenciamento para 2022–2026, com multas aleatórias por veículo/ano."""
    debitos_criados = 0
    multas_criadas  = 0

    for v in veiculos:
        empresa = next((e for e in empresas if e.id == v.id_empresa), empresas[0])
        for ano in [2022, 2023, 2024, 2025, 2026]:
            valor_ipva = Decimal(str(round(random.uniform(1_800, 8_500), 2)))
            valor_lic  = Decimal(str(round(random.uniform(200, 600), 2)))
            status_ipva = random.choices(["Pago", "Pendente"], weights=[70, 30])[0]
            status_lic  = random.choices(["Pago", "Pendente"], weights=[75, 25])[0]

            # Para 2026, vencimentos no primeiro semestre
            mes_ipva_max = 5 if ano == 2026 else 12
            mes_lic_max  = 5 if ano == 2026 else 12
            mes_lic_min  = 4 if ano == 2026 else 8

            dd = models.DebitoDocumental(
                id_veiculo              = v.id,
                id_empresa              = empresa.id,
                exercicio               = ano,
                ano_ref_ipva            = ano,
                valor_ipva              = valor_ipva,
                vencimento_ipva         = date(ano, random.randint(2, mes_ipva_max), random.randint(1, 28)),
                status_ipva             = status_ipva,
                valor_ipva_pago         = valor_ipva if status_ipva == "Pago" else None,
                valor_licenciamento     = valor_lic,
                vencimento_licenciamento= date(ano, random.randint(mes_lic_min, mes_lic_max), random.randint(1, 28)),
                status_licenciamento    = status_lic,
                valor_licenciamento_pago= valor_lic if status_lic == "Pago" else None,
                valor_multas            = Decimal("0"),
            )
            db.add(dd)
            db.flush()
            debitos_criados += 1

            # 0–2 multas por veículo por ano (menos para 2026 — ano em curso)
            max_multas = 1 if ano == 2026 else 2
            for _ in range(random.randint(0, max_multas)):
                # Data de infração dentro do ano (não excede hoje para ano atual)
                data_fim_ano = min(date(ano, 12, 31), today()) if ano == date.today().year else date(ano, 12, 31)
                data_inf = rand_date(date(ano, 1, 1), data_fim_ano)
                valor_m  = Decimal(str(random.choice([88.38, 130.16, 195.23, 293.47])))
                status_m = random.choices(
                    ["Pago", "Pendente", "Indicado", "Cancelado"],
                    weights=[40, 35, 15, 10]
                )[0]
                indicado = status_m in ("Pago", "Indicado") and random.random() > 0.3
                m = models.Multa(
                    id_veiculo           = v.id,
                    id_empresa           = empresa.id,
                    debito_documental_id = dd.id,
                    exercicio            = ano,
                    ait                  = f"AIT-{random.randint(100_000, 999_999)}",
                    orgao_emissor        = random.choice(ORGAOS),
                    data_infracao        = data_inf,
                    motivo_infracao      = random.choice(MOTIVOS_INFRACAO),
                    condutor_indicado    = indicado,
                    tipo_multa           = "Infração",
                    data_vencimento      = data_inf + timedelta(days=30),
                    valor_multa          = valor_m,
                    desconto_pct         = Decimal("20.00"),
                    valor_com_desconto   = (valor_m * Decimal("0.80")).quantize(Decimal("0.01")),
                    status_multa         = status_m,
                    valor_pago           = valor_m if status_m == "Pago" else None,
                )
                db.add(m)
                multas_criadas += 1

                # Atualiza cache de multas no débito documental
                if status_m not in ("Pago", "Cancelado"):
                    dd.valor_multas = (dd.valor_multas or Decimal("0")) + valor_m

    db.flush()
    print(f"  OK {debitos_criados} débitos documentais · {multas_criadas} multas")


def seed_ordens_servico(db, empresas, veiculos):
    """Gera OS finalizadas distribuídas entre 2022 e 2026 para todos os veículos."""
    os_criadas  = 0
    os_counters = {}  # ano -> contador sequencial

    # Todos os veículos recebem pelo menos 1 OS; amostra maior recebe mais
    amostra_grande = random.sample(veiculos, min(30, len(veiculos)))
    amostra_pequena = [v for v in veiculos if v not in amostra_grande]

    def _criar_os_para(v, qtd, data_inicio_range, data_fim_range):
        nonlocal os_criadas
        empresa = next((e for e in empresas if e.id == v.id_empresa), empresas[0])
        for _ in range(qtd):
            data_exec  = rand_date(data_inicio_range, data_fim_range)
            fornecedor = random.choice(FORNECEDORES_OS)
            sistema    = random.choice(SISTEMAS)
            servico    = random.choice(SERVICOS)
            total_os   = Decimal(str(round(random.uniform(500, 15_000), 2)))

            ano_os = data_exec.year
            os_counters[ano_os] = os_counters.get(ano_os, 0) + 1
            numero_os = f"OS-{ano_os}-{os_counters[ano_os]:04d}"

            os_obj = models.OrdemServico(
                numero_os       = numero_os,
                status_os       = "finalizada",
                id_veiculo      = v.id,
                placa           = v.placa,
                modelo          = v.modelo,
                id_empresa      = empresa.id,
                implemento      = v.implemento,
                fornecedor      = fornecedor,
                tipo_manutencao = random.choice(["Preventiva", "Corretiva"]),
                categoria       = "Serviço",
                total_os        = total_os,
                km              = random.randint(50_000, 400_000),
                data_entrada    = data_exec - timedelta(days=2),
                data_execucao   = data_exec,
            )
            db.add(os_obj)
            db.flush()

            # Item da OS
            item = models.OsItem(
                os_id     = os_obj.id,
                categoria = "Serviço",
                sistema   = sistema,
                servico   = servico,
                qtd_itens = 1,
            )
            db.add(item)
            db.flush()

            # Nota Fiscal
            nf = models.NotaFiscal(
                os_id          = os_obj.id,
                numero_nf      = f"NF-{random.randint(1000, 9999)}",
                tipo_nf        = "Servico",
                id_empresa     = empresa.id,
                fornecedor     = fornecedor,
                valor_total_nf = total_os,
                data_emissao   = data_exec,
            )
            db.add(nf)
            db.flush()

            # NfItem
            db.add(models.NfItem(
                nf_id            = nf.id,
                os_item_id       = item.id,
                quantidade       = Decimal("1"),
                valor_unitario   = total_os,
                valor_total_item = total_os,
            ))

            # Parcelas (1–3)
            n_parc     = random.randint(1, 3)
            valor_parc = (total_os / n_parc).quantize(Decimal("0.01"))
            for p in range(n_parc):
                venc_parc = data_exec + timedelta(days=30 * (p + 1))
                pago      = venc_parc < today() and random.random() > 0.2
                db.add(models.ManutencaoParcela(
                    nf_id            = nf.id,
                    nota             = nf.numero_nf,
                    fornecedor       = fornecedor,
                    valor_item_total = total_os,
                    data_vencimento  = venc_parc,
                    parcela_atual    = p + 1,
                    parcela_total    = n_parc,
                    valor_parcela    = valor_parc,
                    forma_pgto       = random.choice(["PIX", "Boleto", "TED"]),
                    status_pagamento = "Pago" if pago else "Pendente",
                ))

            os_criadas += 1

    # Veículos com histórico longo: OS distribuídas em 2022–2026
    for v in amostra_grande:
        _criar_os_para(v, random.randint(2, 5), ago(1460), ago(10))

    # Veículos com menos OS: foco em 2024–2026
    for v in amostra_pequena:
        _criar_os_para(v, random.randint(1, 2), ago(730), ago(10))

    db.flush()
    print(f"  OK {os_criadas} ordens de serviço finalizadas (2022–2026)")


def seed_reembolsos(db, empresas, veiculos, contratos):
    """Gera reembolsos distribuídos em 2022–2026 (~60 registros).

    Popula Reembolso.recibo com numeração sequencial por empresa
    (ex: 'REC-0001', 'REC-0002', …) para que a coluna Recibo na UI não fique vazia.
    """
    # Contador sequencial de recibo por empresa (chave = empresa.id)
    recibo_seq: dict[int, int] = {}

    count = 0
    for _ in range(60):
        v        = random.choice(veiculos)
        empresa  = next((e for e in empresas if e.id == v.id_empresa), empresas[0])
        contrato = random.choice(contratos)
        emissao  = rand_date(ago(1460), ago(5))
        valor    = Decimal(str(round(random.uniform(200, 5_000), 2)))
        recebido = random.random() > 0.3

        recibo_seq[empresa.id] = recibo_seq.get(empresa.id, 0) + 1
        recibo_num = f"{recibo_seq[empresa.id]:05d}"

        db.add(models.Reembolso(
            tipo               = random.choice(["Multa de Trânsito", "Franquia de Seguro", "Manutenção"]),
            id_empresa         = empresa.id,
            id_contrato        = contrato.id,
            id_cliente         = contrato.cliente_id,
            id_veiculo         = v.id,
            recibo             = recibo_num,
            emissao            = emissao,
            vencimento         = emissao + timedelta(days=30),
            empresa            = contrato.nome_cliente,
            valor_reembolso    = valor,
            valor_recebido     = valor if recebido else None,
            data_entrada       = emissao + timedelta(days=random.randint(5, 25)) if recebido else None,
            status_recebimento = "Recebido" if recebido else "Pendente",
            forma_recebimento  = random.choice(["PIX", "TED"]) if recebido else None,
        ))
        count += 1
    db.flush()
    print(f"  OK {count} reembolsos")


# ─── Main ─────────────────────────────────────────────────────────────────────

def run(reset: bool = False):
    if reset:
        print("[!] Resetando banco...")
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        print("   Tabelas recriadas.\n")
    else:
        Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        print("[*] Seedando Aspen...")
        empresas   = seed_empresas(db)
        corretores = seed_corretores(db)
        clientes   = seed_clientes(db)
        veiculos   = seed_frota(db, empresas)
        contratos  = seed_contratos(db, empresas, clientes, veiculos)
        seed_faturamento(db, empresas, contratos, veiculos)
        seed_seguros(db, empresas, veiculos, corretores)
        seed_rastreamento(db, empresas, veiculos)
        seed_debitos_e_multas(db, empresas, veiculos)
        seed_ordens_servico(db, empresas, veiculos)
        seed_reembolsos(db, empresas, veiculos, contratos)
        db.commit()
        print("\n[OK] Seed concluido! Rode: uvicorn main:app --reload --port 8000")
    except Exception as e:
        db.rollback()
        print(f"\n[ERRO] Erro durante seed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed do banco Aspen com dados fictícios.")
    parser.add_argument("--reset", action="store_true", help="Dropa e recria todas as tabelas antes de seedar")
    args = parser.parse_args()
    run(reset=args.reset)
