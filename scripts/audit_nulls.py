import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from database import engine
from sqlalchemy import text

checks = [
    ("ordens_servico.responsavel_tec NULL",     "SELECT COUNT(*) FROM ordens_servico WHERE responsavel_tec IS NULL"),
    ("ordens_servico.status_execucao NULL",     "SELECT COUNT(*) FROM ordens_servico WHERE status_execucao IS NULL"),
    ("parcelas.tipo_custo NULL",                "SELECT COUNT(*) FROM manutencao_parcelas WHERE tipo_custo IS NULL"),
    ("parcelas.data_venc_original NULL",        "SELECT COUNT(*) FROM manutencao_parcelas WHERE data_vencimento_original IS NULL"),
    ("os_itens.manejo_pneu NULL (Pneu)",        "SELECT COUNT(*) FROM os_itens WHERE manejo_pneu IS NULL AND sistema = 'Pneu'"),
    ("os_itens.modelo_pneu NULL (Pneu)",        "SELECT COUNT(*) FROM os_itens WHERE modelo_pneu IS NULL AND sistema = 'Pneu'"),
    ("os_itens total Pneu",                     "SELECT COUNT(*) FROM os_itens WHERE sistema = 'Pneu'"),
    ("reembolsos.id_contrato NULL",             "SELECT COUNT(*) FROM reembolsos WHERE id_contrato IS NULL"),
    ("reembolsos.id_cliente NULL",              "SELECT COUNT(*) FROM reembolsos WHERE id_cliente IS NULL"),
    ("reembolsos.numero_os NULL (Manut/Fran)",  "SELECT COUNT(*) FROM reembolsos WHERE numero_os IS NULL AND tipo IN ('Manutencao','Franquia de Seguro')"),
    ("reembolsos.fatura_mes NULL (Encargo)",    "SELECT COUNT(*) FROM reembolsos WHERE fatura_mes IS NULL AND tipo = 'Encargo de Faturamento'"),
]

with engine.connect() as c:
    for label, sql in checks:
        print(f"  {label}: {c.execute(text(sql)).scalar()}")
