from datetime import datetime

from pydantic import BaseModel, Field


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
