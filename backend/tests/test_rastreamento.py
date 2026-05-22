"""Integration tests — Rastreamento router."""


def _rast_payload(veiculo_id, empresa_id):
    return {
        "id_veiculo":           veiculo_id,
        "id_empresa":           empresa_id,
        "empresa_rastreamento": "TrackCo",
        "numero_contrato":      "RC-001",
        "valor_mensal":         150.0,
        "data_inicio":          "2025-01-01",
        "vencimento":           "2025-12-31",
    }


def test_criar_rastreamento(client, seed_empresa, seed_frota):
    r = client.post("/api/db/rastreamento", json=_rast_payload(seed_frota.id, seed_empresa.id))
    assert r.status_code == 201
    data = r.json()
    assert data["empresa_rastreamento"] == "TrackCo"


def test_veiculo_duplicado_409(client, seed_empresa, seed_frota):
    client.post("/api/db/rastreamento", json=_rast_payload(seed_frota.id, seed_empresa.id))
    r = client.post("/api/db/rastreamento", json=_rast_payload(seed_frota.id, seed_empresa.id))
    assert r.status_code == 409


def test_listar_rastreamento(client, seed_empresa, seed_frota):
    client.post("/api/db/rastreamento", json=_rast_payload(seed_frota.id, seed_empresa.id))
    r = client.get("/api/db/rastreamento", params={"incluir_inativos": True})
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_patch_rastreamento(client, seed_empresa, seed_frota):
    r = client.post("/api/db/rastreamento", json=_rast_payload(seed_frota.id, seed_empresa.id))
    rid = r.json()["id"]
    r2 = client.patch(f"/api/db/rastreamento/{rid}", json={"dias_sem_sinal": 5})
    assert r2.status_code == 200
    assert r2.json()["dias_sem_sinal"] == 5


def test_deletar_rastreamento(client, seed_empresa, seed_frota):
    r = client.post("/api/db/rastreamento", json=_rast_payload(seed_frota.id, seed_empresa.id))
    rid = r.json()["id"]
    r2 = client.delete(f"/api/db/rastreamento/{rid}")
    assert r2.status_code == 204
    r3 = client.get("/api/db/rastreamento", params={"incluir_inativos": True})
    assert r3.json() == []


def test_summary_rastreamento(client, seed_empresa, seed_frota):
    client.post("/api/db/rastreamento", json=_rast_payload(seed_frota.id, seed_empresa.id))
    r = client.get("/api/db/rastreamento/summary")
    assert r.status_code == 200
    assert r.json()["total_veiculos"] == 1
