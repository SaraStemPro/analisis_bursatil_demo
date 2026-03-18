import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import HTTPException, status

from ..schemas.indicators import (
    CalculateResponse,
    CatalogResponse,
    IndicatorDefinition,
    IndicatorParam,
    IndicatorRequest,
    IndicatorSeries,
)

CATALOG: list[IndicatorDefinition] = [
    IndicatorDefinition(
        name="SMA",
        display_name="Media Móvil Simple",
        category="tendencia",
        overlay=True,
        params=[IndicatorParam(name="length", type="int", default=20, min=2, max=500)],
    ),
    IndicatorDefinition(
        name="EMA",
        display_name="Media Móvil Exponencial",
        category="tendencia",
        overlay=True,
        params=[IndicatorParam(name="length", type="int", default=20, min=2, max=500)],
    ),
    IndicatorDefinition(
        name="MACD",
        display_name="MACD",
        category="tendencia",
        overlay=False,
        params=[
            IndicatorParam(name="fast", type="int", default=12, min=2, max=100),
            IndicatorParam(name="slow", type="int", default=26, min=2, max=200),
            IndicatorParam(name="signal", type="int", default=9, min=2, max=100),
        ],
    ),
    IndicatorDefinition(
        name="RSI",
        display_name="Índice de Fuerza Relativa",
        category="momentum",
        overlay=False,
        params=[IndicatorParam(name="length", type="int", default=14, min=2, max=100)],
    ),
    IndicatorDefinition(
        name="STOCH",
        display_name="Estocástico",
        category="momentum",
        overlay=False,
        params=[
            IndicatorParam(name="k", type="int", default=14, min=2, max=100),
            IndicatorParam(name="d", type="int", default=3, min=1, max=50),
        ],
    ),
    IndicatorDefinition(
        name="BBANDS",
        display_name="Bandas de Bollinger",
        category="volatilidad",
        overlay=True,
        params=[
            IndicatorParam(name="length", type="int", default=20, min=2, max=200),
            IndicatorParam(name="std", type="float", default=2.0, min=0.5, max=5.0),
        ],
    ),
    IndicatorDefinition(
        name="ATR",
        display_name="Average True Range",
        category="volatilidad",
        overlay=False,
        params=[IndicatorParam(name="length", type="int", default=14, min=2, max=100)],
    ),
    IndicatorDefinition(
        name="OBV",
        display_name="On Balance Volume",
        category="volumen",
        overlay=False,
        params=[],
    ),
    IndicatorDefinition(
        name="VWAP",
        display_name="VWAP",
        category="volumen",
        overlay=True,
        params=[],
    ),
    IndicatorDefinition(
        name="FRACTALS",
        display_name="Fractales de Williams",
        category="tendencia",
        overlay=True,
        params=[IndicatorParam(name="period", type="int", default=21, min=3, max=99)],
    ),
]

_CATALOG_NAMES = {ind.name for ind in CATALOG}


def get_catalog() -> CatalogResponse:
    return CatalogResponse(indicators=CATALOG)


# --- Pure pandas/numpy indicator calculations ---

def _sma(series: pd.Series, length: int) -> pd.Series:
    return series.rolling(window=length).mean()


def _ema(series: pd.Series, length: int) -> pd.Series:
    return series.ewm(span=length, adjust=False).mean()


def _macd(series: pd.Series, fast: int, slow: int, signal: int) -> pd.DataFrame:
    ema_fast = _ema(series, fast)
    ema_slow = _ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = _ema(macd_line, signal)
    histogram = macd_line - signal_line
    return pd.DataFrame({"macd": macd_line, "signal": signal_line, "histogram": histogram})


def _rsi(series: pd.Series, length: int) -> pd.Series:
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1.0 / length, min_periods=length, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / length, min_periods=length, adjust=False).mean()
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def _stoch(high: pd.Series, low: pd.Series, close: pd.Series, k: int, d: int) -> pd.DataFrame:
    lowest_low = low.rolling(window=k).min()
    highest_high = high.rolling(window=k).max()
    stoch_k = 100.0 * (close - lowest_low) / (highest_high - lowest_low)
    stoch_d = stoch_k.rolling(window=d).mean()
    return pd.DataFrame({"stochk": stoch_k, "stochd": stoch_d})


def _bbands(series: pd.Series, length: int, std: float) -> pd.DataFrame:
    mid = series.rolling(window=length).mean()
    std_dev = series.rolling(window=length).std()
    upper = mid + std * std_dev
    lower = mid - std * std_dev
    return pd.DataFrame({"bbu": upper, "bbm": mid, "bbl": lower})


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, length: int) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1.0 / length, min_periods=length, adjust=False).mean()


