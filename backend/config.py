"""
Configuração centralizada do backend Aspen.

Variáveis de ambiente com fallback para defaults de desenvolvimento.
"""
import os as _os
from pathlib import Path

# ── Caminhos ──────────────────────────────────────────────────────────
_excel_env = _os.getenv("EXCEL_PATH")
EXCEL_PATH = Path(_excel_env) if _excel_env else Path(__file__).parent.parent / "Locadora.xlsx"

# ── Serviços externos ────────────────────────────────────────────────
MAPWS_BASE = _os.getenv("MAPWS_BASE", "http://localhost:8001")

# ── CORS ──────────────────────────────────────────────────────────────
CORS_ORIGINS = _os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"
).split(",")

# ── App ───────────────────────────────────────────────────────────────
ENVIRONMENT = _os.getenv("ENVIRONMENT", "development")
API_PORT = int(_os.getenv("API_PORT", "8000"))
APP_TITLE = "Aspen API"
APP_VERSION = "2.1.0"

# ── Nomes das abas do Excel ──────────────────────────────────────────
SHEETS = {
    "frota":            "🚛 FROTA",
    "fat_unitario":     "💰 FAT_UNITARIO",
    "reembolsos":       "↩️ REEMBOLSOS",
    "manutencoes":      "🔧 MANUTENCOES",
    "faturamento_mensal_excel": "🧾 FATURAMENTO",   # aba legada — só usada se Excel presente
    "seguro_mensal":    "📋 SEGURO_MENSAL",
    "debitos_documentais": "📋 DEBITOS_DOCUMENTAIS",
    "rastreamento":     "📍RASTREAMENTO",
    "contratos":        "📄 CONTRATOS",
    "clientes":         "🏢 CLIENTES",
    "empresas":         "🏢 EMPRESAS",
    "contrato_veiculo": "🔗 CONTRATO_VEICULO",
}
