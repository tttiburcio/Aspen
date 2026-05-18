"""
Smoke tests — rede de segurança contra regressões.

Cobrem os endpoints críticos do dashboard (years, kpis, vehicles, monthly,
ordens de serviço, análise de manutenção e frota). Se qualquer um falhar
após uma refatoração, sabemos imediatamente o que quebrou.
"""
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def _get_valid_year() -> int:
    """Pega o primeiro ano disponível no sistema."""
    r = client.get("/api/years")
    payload = r.json()
    years = payload.get("years", []) if isinstance(payload, dict) else payload
    return years[0] if years else 2025


# ── Endpoints de leitura (dashboard) ────────────────────────────────────────

def test_years_retorna_lista():
    r = client.get("/api/years")
    assert r.status_code == 200
    data = r.json()
    # Aceita lista direta ou envelope { years: [...] }
    years = data.get("years", data) if isinstance(data, dict) else data
    assert isinstance(years, list)
    assert len(years) > 0, "Nenhum ano encontrado — verifique Locadora.xlsx"


def test_kpis_retorna_dados():
    year = _get_valid_year()
    r = client.get("/api/kpis", params={"year": year})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    assert len(data) > 0, f"KPIs vazios para o ano {year}"


def test_vehicles_retorna_lista():
    year = _get_valid_year()
    r = client.get("/api/vehicles", params={"year": year})
    assert r.status_code == 200
    data = r.json()
    # Aceita lista direta ou envelope { vehicles: [...] }
    vehicles = data.get("vehicles", data) if isinstance(data, dict) else data
    assert isinstance(vehicles, list)


def test_monthly_retorna_lista():
    year = _get_valid_year()
    r = client.get("/api/monthly", params={"year": year})
    assert r.status_code == 200
    data = r.json()
    # Aceita lista direta ou envelope { monthly: [...] }
    monthly = data.get("monthly", data) if isinstance(data, dict) else data
    assert isinstance(monthly, list)


# ── Endpoints de manutenção (operação crítica) ───────────────────────────────

def test_os_lista_retorna():
    r = client.get("/api/db/os")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_maintenance_analysis_retorna():
    year = _get_valid_year()
    r = client.get("/api/maintenance_analysis", params={"year": year})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, (dict, list))


# ── Endpoints de frota ───────────────────────────────────────────────────────

def test_frota_retorna_lista():
    r = client.get("/api/db/frota")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
