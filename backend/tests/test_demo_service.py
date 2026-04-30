"""Tests de la lógica financiera de demo_service.

Cubre las funciones puras (no tocan BD ni yfinance) que son fáciles de
romper sin que se note: detección de CFD, multiplicador forex, asimetría
del spread, valor invertido vs valor en posición.
"""
from __future__ import annotations

from decimal import Decimal

from app.services import demo_service as ds
from app.schemas.demo import PositionResponse


# ────────────────────────────────────────────────
# Detección de CFD
# ────────────────────────────────────────────────

def test_is_cfd_indices():
    assert ds._is_cfd("^GSPC") is True
    assert ds._is_cfd("^IBEX") is True


def test_is_cfd_commodities():
    assert ds._is_cfd("CL=F") is True
    assert ds._is_cfd("GC=F") is True


def test_is_cfd_currencies():
    assert ds._is_cfd("EURUSD=X") is True


def test_is_cfd_stocks_are_not():
    assert ds._is_cfd("AAPL") is False
    assert ds._is_cfd("IBE.MC") is False


# ────────────────────────────────────────────────
# Multiplicador forex (precio < 10 → ×10000)
# ────────────────────────────────────────────────

def test_notional_value_forex_under_10_multiplied():
    """EURUSD 1.16 → notional 11600."""
    notional = ds._notional_value("EURUSD=X", Decimal("1.16"))
    assert notional == Decimal("11600.00")


def test_notional_value_forex_over_10_not_multiplied():
    """Si el forex cotiza >=10 (ejemplo USDJPY ~150), NO se multiplica."""
    notional = ds._notional_value("USDJPY=X", Decimal("150"))
    assert notional == Decimal("150")


def test_notional_value_stock_returns_price():
    notional = ds._notional_value("AAPL", Decimal("180"))
    assert notional == Decimal("180")


def test_notional_value_index_returns_price():
    notional = ds._notional_value("^GSPC", Decimal("4500"))
    assert notional == Decimal("4500")


# ────────────────────────────────────────────────
# Spread asimétrico (sólo al ask)
# ────────────────────────────────────────────────

def test_spread_buy_increases_price():
    base = Decimal("100")
    px = ds._apply_spread(base, is_buy=True)
    expected = Decimal("100") * (Decimal("1") + ds._SPREAD_PCT)
    assert px == expected
    assert px > base


def test_spread_sell_decreases_price():
    base = Decimal("100")
    px = ds._apply_spread(base, is_buy=False)
    expected = Decimal("100") * (Decimal("1") - ds._SPREAD_PCT)
    assert px == expected
    assert px < base


def test_spread_pct_is_001_pct():
    """Si alguien cambia _SPREAD_PCT, este test salta. Es a propósito:
    el cambio de spread tiene impacto en la clase y debe ser explícito."""
    assert ds._SPREAD_PCT == Decimal("0.0001")


def test_cfd_margin_is_5_pct():
    """Mismo razonamiento: cambio de margen → impacto pedagógico."""
    assert ds._CFD_MARGIN_PCT == Decimal("0.05")


# ────────────────────────────────────────────────
# Valor invertido vs valor en posición (CFD vs stock)
# ────────────────────────────────────────────────

def _make_position(ticker: str, entry_price: float, qty: int, pnl: float = 0.0):
    """Construye un PositionResponse mínimo para los cálculos de valor."""
    return PositionResponse(
        order_id="test-id",
        ticker=ticker,
        quantity=qty,
        entry_price=Decimal(str(entry_price)),
        current_price=Decimal(str(entry_price)),
        pnl=Decimal(str(pnl)),
        pnl_pct=Decimal("0"),
        side="long",
    )


def test_invested_value_stock_is_price_times_qty():
    pos = _make_position("AAPL", entry_price=180.0, qty=10)
    assert ds._invested_value(pos) == 1800.0


def test_invested_value_cfd_is_5_pct_of_notional():
    """Índice S&P 500 a 4500, 1 contrato → 5% × 4500 = 225."""
    pos = _make_position("^GSPC", entry_price=4500.0, qty=1)
    assert ds._invested_value(pos) == 225.0


def test_invested_value_forex_with_x10000():
    """EURUSD 1.16 → notional 11600, margen 5% → 580."""
    pos = _make_position("EURUSD=X", entry_price=1.16, qty=1)
    assert ds._invested_value(pos) == 580.0


def test_position_value_is_invested_plus_pnl():
    """invested 1800 + pnl 50 = 1850."""
    pos = _make_position("AAPL", entry_price=180.0, qty=10, pnl=50.0)
    assert ds._position_value(pos) == 1850.0


def test_invested_value_does_not_change_with_pnl():
    """Lo invertido es lo que se PAGÓ al abrir, no varía con el mercado."""
    pos_a = _make_position("AAPL", entry_price=180.0, qty=10, pnl=0.0)
    pos_b = _make_position("AAPL", entry_price=180.0, qty=10, pnl=500.0)
    assert ds._invested_value(pos_a) == ds._invested_value(pos_b)
    # Pero el valor de posición sí cambia
    assert ds._position_value(pos_b) > ds._position_value(pos_a)
