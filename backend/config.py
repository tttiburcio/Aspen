"""
Configuração centralizada do backend Aspen.

Variáveis de ambiente com fallback para defaults de desenvolvimento.
"""
import os as _os

# ── Serviços externos ────────────────────────────────────────────────
MAPWS_BASE = _os.getenv("MAPWS_BASE", "http://localhost:8001")

# ── CORS ──────────────────────────────────────────────────────────────
CORS_ORIGINS = _os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"
).split(",")

# ── App ───────────────────────────────────────────────────────────────
ENVIRONMENT = _os.getenv("ENVIRONMENT", "development")
API_PORT     = int(_os.getenv("API_PORT", "8000"))
APP_TITLE    = "Aspen API"
APP_VERSION  = "3.0.0"
