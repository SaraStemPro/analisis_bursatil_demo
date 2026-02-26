from fastapi import APIRouter, Query

from ..schemas.market import HistoryResponse, QuoteResponse, TickerSearchResult
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
    return market_service.get_history(ticker, period, interval)
