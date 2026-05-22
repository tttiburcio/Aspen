import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).parent.parent))

from database import Base, get_db
from main import app

# ── In-memory SQLite for all tests ────────────────────────────────────────────
# StaticPool forces all connections to reuse the same underlying connection so
# the in-memory database persists across sessions created by the ORM.
TEST_DB_URL = "sqlite://"

@pytest.fixture(scope="session")
def engine():
    e = create_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    import models  # noqa: F401 — register all models
    Base.metadata.create_all(bind=e)
    yield e
    e.dispose()


@pytest.fixture()
def db_session(engine):
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = Session()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture()
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def clean_tables(db_session):
    """Truncate transactional tables before each test."""
    import models
    for model in [
        models.SeguroMensal, models.SeguroVeiculo, models.Seguro,
        models.Rastreamento, models.Multa, models.DebitoDocumental,
        models.ContratoVeiculo, models.Contrato,
        models.Corretor, models.Empresa, models.Frota,
    ]:
        db_session.query(model).delete()
    db_session.commit()


@pytest.fixture()
def seed_empresa(db_session):
    import models
    e = models.Empresa(nome="Empresa Teste", sigla="TST")
    db_session.add(e)
    db_session.commit()
    db_session.refresh(e)
    return e


@pytest.fixture()
def seed_frota(db_session):
    import models
    v = models.Frota(placa="TST0001", modelo="Caminhão X", marca="MarcaA", status="Frota")
    db_session.add(v)
    db_session.commit()
    db_session.refresh(v)
    return v
