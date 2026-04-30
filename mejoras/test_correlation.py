"""
ADD TO: backend/tests/test_correlation.py

Tests del endpoint POST /api/market/correlation.
Sigue el patrón de tus otros tests (httpx.AsyncClient, fixtures de auth).
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_correlation_basic(authenticated_client: AsyncClient):
    """Caso happy path: 3 tickers tech del S&P 500."""
    response = await authenticated_client.post(
        "/api/market/correlation",
        json={
            "tickers": ["AAPL", "MSFT", "GOOGL"],
            "period": "6mo",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["tickers"]) == 3
    assert len(data["matrix"]) == 3
    assert len(data["matrix"][0]) == 3
    # Diagonal = 1
    for i in range(3):
        assert data["matrix"][i][i] == pytest.approx(1.0, abs=1e-3)
    # Simetría
    for i in range(3):
        for j in range(3):
            assert data["matrix"][i][j] == pytest.approx(
                data["matrix"][j][i], abs=1e-3
            )
    # Tech entre sí: correlación esperada > 0.4
    assert data["avg_correlation"] > 0.4
    # Diversification ratio razonable
    assert data["diversification_ratio"] >= 1.0
    assert "max_pair" in data
    assert "min_pair" in data


@pytest.mark.asyncio
async def test_correlation_with_weights(authenticated_client: AsyncClient):
    """Pesos no equiponderados deben afectar a portfolio_volatility."""
    response = await authenticated_client.post(
        "/api/market/correlation",
        json={
            "tickers": ["AAPL", "MSFT", "GOOGL"],
            "period": "6mo",
            "weights": [70, 20, 10],
        },
    )
    assert response.status_code == 200
    data = response.json()
    # Pesos normalizados a 1
    assert sum(data["weights"]) == pytest.approx(1.0, abs=1e-3)
    # Primer peso ≈ 0.7
    assert data["weights"][0] == pytest.approx(0.7, abs=1e-3)


@pytest.mark.asyncio
async def test_correlation_diversified_portfolio(authenticated_client: AsyncClient):
    """
    Una cartera con activos de clases muy distintas (acción, oro, bono USA)
    debe tener avg_correlation MUCHO más baja que una solo-tech.
    """
    diverse = await authenticated_client.post(
        "/api/market/correlation",
        json={
            "tickers": ["SPY", "GLD", "TLT"],  # acciones, oro, bonos largos
            "period": "1y",
        },
    )
    tech_only = await authenticated_client.post(
        "/api/market/correlation",
        json={
            "tickers": ["AAPL", "MSFT", "NVDA"],
            "period": "1y",
        },
    )
    assert diverse.status_code == 200 and tech_only.status_code == 200
    # La cartera diversificada DEBE tener correlación media menor
    assert diverse.json()["avg_correlation"] < tech_only.json()["avg_correlation"]


@pytest.mark.asyncio
async def test_correlation_validates_min_tickers(authenticated_client: AsyncClient):
    """Menos de 2 tickers únicos → 422."""
    response = await authenticated_client.post(
        "/api/market/correlation",
        json={"tickers": ["AAPL"]},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_correlation_validates_max_tickers(authenticated_client: AsyncClient):
    """Más de 30 tickers → 422."""
    response = await authenticated_client.post(
        "/api/market/correlation",
        json={"tickers": [f"T{i}" for i in range(35)]},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_correlation_invalid_weights(authenticated_client: AsyncClient):
    """Pesos negativos o longitud distinta → 422."""
    response = await authenticated_client.post(
        "/api/market/correlation",
        json={"tickers": ["AAPL", "MSFT"], "weights": [50, -10]},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_correlation_dedupes_tickers(authenticated_client: AsyncClient):
    """Tickers duplicados se descartan."""
    response = await authenticated_client.post(
        "/api/market/correlation",
        json={"tickers": ["AAPL", "AAPL", "msft", "MSFT", "GOOGL"]},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["tickers"]) == 3
    assert "AAPL" in data["tickers"]
    assert "MSFT" in data["tickers"]
    assert "GOOGL" in data["tickers"]


@pytest.mark.asyncio
async def test_correlation_requires_auth(client: AsyncClient):
    """Sin token → 401."""
    response = await client.post(
        "/api/market/correlation",
        json={"tickers": ["AAPL", "MSFT"]},
    )
    assert response.status_code == 401
