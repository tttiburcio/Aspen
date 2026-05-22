"""Integration tests — Contratos router."""


def _contrato_payload(empresa_id, nome="Cliente Teste"):
    return {
        "empresa_id":      empresa_id,
        "nome_cliente":    nome,
        "data_inicio":     "2025-01-01",
        "data_fim":        "2025-12-31",
        "status_contrato": "Ativo",
    }


def test_criar_contrato(client, seed_empresa):
    r = client.post("/api/db/contratos", json=_contrato_payload(seed_empresa.id))
    assert r.status_code == 201
    data = r.json()
    assert data["nome_cliente"] == "Cliente Teste"
    assert data["status"] == "Ativo"


def test_status_contrato_invalido_422(client, seed_empresa):
    payload = _contrato_payload(seed_empresa.id)
    payload["status_contrato"] = "StatusInvalido"
    r = client.post("/api/db/contratos", json=payload)
    assert r.status_code == 422


def test_listar_contratos(client, seed_empresa):
    client.post("/api/db/contratos", json=_contrato_payload(seed_empresa.id))
    r = client.get("/api/db/contratos")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_patch_contrato(client, seed_empresa):
    r = client.post("/api/db/contratos", json=_contrato_payload(seed_empresa.id))
    cid = r.json()["id"]
    r2 = client.patch(f"/api/db/contratos/{cid}", json={"nome_cliente": "Novo Cliente"})
    assert r2.status_code == 200
    assert r2.json()["nome_cliente"] == "Novo Cliente"


def test_deletar_contrato(client, seed_empresa):
    r = client.post("/api/db/contratos", json=_contrato_payload(seed_empresa.id))
    cid = r.json()["id"]
    r2 = client.delete(f"/api/db/contratos/{cid}")
    assert r2.status_code == 204
    r3 = client.get("/api/db/contratos")
    assert r3.json() == []


def test_adicionar_veiculo_contrato(client, seed_empresa, seed_frota):
    r = client.post("/api/db/contratos", json=_contrato_payload(seed_empresa.id))
    cid = r.json()["id"]
    r2 = client.post(f"/api/db/contratos/{cid}/veiculos", json={
        "id_veiculo": seed_frota.id,
        "valor_mensal": 5000.0,
    })
    assert r2.status_code in (200, 201)


def test_frota_disponivel(client):
    r = client.get("/api/db/contratos/frota-disponivel")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_enums_endpoint(client):
    r = client.get("/api/enums")
    assert r.status_code == 200
    data = r.json()
    assert "coberturas_seguro" in data
    assert "status_apolice" in data
    assert "orgaos_emissores" in data
