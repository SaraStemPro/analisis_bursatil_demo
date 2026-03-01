from datetime import datetime

from pydantic import BaseModel, Field, model_validator


# Máximo período permitido por Yahoo Finance para cada intervalo intradiario
_MAX_PERIOD_DAYS: dict[str, int] = {
    "1m": 7,
    "5m": 60,
    "15m": 60,
    "30m": 60,
    "1h": 730,
}

_PERIOD_TO_DAYS: dict[str, int] = {
    "1d": 1,
    "5d": 5,
    "1mo": 30,
    "3mo": 90,
    "6mo": 180,
    "1y": 365,
    "5y": 1825,
    "max": 99999,
}


# --- Requests ---

class HistoryQuery(BaseModel):
    period: str = Field(
        default="1mo",
        pattern=r"^(1d|5d|1mo|3mo|6mo|1y|5y|max)$",
        description="Rango temporal: 1d, 5d, 1mo, 3mo, 6mo, 1y, 5y, max",
    )
    interval: str = Field(
        default="1d",
        pattern=r"^(1m|5m|15m|30m|1h|1d|1wk|1mo)$",
        description="Intervalo: 1m, 5m, 15m, 30m, 1h, 1d, 1wk, 1mo",
    )

    @model_validator(mode="after")
    def validate_period_interval(self) -> "HistoryQuery":
        max_days = _MAX_PERIOD_DAYS.get(self.interval)
        if max_days is not None:
            period_days = _PERIOD_TO_DAYS.get(self.period, 99999)
            if period_days > max_days:
                raise ValueError(
                    f"El intervalo '{self.interval}' solo admite un período de hasta "
                    f"{max_days} días. Reduce el período o aumenta el intervalo."
                )
        return self


# --- Responses ---

class TickerSearchResult(BaseModel):
    symbol: str
    name: str
    exchange: str
    type: str


class QuoteResponse(BaseModel):
    symbol: str
    name: str
    price: float
    change: float
    change_percent: float
    currency: str
    market_state: str
    exchange: str


class OHLCV(BaseModel):
    date: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int


class HistoryResponse(BaseModel):
    symbol: str
    period: str
    interval: str
    data: list[OHLCV]
