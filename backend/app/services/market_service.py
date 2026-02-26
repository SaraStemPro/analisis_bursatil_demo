import yfinance as yf
from fastapi import HTTPException, status

from ..schemas.market import HistoryResponse, OHLCV, QuoteResponse, TickerSearchResult


def search_tickers(query: str) -> list[TickerSearchResult]:
    """Busca tickers por nombre o símbolo usando yfinance."""
    try:
        results = yf.Search(query)
        quotes = results.quotes if hasattr(results, "quotes") else []
    except Exception:
        return []

    return [
        TickerSearchResult(
            symbol=q.get("symbol", ""),
            name=q.get("shortname") or q.get("longname", ""),
            exchange=q.get("exchange", ""),
            type=q.get("quoteType", ""),
        )
        for q in quotes
        if q.get("symbol")
    ]


def get_quote(ticker: str) -> QuoteResponse:
    """Obtiene cotización actual de un ticker."""
    tk = yf.Ticker(ticker)
    info = tk.info

    if not info or info.get("trailingPegRatio") is None and info.get("regularMarketPrice") is None:
        # yfinance devuelve un dict casi vacío si el ticker no existe
        price = info.get("regularMarketPrice") or info.get("currentPrice")
        if price is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Ticker '{ticker}' no encontrado",
            )

    price = info.get("regularMarketPrice") or info.get("currentPrice", 0)
    prev_close = info.get("regularMarketPreviousClose") or info.get("previousClose", price)
    change = price - prev_close if price and prev_close else 0
    change_pct = (change / prev_close * 100) if prev_close else 0

    return QuoteResponse(
        symbol=info.get("symbol", ticker.upper()),
        name=info.get("shortName") or info.get("longName", ticker.upper()),
        price=price,
        change=round(change, 2),
        change_percent=round(change_pct, 2),
        currency=info.get("currency", "USD"),
        market_state=info.get("marketState", "UNKNOWN"),
        exchange=info.get("exchange", ""),
    )


def get_history(ticker: str, period: str, interval: str) -> HistoryResponse:
    """Obtiene datos OHLCV históricos de un ticker."""
    tk = yf.Ticker(ticker)
    df = tk.history(period=period, interval=interval)

    if df.empty:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sin datos históricos para '{ticker}' con period={period}, interval={interval}",
        )

    data = [
        OHLCV(
            date=index.to_pydatetime(),
            open=round(row["Open"], 4),
            high=round(row["High"], 4),
            low=round(row["Low"], 4),
            close=round(row["Close"], 4),
            volume=int(row["Volume"]),
        )
        for index, row in df.iterrows()
    ]

    return HistoryResponse(
        symbol=ticker.upper(),
        period=period,
        interval=interval,
        data=data,
    )
