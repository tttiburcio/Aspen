"""
Popula as tabelas seguro, seguro_veiculo e seguro_mensal com dados realistas.

Execute a partir do diretório backend/:
    python scripts/seed_seguro.py [--clear]

Flags:
    --clear   Limpa registros existentes antes de inserir
"""
import sys
import random
import calendar
from datetime import date, timedelta
from decimal import Decimal

sys.path.insert(0, ".")

from faker import Faker
from database import SessionLocal
import models

fake = Faker("pt_BR")
random.seed(99)

SEGURADORAS = [
    {"nome": "Porto Seguro",  "prefixo": "PS"},
    {"nome": "Zurich",        "prefixo": "ZR"},
    {"nome": "HDI Seguros",   "prefixo": "HDI"},
    {"nome": "Tokio Marine",  "prefixo": "TM"},
    {"nome": "Allianz",       "prefixo": "ALZ"},
]

COBERTURAS = [
    "Compreensivo com RCF-DC",
    "RCF-DC Básico",
    "Terceiros + Roubo e Furto",
    "Compreensivo Total",
]

PREMIO_RANGE = (1_800, 4_200)   # prêmio anual por veículo (R$)


def _num_apolice(prefixo: str, seq: int) -> str:
    ano = random.randint(2022, 2024)
    return f"{prefixo}-{ano}-{seq:06d}"


def _rand_date(years_back_min=1, years_back_max=3) -> date:
    today = date.today()
    delta = random.randint(years_back_min * 365, years_back_max * 365)
    return today - timedelta(days=delta)


def _gerar_mensais(db, apolice: models.Seguro):
    """Gera parcelas mensais para a apólice."""
    db.query(models.SeguroMensal).filter(models.SeguroMensal.apolice_id == apolice.id).delete()
    svs = db.query(models.SeguroVeiculo).filter(models.SeguroVeiculo.apolice_id == apolice.id).all()
    if not svs or not apolice.data_inicio or not apolice.num_parcelas:
        return
    dia = apolice.dia_vencimento or 10
    for sv in svs:
        if not sv.valor_veiculo:
            continue
        vm = (Decimal(str(sv.valor_veiculo)) / apolice.num_parcelas).quantize(Decimal("0.01"))
        for i in range(apolice.num_parcelas):
            m0 = apolice.data_inicio.month + i
            y = apolice.data_inicio.year + (m0 - 1) // 12
            m = (m0 - 1) % 12 + 1
            last = calendar.monthrange(y, m)[1]
            venc = date(y, m, min(dia, last))
            db.add(models.SeguroMensal(
                apolice_id=apolice.id,
                vencimento=venc,
                id_veiculo=sv.id_veiculo,
                valor=vm,
                id_empresa=apolice.id_empresa,
            ))


def seed(clear: bool = False):
    db = SessionLocal()
    try:
        if clear:
            deleted_m = db.query(models.SeguroMensal).delete()
            deleted_v = db.query(models.SeguroVeiculo).delete()
            deleted_a = db.query(models.Seguro).delete()
            db.commit()
            print(f"  Removidos: {deleted_a} apólices, {deleted_v} vínculos, {deleted_m} mensais.")

        frota    = db.query(models.Frota).all()
        empresas = db.query(models.Empresa).all()

        if not frota:
            print("Nenhum veículo na frota. Abortando.")
            return

        by_empresa: dict = {}
        for v in frota:
            key = getattr(v, "id_empresa", None)
            by_empresa.setdefault(key, []).append(v)

        if len(by_empresa) == 1 and None in by_empresa:
            # frota sem id_empresa — associa empresa 1 se existir
            emp_id = empresas[0].id if empresas else None
            by_empresa = {emp_id: frota}

        total_apolices = 0
        total_veiculos = 0

        for emp_id, veiculos in by_empresa.items():
            random.shuffle(veiculos)
            # 1-2 seguradoras por empresa
            n_segs = 1 if len(veiculos) < 6 else 2
            segs_escolhidas = random.sample(SEGURADORAS, min(n_segs, len(SEGURADORAS)))

            fatias = _split(veiculos, len(segs_escolhidas))

            for seg, grupo in zip(segs_escolhidas, fatias):
                seq        = random.randint(1, 9999)
                num_ap     = _num_apolice(seg["prefixo"], seq)
                cobertura  = random.choice(COBERTURAS)
                data_ini   = _rand_date(1, 3)
                num_parc   = random.choice([4, 6, 12])
                data_fim   = date(
                    data_ini.year + (data_ini.month + num_parc - 2) // 12,
                    (data_ini.month + num_parc - 2) % 12 + 1,
                    1,
                ) + timedelta(days=27)
                dia_venc   = random.choice([5, 10, 15, 20])
                status     = "Ativa" if data_fim >= date.today() else "Vencida"

                premios = [
                    Decimal(str(round(random.uniform(*PREMIO_RANGE), 2)))
                    for _ in grupo
                ]
                valor_total = sum(premios).quantize(Decimal("0.01"))

                a = models.Seguro(
                    numero_apolice      = num_ap,
                    seguradora          = seg["nome"],
                    modelo_cobertura    = cobertura,
                    id_empresa          = emp_id,
                    data_inicio         = data_ini,
                    data_fim            = data_fim,
                    num_parcelas        = num_parc,
                    dia_vencimento      = dia_venc,
                    valor_total_apolice = valor_total,
                    status_apolice      = status,
                )
                db.add(a)
                db.flush()

                for v, premio in zip(grupo, premios):
                    db.add(models.SeguroVeiculo(
                        apolice_id    = a.id,
                        id_veiculo    = v.id,
                        valor_veiculo = premio,
                    ))
                db.flush()

                _gerar_mensais(db, a)

                total_apolices += 1
                total_veiculos += len(grupo)

        db.commit()
        print(f"  {total_apolices} apólices inseridas para {total_veiculos} veículos.")

    finally:
        db.close()


def _split(lst, n):
    k, m = divmod(len(lst), n)
    return [lst[i * k + min(i, m):(i + 1) * k + min(i + 1, m)] for i in range(n)]


if __name__ == "__main__":
    clear = "--clear" in sys.argv
    print(f"Seeding seguro {'(limpando antes)' if clear else '(append)'}...")
    seed(clear=clear)
    print("Concluído.")
