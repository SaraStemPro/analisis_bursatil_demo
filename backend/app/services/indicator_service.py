import yfinance as yf
import pandas_ta as ta
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
]

_CATALOG_NAMES = {ind.name for ind in CATALOG}


def get_catalog() -> CatalogResponse:
    return CatalogResponse(indicators=CATALOG)


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
        result = ta.sma(df["Close"], length=length)
        series_data["sma"] = _series_to_list(result)

    elif name == "EMA":
        length = int(params.get("length", 20))
        result = ta.ema(df["Close"], length=length)
        series_data["ema"] = _series_to_list(result)

    elif name == "MACD":
        fast = int(params.get("fast", 12))
        slow = int(params.get("slow", 26))
        signal = int(params.get("signal", 9))
        result = ta.macd(df["Close"], fast=fast, slow=slow, signal=signal)
        for col in result.columns:
            key = col.split("_")[0].lower()
            series_data[key] = _series_to_list(result[col])

    elif name == "RSI":
        length = int(params.get("length", 14))
        result = ta.rsi(df["Close"], length=length)
        series_data["rsi"] = _series_to_list(result)

    elif name == "STOCH":
        k = int(params.get("k", 14))
        d = int(params.get("d", 3))
        result = ta.stoch(df["High"], df["Low"], df["Close"], k=k, d=d)
        for col in result.columns:
            key = col.split("_")[0].lower()
            series_data[key] = _series_to_list(result[col])

    elif name == "BBANDS":
        length = int(params.get("length", 20))
        std = float(params.get("std", 2.0))
        result = ta.bbands(df["Close"], length=length, std=std)
        for col in result.columns:
            key = col.split("_")[0].lower()
            series_data[key] = _series_to_list(result[col])

    elif name == "ATR":
        length = int(params.get("length", 14))
        result = ta.atr(df["High"], df["Low"], df["Close"], length=length)
        series_data["atr"] = _series_to_list(result)

    elif name == "OBV":
        result = ta.obv(df["Close"], df["Volume"])
        series_data["obv"] = _series_to_list(result)

    elif name == "VWAP":
        result = ta.vwap(df["High"], df["Low"], df["Close"], df["Volume"])
        series_data["vwap"] = _series_to_list(result)

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

    return CalculateResponse(
        ticker=ticker.upper(),
        period=period,
        interval=interval,
        indicators=results,
    )


def _series_to_list(series) -> list[float | None]:
    """Convierte una pandas Series a lista, reemplazando NaN por None."""
    return [None if v != v else round(v, 4) for v in series.tolist()]
