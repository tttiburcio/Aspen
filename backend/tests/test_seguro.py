"""Integration tests — Seguro router."""
import pytest


def _apolice_payload(empresa_id, veiculo_id, numero="TEST-001"):
    return {
        "numero_apolice":      numero,
        "seguradora":          "Seguradora Teste",
        "modelo_cobertura":    "Compreensivo",
        "id_empresa":          empresa_id,
        "data_inicio":         "2026-01-01",
        "data_fim":            "2027-12-31",
        "num_parcelas":        12,
        "valor_total_apolice": 12000.0,
        "status_apolice":      "Ativa",
        "veiculos": [{"id_veiculo": veiculo_id, "valor_veiculo": 100000.0, "cobre_implemento": False}],
    }


def test_criar_apolice(client, seed_empresa, seed_frota):
    r = client.post("/api/db/seguro", json=_apolice_payload(seed_empresa.id, seed_frota.id))
    assert r.status_code == 201
    data = r.json()
    assert data["numero_apolice"] == "TEST-001"
    assert len(data["veiculos"]) == 1


def test_apolice_duplicada_409(client, seed_empresa, seed_frota):
    payload = _apolice_payload(seed_empresa.id, seed_frota.id)
    client.post("/api/db/seguro", json=payload)
    r = client.post("/api/db/seguro", json=payload)
    assert r.status_code == 409


def test_veiculo_em_duas_apolices_409(client, seed_empresa, seed_frota):
    client.post("/api/db/seguro", json=_apolice_payload(seed_empresa.id, seed_frota.id, "AP-001"))
    # Second apolice with same vehicle should 409
    r = client.post("/api/db/seguro", json=_apolice_payload(seed_empresa.id, seed_frota.id, "AP-002"))
    assert r.status_code == 409


def test_listar_apolice(client, seed_empresa, seed_frota):
    client.post("/api/db/seguro", json=_apolice_payload(seed_empresa.id, seed_frota.id))
    r = client.get("/api/db/seguro")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) == 1


def test_patch_apolice(client, seed_empresa, seed_frota):
    r = client.post("/api/db/seguro", json=_apolice_payload(seed_empresa.id, seed_frota.id))
    apolice_id = r.json()["id"]
    r2 = client.patch(f"/api/db/seguro/{apolice_id}", json={"seguradora": "Nova Seguradora"})
    assert r2.status_code == 200
    assert r2.json()["seguradora"] == "Nova Seguradora"


def test_deletar_apolice(client, seed_empresa, seed_frota):
    r = client.post("/api/db/seguro", json=_apolice_payload(seed_empresa.id, seed_frota.id))
    apolice_id = r.json()["id"]
    r2 = client.delete(f"/api/db/seguro/{apolice_id}")
    assert r2.status_code == 204
    r3 = client.get("/api/db/seguro")
    assert r3.json() == []


def test_status_apolice_invalido_422(client, seed_empresa, seed_frota):
    payload = _apolice_payload(seed_empresa.id, seed_frota.id)
    payload["status_apolice"] = "EstadoInvalido"
    r = client.post("/api/db/seguro", json=payload)
    assert r.status_code == 422


def test_summary_seguro(client, seed_empresa, seed_frota):
    client.post("/api/db/seguro", json=_apolice_payload(seed_empresa.id, seed_frota.id))
    r = client.get("/api/db/seguro/summary")
    assert r.status_code == 200
    data = r.json()
    assert data["total_apolices"] == 1
    assert data["ativas"] == 1
