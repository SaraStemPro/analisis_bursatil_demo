from datetime import datetime
from typing import Literal

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


class DetailedQuoteResponse(BaseModel):
    symbol: str
    name: str
    price: float
    change_percent: float
    market_cap: float | None = None
    sector: str | None = None
    industry: str | None = None
    pe_ratio: float | None = None
    forward_pe: float | None = None
    peg_ratio: float | None = None
    price_to_book: float | None = None
    dividend_yield: float | None = None
    profit_margin: float | None = None
    roe: float | None = None
    revenue_growth: float | None = None
    debt_to_equity: float | None = None
    beta: float | None = None
    fifty_two_week_high: float | None = None
    fifty_two_week_low: float | None = None
    avg_volume: float | None = None
    volatility: float | None = None
    return_1y: float | None = None
    return_3y: float | None = None
    max_drawdown: float | None = None  # positive decimal, p.ej. 0.32 = -32% peor caida


class ScreenerFilters(BaseModel):
    universe: str = Field(default="sp500", pattern=r"^(sp500|ibex35|tech|healthcare|finance|energy|industrials|consumer|indices|futures|europa_etfs|currencies|commodities|all)$")
    sectors: list[str] | None = None
    market_cap_min: float | None = None  # in billions
    market_cap_max: float | None = None
    pe_min: float | None = None
    pe_max: float | None = None
    dividend_min: float | None = None
    dividend_max: float | None = None
    price_min: float | None = None
    price_max: float | None = None
    change_min: float | None = None  # % change
    change_max: float | None = None
    beta_min: float | None = None
    beta_max: float | None = None
    volatility_min: float | None = None
    volatility_max: float | None = None
    roe_min: float | None = None
    roe_max: float | None = None
    mdd_min: float | None = None  # decimal positivo (ej. 0.10 = 10%)
    mdd_max: float | None = None


class ScreenerResponse(BaseModel):
    universe: str
    total: int
    filtered: int
    stocks: list[DetailedQuoteResponse]


# --- Correlation analysis ---

CorrelationPeriod = Literal["3mo", "6mo", "1y", "2y", "5y"]


class CorrelationRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=2, max_length=30)
    period: CorrelationPeriod = "6mo"
    weights: list[float] | None = None

    @model_validator(mode="after")
    def _validate(self):
        seen: set[str] = set()
        cleaned: list[str] = []
        for t in self.tickers:
            tu = t.strip().upper()
            if not tu or tu in seen:
                continue
            seen.add(tu)
            cleaned.append(tu)
        if len(cleaned) < 2:
            raise ValueError("Se requieren al menos 2 tickers únicos")
        self.tickers = cleaned
        if self.weights is not None:
            if len(self.weights) != len(self.tickers):
                raise ValueError("weights debe tener la misma longitud que tickers")
            if any(w < 0 for w in self.weights):
                raise ValueError("weights no puede contener valores negativos")
            total = sum(self.weights)
            if total <= 0:
                raise ValueError("La suma de weights debe ser positiva")
            self.weights = [w / total for w in self.weights]
        return self


class CorrelationPair(BaseModel):
    a: str
    b: str
    correlation: float

    model_config = {"from_attributes": True}


class CorrelationResponse(BaseModel):
    tickers: list[str]
    period: str
    matrix: list[list[float]]
    avg_correlation: float
    max_pair: CorrelationPair
    min_pair: CorrelationPair
    individual_volatilities: list[float]
    portfolio_volatility: float
    weighted_avg_volatility: float
    diversification_ratio: float
    weights: list[float]
    n_observations: int
    missing_tickers: list[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}
