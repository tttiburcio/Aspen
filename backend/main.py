from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from config import CORS_ORIGINS, APP_TITLE, APP_VERSION
from database import init_db
from services.migration import _migrate_parcelas_prorrogacao, _migrate_faturamento_imposto, _migrate_faturamento_numero, _migrate_contrato_veiculo_valor_mensal, _migrate_contrato_pagamento, _migrate_contrato_medicoes_assinado, _migrate_frota_restricoes, _migrate_multa_comunicado, _migrate_frota_renavam, _migrate_reembolso_ids_multa_json
from services.excel_io import _sync_manutencoes_background
from services.os_helpers import _enrich_km_from_mapws
from routers import analytics, maintenance, orders, invoices, fleet, sync, companies, reembolsos, contratos, faturamento, debitos
import threading
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    _migrate_parcelas_prorrogacao()
    _migrate_faturamento_imposto()
    _migrate_faturamento_numero()
    _migrate_contrato_veiculo_valor_mensal()
    _migrate_contrato_pagamento()
    _migrate_contrato_medicoes_assinado()
    _migrate_frota_restricoes()
    _migrate_multa_comunicado()
    _migrate_frota_renavam()
    _migrate_reembolso_ids_multa_json()
    threading.Thread(target=_sync_manutencoes_background, daemon=True).start()
    threading.Thread(target=_enrich_km_from_mapws, daemon=True).start()
    yield


app = FastAPI(title=APP_TITLE, version=APP_VERSION, lifespan=lifespan)

# Middleware de Segurança (Security Headers)
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"]
)

app.include_router(analytics.router)
app.include_router(maintenance.router)
app.include_router(orders.router)
app.include_router(invoices.router)
app.include_router(fleet.router)
app.include_router(sync.router)
app.include_router(companies.router)
app.include_router(reembolsos.router)
app.include_router(contratos.router)
app.include_router(faturamento.router)
app.include_router(debitos.router)
