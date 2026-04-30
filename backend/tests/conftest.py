"""Configuración común de la suite de tests.

IMPORTANTE: este módulo fuerza `DATABASE_URL=sqlite:///:memory:` ANTES de importar
la app, para que la conexión a Supabase del `.env` no se use durante los tests.
"""
from __future__ import annotations

import os

# Debe ir ANTES de cualquier `from app...`
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-tests")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Reimportamos config y database para que vean el DATABASE_URL nuevo
from app import database as _db_mod  # noqa: E402

# La engine por defecto del proyecto se crea en import time. La sustituimos
# por una en memoria con StaticPool para que TODAS las conexiones compartan
# las mismas tablas (sqlite :memory: es por-conexión por defecto).
_test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_test_engine)
_db_mod.engine = _test_engine
_db_mod.SessionLocal = _TestSessionLocal


def _get_test_db():
    db = _TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


_db_mod.get_db = _get_test_db


@pytest.fixture(scope="session")
def test_engine():
    return _test_engine


@pytest.fixture()
def db_session():
    """Session SQLAlchemy fresca por test (rollback al final)."""
    # Asegura que las tablas existen
    from app.database import Base
    import app.models  # noqa: F401  (registra modelos)
    Base.metadata.create_all(bind=_test_engine)

    session = _TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client():
    """TestClient de la app FastAPI con BD en memoria."""
    # Importamos main aquí para que el seed/migrations corran sobre sqlite
    from app.main import app
    from app.database import get_db

    app.dependency_overrides[get_db] = _get_test_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def auth_headers(client):
    """Devuelve un token JWT válido del usuario alumno demo seed."""
    res = client.post(
        "/api/auth/login",
        json={"email": "sara@demo.com", "password": "Demo1234"},
    )
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def professor_headers(client):
    res = client.post(
        "/api/auth/login",
        json={"email": "profesor@demo.com", "password": "Demo1234"},
    )
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
