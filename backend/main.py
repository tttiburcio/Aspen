from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from config import CORS_ORIGINS, APP_TITLE, APP_VERSION
from database import init_db
from services.os_helpers import _enrich_km_from_mapws
from routers import analytics, maintenance, orders, invoices, fleet, sync, companies, reembolsos, contratos, faturamento, debitos, rastreamento, seguro
import asyncio
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()  # creates tables for fresh installs; run `alembic upgrade head` for schema migrations
    task_km = asyncio.create_task(asyncio.to_thread(_enrich_km_from_mapws))
    yield
    task_km.cancel()
    await asyncio.gather(task_km, return_exceptions=True)


app = FastAPI(title=APP_TITLE, version=APP_VERSION, lifespan=lifespan)


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Aspen API is running"}

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
app.include_router(rastreamento.router)
app.include_router(seguro.router)
