"""
Centralized business constants. Single source of truth for rules shared
between models, routers, and the frontend via GET /api/enums.
"""
from decimal import Decimal

# ── Impostos ───────────────────────────────────────────────────────────────────
ALIQUOTA_IMPOSTO_PADRAO = Decimal("11.33")

# ── Encargos de mora (compatível com Lei 9.430/96 simplificado) ───────────────
ENCARGOS_CFG = {
    "multa_pct":    2.0,
    "juros_diario": 0.000333,
}

# ── Seguro ────────────────────────────────────────────────────────────────────
COBERTURAS_SEGURO = [
    "Compreensivo",
    "Terceiros",
    "APP",
    "RCF",
    "RCFM",
    "Básica",
    "Implemento",
]

STATUS_APOLICE = ["Ativa", "Vencida", "Cancelada", "Renovada", "Vencendo"]

# ── Rastreamento ───────────────────────────────────────────────────────────────
STATUS_RASTREAMENTO = ["ativo", "vencendo", "vencido"]

# ── Débitos ───────────────────────────────────────────────────────────────────
ORGAOS_EMISSORES = [
    "DETRAN", "DENATRAN", "PRF", "PM", "CET", "CETESB",
    "SEMOB", "SMUL", "DNIT", "Outros",
]

STATUS_MULTA = ["Pendente", "Pago", "Cancelado", "Contestado", "Indicado"]

# ── Contratos ──────────────────────────────────────────────────────────────────
STATUS_CONTRATO = ["Ativo", "Encerrado", "Suspenso", "Em negociação"]

# ── Reembolsos ─────────────────────────────────────────────────────────────────
TIPOS_REEMBOLSO = [
    "Multa de Trânsito",
    "Franquia de Seguro",
    "Manutenção",
    "Encargo de Fatura",
    "Outros",
]

STATUS_RECEBIMENTO = ["Pendente", "Recebido", "Cancelado"]
