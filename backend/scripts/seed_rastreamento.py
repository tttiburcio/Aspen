"""
Popula a tabela rastreamento com dados realistas usando Faker.

Execute a partir do diretório backend/:
    python scripts/seed_rastreamento.py [--clear]

Flags:
    --clear   Limpa registros existentes antes de inserir
"""
import sys
import random
from datetime import date, timedelta
from decimal import Decimal

sys.path.insert(0, ".")   # permite importar módulos do backend

from faker import Faker
from database import SessionLocal
import models

fake = Faker("pt_BR")
random.seed(42)

# ── Catálogo de empresas de rastreamento (nome, prefixo de contrato) ─────────
RASTREADORAS = [
    {
        "nome": "Sascar",
        "prefixo": "SAS",
        "modelos": ["Targa ST300", "Targa ST400", "Targa ST500 HD", "Targa Tracker"],
        "bloqueador_prob": 0.75,
        "valor_base": (95, 145),
    },
    {
        "nome": "Onixsat",
        "prefixo": "ONX",
        "modelos": ["Onix OM-100", "Onix OM-200", "Onix OM-300 HD"],
        "bloqueador_prob": 0.65,
        "valor_base": (85, 130),
    },
    {
        "nome": "Autotrac",
        "prefixo": "ATC",
        "modelos": ["AT-100", "AT-200 Plus", "AT-300 Fleet"],
        "bloqueador_prob": 0.70,
        "valor_base": (100, 155),
    },
    {
        "nome": "Sigmatrack",
        "prefixo": "SIG",
        "modelos": ["SigmaMax S1", "SigmaMax S2 HD", "Sigma Flex"],
        "bloqueador_prob": 0.60,
        "valor_base": (80, 120),
    },
    {
        "nome": "Cobli",
        "prefixo": "COB",
        "modelos": ["Cobli Box", "Cobli Box Pro", "Cobli Slim"],
        "bloqueador_prob": 0.55,
        "valor_base": (90, 135),
    },
]

# Duração de contrato em meses (opções comerciais mais comuns)
DURACOES = [12, 24, 36, 48]


def _rand_date_in_past(years_min=1, years_max=5) -> date:
    today = date.today()
    delta_days = random.randint(years_min * 365, years_max * 365)
    return today - timedelta(days=delta_days)


def _num_contrato(prefixo: str, seq: int) -> str:
    ano = random.randint(2020, 2024)
    return f"{prefixo}-{ano}-{seq:04d}"


def seed(clear: bool = False):
    db = SessionLocal()
    try:
        if clear:
            deleted = db.query(models.Rastreamento).delete()
            db.commit()
            print(f"  {deleted} registros removidos.")

        # Busca todos os veículos e empresas
        frota    = db.query(models.Frota).all()
        empresas = db.query(models.Empresa).all()
        emp_by_id = {e.id: e for e in empresas}

        if not frota:
            print("Nenhum veículo na frota. Aborte.")
            return

        # Agrupa veículos por empresa
        by_empresa: dict[int | None, list] = {}
        for v in frota:
            key = v.id_empresa if hasattr(v, "id_empresa") else None
            by_empresa.setdefault(key, []).append(v)

        # Se o modelo Frota não tem id_empresa, trata todos juntos
        if len(by_empresa) == 1 and None in by_empresa:
            # Tenta usar empresa via CNPJ ou agrupa arbitrariamente
            by_empresa = {None: frota}

        total_inseridos = 0

        for emp_id, veiculos in by_empresa.items():
            random.shuffle(veiculos)

            # Escolhe 2-3 rastreadoras distintas por empresa (frota grande), ou 1-2 (pequena)
            n_contratos = min(len(veiculos), random.randint(2, 3) if len(veiculos) >= 8 else 1)
            rastreadoras_escolhidas = random.sample(RASTREADORAS, min(n_contratos, len(RASTREADORAS)))

            # Distribui veículos entre os contratos
            fatias = _split_list(veiculos, len(rastreadoras_escolhidas))

            for rastr, grupo in zip(rastreadoras_escolhidas, fatias):
                # Um contrato por grupo — mesma data de início e número de contrato
                seq = random.randint(1, 999)
                num_contrato  = _num_contrato(rastr["prefixo"], seq)
                duracao_meses = random.choice(DURACOES)
                data_inicio   = _rand_date_in_past(years_min=1, years_max=4)
                vencimento    = date(
                    data_inicio.year  + (data_inicio.month + duracao_meses - 1) // 12,
                    (data_inicio.month + duracao_meses - 1) % 12 + 1,
                    1,
                ) + timedelta(days=27)   # último dia do mês aproximado

                modelo = random.choice(rastr["modelos"])
                vm_min, vm_max = rastr["valor_base"]
                dia_venc = random.choice([5, 10, 15, 20, 25])

                for v in grupo:
                    valor_mensal = Decimal(str(round(random.uniform(vm_min, vm_max), 2)))
                    valor_total  = (valor_mensal * duracao_meses).quantize(Decimal("0.01"))

                    # Dias rastreados reais (data_inicio → hoje/venc)
                    fim = min(vencimento, date.today())
                    dias_rast = max(0, (fim - data_inicio).days)

                    # Dias sem sinal: 0-8% do total de dias rastreados, arredondado
                    pct_sem_sinal = random.uniform(0.0, 0.08)
                    dias_sem_sinal = round(dias_rast * pct_sem_sinal)

                    tem_bloq = random.random() < rastr["bloqueador_prob"]

                    r = models.Rastreamento(
                        id_veiculo           = v.id,
                        id_empresa           = emp_id,
                        empresa_rastreamento = rastr["nome"],
                        numero_contrato      = num_contrato,
                        modelo_rastreador    = modelo,
                        tem_bloqueador       = tem_bloq,
                        valor_mensal         = valor_mensal,
                        dia_vencimento       = dia_venc,
                        valor_total_contrato = valor_total,
                        data_inicio          = data_inicio,
                        vencimento           = vencimento,
                        dias_sem_sinal       = dias_sem_sinal,
                        observacoes          = None,
                    )
                    db.add(r)
                    total_inseridos += 1

        db.commit()
        print(f"  {total_inseridos} registros inseridos para {len(frota)} veículos.")

    finally:
        db.close()


def _split_list(lst, n):
    """Divide lista em n fatias aproximadamente iguais."""
    k, m = divmod(len(lst), n)
    return [lst[i * k + min(i, m):(i + 1) * k + min(i + 1, m)] for i in range(n)]


if __name__ == "__main__":
    clear = "--clear" in sys.argv
    print(f"Seeding rastreamento {'(limpando antes)' if clear else '(append)'}...")
    seed(clear=clear)
    print("Concluído.")
