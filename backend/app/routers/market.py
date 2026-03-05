from fastapi import APIRouter, Query, HTTPException

from ..schemas.market import (
    DetailedQuoteResponse,
    HistoryQuery,
    HistoryResponse,
    QuoteResponse,
    ScreenerFilters,
    ScreenerResponse,
    TickerSearchResult,
)
from ..services import market_service

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/search", response_model=list[TickerSearchResult])
def search(q: str = Query(min_length=1, max_length=50, description="Texto de búsqueda")):
    return market_service.search_tickers(q)


@router.get("/quote/{ticker}", response_model=QuoteResponse)
def quote(ticker: str):
    return market_service.get_quote(ticker)


@router.get("/history/{ticker}", response_model=HistoryResponse)
def history(
    ticker: str,
    period: str = Query(
        default="1mo",
        pattern=r"^(1d|5d|1mo|3mo|6mo|1y|5y|max)$",
    ),
    interval: str = Query(
        default="1d",
        pattern=r"^(1m|5m|15m|30m|1h|1d|1wk|1mo)$",
    ),
):
    # Validate period-interval combination
    try:
        HistoryQuery(period=period, interval=interval)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return market_service.get_history(ticker, period, interval)


@router.get("/detailed-quote/{ticker}", response_model=DetailedQuoteResponse)
def detailed_quote(ticker: str):
    return market_service.get_detailed_quote(ticker)


@router.post("/screener", response_model=ScreenerResponse)
def screener(filters: ScreenerFilters = ScreenerFilters()):
    return market_service.get_screener(filters)


@router.get("/screener/sectors/{universe}")
def screener_sectors(universe: str):
    return {"sectors": market_service.get_screener_sectors(universe)}
