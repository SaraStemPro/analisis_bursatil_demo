"""Tests del motor de backtesting (sin tocar yfinance).

Cubre las piezas puras: detección de patrones de velas y exposición del
catálogo de templates. El simulador completo `run_backtest` hace I/O real
a Yahoo Finance, así que no se cubre aquí.
"""
from __future__ import annotations

import pandas as pd
import pytest

from app.services import backtest_service as bs


# ────────────────────────────────────────────────
# Templates
# ────────────────────────────────────────────────

def test_get_templates_returns_six():
    """6 templates históricos (cruce SMA, MACD, RSI, Bollinger, fractal, etc)."""
    templates = bs.get_templates()
    assert len(templates) >= 6, f"esperaba >=6 templates, hay {len(templates)}"
    # Todos llevan reglas válidas
    for t in templates:
        assert t.rules.entry is not None
        assert t.rules.exit is not None
        assert t.rules.risk_management is not None


def test_template_ids_unique():
    templates = bs.get_templates()
    ids = [str(t.id) for t in templates]
    assert len(ids) == len(set(ids))


# ────────────────────────────────────────────────
# Patrones de velas (pure function sobre DataFrame sintético)
# ────────────────────────────────────────────────

def _df(rows):
    """Helper: rows = lista de tuplas (Open, High, Low, Close)."""
    return pd.DataFrame(rows, columns=["Open", "High", "Low", "Close"])


def test_bullish_engulfing_detected():
    """Patrón clásico: vela bajista + vela alcista que la envuelve."""
    df = _df([
        (100, 105, 99, 100),    # vela neutra (warmup)
        (100, 101, 95, 96),     # bajista (open 100, close 96)
        (95, 110, 94, 108),     # alcista que envuelve (open 95<=96, close 108>=100, body 13>4)
    ])
    patterns = bs._detect_candle_patterns(df)
    series = patterns["bullish_engulfing"]
    assert series.iloc[2] == 1.0, "debería detectar envolvente alcista en la última vela"
    assert series.iloc[1] == 0.0


def test_bearish_engulfing_detected():
    df = _df([
        (100, 105, 99, 100),
        (95, 105, 94, 104),     # alcista
        (104, 105, 90, 91),     # bajista que envuelve
    ])
    patterns = bs._detect_candle_patterns(df)
    assert patterns["bearish_engulfing"].iloc[2] == 1.0


def test_bullish_hammer_detected():
    """Sombra inferior >= 2x cuerpo, sombra superior <= 0.5x cuerpo."""
    # Open=100, High=101, Low=90, Close=101 → body=1, lower_shadow=10, upper=0
    df = _df([
        (100, 101, 90, 101),
    ])
    patterns = bs._detect_candle_patterns(df)
    assert patterns["bullish_hammer"].iloc[0] == 1.0


def test_no_pattern_on_doji_like_candle():
    """Vela neutra sin características de patrón."""
    df = _df([
        (100, 101, 99, 100),
        (100, 101, 99, 100),
    ])
    patterns = bs._detect_candle_patterns(df)
    for name, s in patterns.items():
        assert s.iloc[1] == 0.0, f"{name} no debería dispararse en una doji"


def test_patterns_return_all_six():
    df = _df([(100, 101, 99, 100)] * 5)
    patterns = bs._detect_candle_patterns(df)
    expected = {
        "bullish_engulfing", "bearish_engulfing",
        "bullish_hammer", "bearish_hammer",
        "bullish_2020", "bearish_2020",
    }
    assert set(patterns.keys()) == expected


def test_patterns_handle_nan_first_row():
    """La primera vela no tiene previa: prev_body es NaN; debe quedar como 0.0."""
    df = _df([
        (100, 110, 90, 105),
        (100, 110, 90, 105),
    ])
    patterns = bs._detect_candle_patterns(df)
    for name, s in patterns.items():
        # Sin ser estricto sobre dispararse o no, el resultado debe ser
        # finito (no NaN) tras el .fillna(0.0) interno.
        assert not s.isna().any(), f"{name} contiene NaN"
