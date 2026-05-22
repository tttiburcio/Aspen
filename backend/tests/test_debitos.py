"""Integration tests — Débitos + Multas router."""


def test_criar_debito(client, seed_empresa, seed_frota):
    payload = {
        "id_veiculo": seed_frota.id,
        "id_empresa": seed_empresa.id,
        "exercicio":  2025,
        "valor_ipva": 1200.0,
    }
    r = client.post("/api/db/debitos", json=payload)
    assert r.status_code == 201
    data = r.json()
    assert data["exercicio"] == 2025


def test_listar_debitos(client, seed_empresa, seed_frota):
    client.post("/api/db/debitos", json={
        "id_veiculo": seed_frota.id,
        "id_empresa": seed_empresa.id,
        "exercicio":  2025,
    })
    r = client.get("/api/db/debitos")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_criar_multa(client, seed_empresa, seed_frota):
    payload = {
        "id_veiculo":    seed_frota.id,
        "id_empresa":    seed_empresa.id,
        "exercicio":     2025,
        "data_infracao": "2025-03-10",
        "valor_multa":   293.47,
        "orgao_emissor": "DETRAN",
    }
    r = client.post("/api/db/multas", json=payload)
    assert r.status_code == 201
    data = r.json()
    assert data["valor_multa"] == 293.47


def test_multa_cria_debito_documental(client, seed_empresa, seed_frota):
    """Creating a multa for a vehicle/year that has no DebitoDocumental should auto-create one."""
    payload = {
        "id_veiculo":    seed_frota.id,
        "id_empresa":    seed_empresa.id,
        "exercicio":     2025,
        "data_infracao": "2025-03-10",
        "valor_multa":   500.0,
    }
    client.post("/api/db/multas", json=payload)
    r = client.get("/api/db/debitos", params={"exercicio": 2025})
    assert r.status_code == 200
    rows = r.json()
    matching = [x for x in rows if x.get("id_veiculo") == seed_frota.id]
    assert len(matching) >= 1, "DebitoDocumental should have been auto-created"


def test_patch_multa_status_invalido_422(client, seed_empresa, seed_frota):
    r = client.post("/api/db/multas", json={
        "id_veiculo":    seed_frota.id,
        "id_empresa":    seed_empresa.id,
        "exercicio":     2025,
        "data_infracao": "2025-03-10",
        "valor_multa":   100.0,
    })
    multa_id = r.json()["id"]
    r2 = client.patch(f"/api/db/multas/{multa_id}", json={"status_multa": "StatusInvalido"})
    assert r2.status_code == 422


def test_summary_debitos(client):
    r = client.get("/api/db/debitos/summary")
    assert r.status_code == 200
    assert isinstance(r.json(), dict)