def _obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    sign = np.sign(close.diff()).fillna(0)
    return (sign * volume).cumsum()


def _vwap(high: pd.Series, low: pd.Series, close: pd.Series, volume: pd.Series) -> pd.Series:
    typical_price = (high + low + close) / 3.0
    return (typical_price * volume).cumsum() / volume.cumsum()


def _fractals(high: pd.Series, low: pd.Series, period: int) -> pd.DataFrame:
    """Williams Fractals: local high/low over a centered window of `period` bars.
    period must be odd; n = (period-1)//2 bars on each side."""
    if period % 2 == 0:
        period += 1
    n = (period - 1) // 2
    fractal_up = pd.Series(np.nan, index=high.index)
    fractal_down = pd.Series(np.nan, index=low.index)

    for i in range(n, len(high) - n):
        window_high = high.iloc[i - n : i + n + 1]
        if high.iloc[i] == window_high.max():
            fractal_up.iloc[i] = float(high.iloc[i])

        window_low = low.iloc[i - n : i + n + 1]
        if low.iloc[i] == window_low.min():
            fractal_down.iloc[i] = float(low.iloc[i])

    return pd.DataFrame({"fractal_up": fractal_up, "fractal_down": fractal_down})


def _compute_indicator(df, ind: IndicatorRequest) -> IndicatorSeries:
    """Calcula un indicador sobre un DataFrame OHLCV y devuelve sus series."""
    name = ind.name.upper()
    params = ind.params

    if name not in _CATALOG_NAMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Indicador '{ind.name}' no está en el catálogo",
        )

    series_data: dict[str, list[float | None]] = {}

    if name == "SMA":
        length = int(params.get("length", 20))
        result = _sma(df["Close"], length)
        series_data["sma"] = _series_to_list(result)

    elif name == "EMA":
        length = int(params.get("length", 20))
        result = _ema(df["Close"], length)
        series_data["ema"] = _series_to_list(result)

    elif name == "MACD":
        fast = int(params.get("fast", 12))
        slow = int(params.get("slow", 26))
        signal = int(params.get("signal", 9))
        result = _macd(df["Close"], fast, slow, signal)
        for col in result.columns:
            series_data[col] = _series_to_list(result[col])

    elif name == "RSI":
        length = int(params.get("length", 14))
        result = _rsi(df["Close"], length)
        series_data["rsi"] = _series_to_list(result)

    elif name == "STOCH":
        k = int(params.get("k", 14))
        d = int(params.get("d", 3))
        result = _stoch(df["High"], df["Low"], df["Close"], k, d)
        for col in result.columns:
            series_data[col] = _series_to_list(result[col])

    elif name == "BBANDS":
        length = int(params.get("length", 20))
        std = float(params.get("std", 2.0))
        result = _bbands(df["Close"], length, std)
        for col in result.columns:
            series_data[col] = _series_to_list(result[col])

    elif name == "ATR":
        length = int(params.get("length", 14))
        result = _atr(df["High"], df["Low"], df["Close"], length)
        series_data["atr"] = _series_to_list(result)

    elif name == "OBV":
        result = _obv(df["Close"], df["Volume"])
        series_data["obv"] = _series_to_list(result)

    elif name == "VWAP":
        result = _vwap(df["High"], df["Low"], df["Close"], df["Volume"])
        series_data["vwap"] = _series_to_list(result)

    elif name == "FRACTALS":
        period = int(params.get("period", 21))
        result = _fractals(df["High"], df["Low"], period)
        for col in result.columns:
            series_data[col] = _series_to_list(result[col])

    return IndicatorSeries(name=ind.name, params=ind.params, data=series_data)


def calculate_indicators(
    ticker: str,
    period: str,
    interval: str,
    indicators: list[IndicatorRequest],
) -> CalculateResponse:
    """Descarga datos y calcula múltiples indicadores."""
    tk = yf.Ticker(ticker)
    df = tk.history(period=period, interval=interval)

    if df.empty:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sin datos para '{ticker}'",
        )

    results = [_compute_indicator(df, ind) for ind in indicators]

    # Return dates so frontend can align indicator data with chart times
    dates = [dt.isoformat() for dt in df.index]

    return CalculateResponse(
        ticker=ticker.upper(),
        period=period,
        interval=interval,
        indicators=results,
        dates=dates,
    )


def _series_to_list(series) -> list[float | None]:
    """Convierte una pandas Series a lista, reemplazando NaN por None."""
    return [None if v != v else round(v, 4) for v in series.tolist()]
