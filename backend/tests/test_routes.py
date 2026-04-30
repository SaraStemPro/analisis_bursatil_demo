"""Smoke / contract tests: cada endpoint responde el código esperado.

Filosofía: detectar regresiones obvias (ruta cambiada, schema roto, auth rota)
en pocos segundos. NO valida lógica de negocio (eso vive en otros archivos).
"""
from __future__ import annotations


# ────────────────────────────────────────────────
# Health
# ────────────────────────────────────────────────

def test_health_ok(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


# ────────────────────────────────────────────────
# Auth
# ────────────────────────────────────────────────

def test_login_demo_user(client):
    res = client.post(
        "/api/auth/login",
        json={"email": "sara@demo.com", "password": "Demo1234"},
    )
    assert res.status_code == 200
    body = res.json()
    assert "access_token" in body
    assert body.get("token_type") == "bearer"


def test_login_wrong_password(client):
    res = client.post(
        "/api/auth/login",
        json={"email": "sara@demo.com", "password": "wrong"},
    )
    assert res.status_code == 401


def test_register_with_invite(client):
    res = client.post(
        "/api/auth/register",
        json={
            "email": "nuevo@example.com",
            "password": "MuySegura1",
            "name": "Nuevo",
            "invite_code": "AB_2026",
        },
    )
    assert res.status_code == 201
    assert res.json()["email"] == "nuevo@example.com"


def test_register_invalid_invite(client):
    res = client.post(
        "/api/auth/register",
        json={
            "email": "x@example.com",
            "password": "Pass1234",
            "name": "X",
            "invite_code": "BAD",
        },
    )
    assert res.status_code == 404


def test_me_requires_auth(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_returns_user(client, auth_headers):
    res = client.get("/api/auth/me", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["email"] == "sara@demo.com"


# ────────────────────────────────────────────────
# Endpoints protegidos sin token → 401
# ────────────────────────────────────────────────

def test_protected_endpoints_require_auth(client):
    """Si esto falla porque añadiste un endpoint público, actualiza la lista."""
    # endpoints que SIEMPRE requieren auth
    cases = [
        ("GET", "/api/demo/portfolio"),
        ("GET", "/api/demo/orders"),
        ("GET", "/api/demo/performance"),
        ("GET", "/api/demo/carteras"),
        ("POST", "/api/demo/order"),
        ("GET", "/api/lesson/leccion3/responses"),
        ("PUT", "/api/lesson/leccion3/responses"),
        ("GET", "/api/indicators/presets"),
    ]
    for method, path in cases:
        res = client.request(method, path, json={} if method != "GET" else None)
        assert res.status_code == 401, f"{method} {path} debería 401 sin token, devolvió {res.status_code}"


def test_admin_endpoints_block_students(client, auth_headers):
    """Endpoints sólo para profesor: el alumno recibe 403."""
    cases = [
        ("GET", "/api/demo/admin/positions"),
        ("GET", "/api/lesson/leccion3/responses/all"),
    ]
    for method, path in cases:
        res = client.request(method, path, headers=auth_headers)
        assert res.status_code == 403, f"{method} {path} debería 403 al alumno, devolvió {res.status_code}"


def test_admin_endpoints_allow_professor(client, professor_headers):
    res = client.get("/api/demo/admin/positions", headers=professor_headers)
    assert res.status_code == 200
    res2 = client.get("/api/lesson/leccion3/responses/all", headers=professor_headers)
    assert res2.status_code == 200


# ────────────────────────────────────────────────
# Indicators (no necesita yfinance, devuelve catálogo)
# ────────────────────────────────────────────────

def test_indicators_catalog_public(client):
    res = client.get("/api/indicators/catalog")
    assert res.status_code == 200
    body = res.json()
    assert "indicators" in body
    names = {i["name"] for i in body["indicators"]}
    # 10 esperados
    expected = {"SMA", "EMA", "MACD", "RSI", "STOCH", "BBANDS", "ATR", "OBV", "VWAP", "FRACTALS"}
    assert expected.issubset(names), f"faltan: {expected - names}"


# ────────────────────────────────────────────────
# Lesson responses (alumno)
# ────────────────────────────────────────────────

def test_lesson_responses_empty_initially(client, auth_headers):
    res = client.get("/api/lesson/leccion3/responses", headers=auth_headers)
    assert res.status_code == 200
    # Si nunca escribió, devuelve null
    assert res.json() is None


def test_lesson_responses_upsert_and_read(client, auth_headers):
    payload = {"data": {"reto:1A": "mi respuesta", "quiz:div1": 2, "check:div-c1": True}}
    res = client.put("/api/lesson/leccion3/responses", json=payload, headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["lesson_id"] == "leccion3"
    assert body["data"]["reto:1A"] == "mi respuesta"

    # Re-lectura
    res2 = client.get("/api/lesson/leccion3/responses", headers=auth_headers)
    assert res2.status_code == 200
    assert res2.json()["data"]["quiz:div1"] == 2


def test_lesson_responses_upsert_overwrites(client, auth_headers):
    """Un segundo PUT reemplaza completamente el blob."""
    client.put("/api/lesson/leccion3/responses", json={"data": {"a": 1}}, headers=auth_headers)
    client.put("/api/lesson/leccion3/responses", json={"data": {"b": 2}}, headers=auth_headers)
    res = client.get("/api/lesson/leccion3/responses", headers=auth_headers)
    body = res.json()
    assert body["data"] == {"b": 2}


def test_lesson_responses_admin_lists_students(client, auth_headers, professor_headers):
    """El profesor ve a todos los alumnos, incluso los que no han contestado."""
    # El alumno escribe algo
    client.put(
        "/api/lesson/leccion3/responses",
        json={"data": {"reto:1A": "test"}},
        headers=auth_headers,
    )
    # El profesor lista
    res = client.get("/api/lesson/leccion3/responses/all", headers=professor_headers)
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, list)
    saras = [s for s in body if s["user_email"] == "sara@demo.com"]
    assert len(saras) == 1
    assert saras[0]["data"]["reto:1A"] == "test"
