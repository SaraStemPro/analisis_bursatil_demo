import time

import yfinance as yf
from fastapi import HTTPException, status

from ..schemas.market import (
    DetailedQuoteResponse,
    HistoryResponse,
    OHLCV,
    QuoteResponse,
    ScreenerFilters,
    ScreenerResponse,
    TickerSearchResult,
)


# --- Screener cache ---
_screener_cache: dict[str, tuple[float, list[DetailedQuoteResponse]]] = {}
_SCREENER_TTL = 300  # 5 minutes

_info_cache: dict[str, tuple[float, dict]] = {}
_INFO_TTL = 1800  # 30 minutes

# Universe of tickers for screening
SP500_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B",
    "JPM", "V", "UNH", "MA", "HD", "PG", "JNJ", "COST", "ABBV", "MRK",
    "BAC", "KO", "PEP", "AVGO", "ADBE", "CRM", "TMO", "NFLX", "AMD",
    "LIN", "ORCL", "ACN", "WMT", "DIS", "CSCO", "VZ", "INTC", "IBM",
    "GS", "MS", "C", "WFC", "BLK", "SCHW", "AXP", "USB",
    "XOM", "CVX", "COP", "SLB", "EOG", "MPC",
    "LLY", "PFE", "ABT", "DHR", "BMY", "GILD", "AMGN", "MDT",
    "CAT", "DE", "HON", "GE", "RTX", "BA", "UPS", "LMT",
    "NEE", "DUK", "SO", "D", "AEP",
    "PLD", "AMT", "CCI", "EQIX", "SPG",
    "NKE", "SBUX", "MCD", "TGT", "LOW",
    # Additional S&P 500 names
    "QCOM", "TXN", "INTU", "NOW", "ISRG", "PANW", "ANET", "SNPS",
    "UBER", "ABNB", "PYPL", "SQ", "COIN", "MELI", "SE",
    "T", "CMCSA", "TMUS", "CHTR",
    "CVS", "CI", "HUM", "ELV", "MCK",
    "FDX", "CSX", "NSC", "UNP",
    "AIG", "TRV", "ALL", "PGR", "MET",
    "CL", "KMB", "GIS", "K", "HSY", "MDLZ", "SJM",
    "F", "GM", "RIVN",
    "DASH", "ZM", "CRWD", "DDOG", "ZS", "NET",
]

IBEX35_TICKERS = [
    "SAN.MC", "BBVA.MC", "ITX.MC", "IBE.MC", "TEF.MC", "AMS.MC",
    "CABK.MC", "FER.MC", "REP.MC", "GRF.MC", "ACS.MC", "MAP.MC",
    "ENG.MC", "RED.MC", "CLNX.MC", "IAG.MC", "SAB.MC", "BKT.MC",
    "MTS.MC", "ACX.MC", "MEL.MC", "COL.MC", "LOG.MC",
    # Complete IBEX 35
    "AENA.MC", "NTGY.MC", "FDR.MC", "SGRE.MC", "PHM.MC",
    "VIS.MC", "ROVI.MC", "SLR.MC", "UNI.MC", "CIE.MC",
    "IDR.MC", "ALM.MC",
]

TECH_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO",
    "ADBE", "CRM", "ORCL", "ACN", "CSCO", "INTC", "IBM", "AMD",
    "QCOM", "TXN", "INTU", "NOW", "ISRG", "PANW", "ANET", "SNPS",
    "NFLX", "UBER", "ABNB", "PYPL", "SQ", "COIN",
    "CRWD", "DDOG", "ZS", "NET", "DASH", "ZM",
    "SAP", "ASML", "TSM", "SHOP", "MELI", "SE",
]

HEALTHCARE_TICKERS = [
    "LLY", "UNH", "JNJ", "PFE", "ABT", "TMO", "DHR", "BMY",
    "GILD", "AMGN", "MDT", "ABBV", "MRK", "CVS", "CI",
    "HUM", "ELV", "MCK", "ISRG", "SYK", "BSX", "BDX",
    "ZTS", "REGN", "VRTX", "BIIB", "MRNA", "DXCM",
]

FINANCE_TICKERS = [
    "JPM", "V", "MA", "BAC", "GS", "MS", "C", "WFC",
    "BLK", "SCHW", "AXP", "USB", "PGR", "MET", "AIG",
    "TRV", "ALL", "SPGI", "MCO", "ICE", "CME", "COIN",
    "PYPL", "SQ", "BRK-B", "CB", "MMC", "AON",
]

ENERGY_TICKERS = [
    "XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO",
    "OXY", "HAL", "DVN", "FANG", "HES", "BKR", "KMI",
    "WMB", "OKE", "TRGP", "ET", "EPD",
]

INDUSTRIALS_TICKERS = [
    "CAT", "DE", "HON", "GE", "RTX", "BA", "UPS", "LMT",
    "FDX", "CSX", "NSC", "UNP", "MMM", "EMR", "ITW",
    "WM", "RSG", "JCI", "ROK", "CARR", "OTIS", "GD", "NOC",
]

CONSUMER_TICKERS = [
    "NKE", "SBUX", "MCD", "TGT", "LOW", "HD", "WMT",
    "COST", "KO", "PEP", "PG", "CL", "KMB", "GIS",
    "K", "HSY", "MDLZ", "DIS", "ABNB", "DASH", "F", "GM",
]

UNIVERSES: dict[str, list[str]] = {
    "sp500": SP500_TICKERS,
    "ibex35": IBEX35_TICKERS,
    "tech": TECH_TICKERS,
    "healthcare": HEALTHCARE_TICKERS,
    "finance": FINANCE_TICKERS,
    "energy": ENERGY_TICKERS,
    "industrials": INDUSTRIALS_TICKERS,
    "consumer": CONSUMER_TICKERS,
    "all": list(set(SP500_TICKERS + IBEX35_TICKERS + TECH_TICKERS + HEALTHCARE_TICKERS + FINANCE_TICKERS + ENERGY_TICKERS + INDUSTRIALS_TICKERS + CONSUMER_TICKERS)),
}


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

    # Filter rows with NaN OHLC values (e.g. dividend-only records)
    df = df.dropna(subset=["Open", "High", "Low", "Close"])

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


def get_detailed_quote(ticker: str) -> DetailedQuoteResponse:
    """Get detailed quote with fundamentals (sector, market cap, etc.)."""
    info = _get_cached_info(ticker)
    return _info_to_detailed_quote(info, ticker)


def get_screener(filters: ScreenerFilters) -> ScreenerResponse:
    """Get screener data with filters applied server-side."""
    universe_name = filters.universe
    tickers = UNIVERSES.get(universe_name, SP500_TICKERS)

    # Check cache for the universe
    now = time.time()
    cache_key = universe_name
    if cache_key in _screener_cache:
        cached_time, cached_data = _screener_cache[cache_key]
        if now - cached_time < _SCREENER_TTL:
            filtered = _apply_filters(cached_data, filters)
            return ScreenerResponse(
                universe=universe_name,
                total=len(cached_data),
                filtered=len(filtered),
                stocks=filtered,
            )

    # Fetch all data for the universe
    stocks: list[DetailedQuoteResponse] = []
    for ticker in tickers:
        try:
            info = _get_cached_info(ticker)
            if not info or not info.get("regularMarketPrice"):
                continue
            stocks.append(_info_to_detailed_quote(info, ticker))
        except Exception:
            continue

    # Only cache if we got results — avoid poisoning cache with empty data
    if stocks:
        _screener_cache[cache_key] = (now, stocks)
    filtered = _apply_filters(stocks, filters)

    return ScreenerResponse(
        universe=universe_name,
        total=len(stocks),
        filtered=len(filtered),
        stocks=filtered,
    )


def get_screener_sectors(universe: str) -> list[str]:
    """Get available sectors for a universe."""
    tickers = UNIVERSES.get(universe, SP500_TICKERS)
    sectors = set()
    for ticker in tickers:
        info = _get_cached_info(ticker)
        sector = info.get("sector")
        if sector:
            sectors.add(sector)
    return sorted(sectors)


def _info_to_detailed_quote(info: dict, ticker: str) -> DetailedQuoteResponse:
    """Convert yfinance info dict to DetailedQuoteResponse."""
    price = info.get("regularMarketPrice") or info.get("currentPrice", 0)
    prev_close = info.get("regularMarketPreviousClose") or info.get("previousClose", price)
    change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0

    return DetailedQuoteResponse(
        symbol=info.get("symbol", ticker.upper()),
        name=info.get("shortName") or info.get("longName", ticker.upper()),
        price=round(price, 2) if price else 0,
        change_percent=round(change_pct, 2),
        market_cap=info.get("marketCap"),
        sector=info.get("sector"),
        industry=info.get("industry"),
        pe_ratio=info.get("trailingPE"),
        forward_pe=info.get("forwardPE"),
        peg_ratio=info.get("pegRatio"),
        price_to_book=info.get("priceToBook"),
        dividend_yield=info.get("dividendYield"),
        profit_margin=info.get("profitMargins"),
        roe=info.get("returnOnEquity"),
        revenue_growth=info.get("revenueGrowth"),
        debt_to_equity=info.get("debtToEquity"),
        beta=info.get("beta"),
        fifty_two_week_high=info.get("fiftyTwoWeekHigh"),
        fifty_two_week_low=info.get("fiftyTwoWeekLow"),
        avg_volume=info.get("averageVolume"),
    )


def _apply_filters(
    stocks: list[DetailedQuoteResponse], filters: ScreenerFilters
) -> list[DetailedQuoteResponse]:
    """Apply filters to a list of stocks."""
    result = stocks

    if filters.sectors:
        result = [s for s in result if s.sector in filters.sectors]

    if filters.market_cap_min is not None:
        min_val = filters.market_cap_min * 1e9
        result = [s for s in result if s.market_cap and s.market_cap >= min_val]

    if filters.market_cap_max is not None:
        max_val = filters.market_cap_max * 1e9
        result = [s for s in result if s.market_cap and s.market_cap <= max_val]

    if filters.pe_min is not None:
        result = [s for s in result if s.pe_ratio and s.pe_ratio >= filters.pe_min]

    if filters.pe_max is not None:
        result = [s for s in result if s.pe_ratio and s.pe_ratio <= filters.pe_max]

    if filters.dividend_min is not None:
        result = [s for s in result if s.dividend_yield and s.dividend_yield >= filters.dividend_min / 100]

    if filters.dividend_max is not None:
        result = [s for s in result if s.dividend_yield is not None and s.dividend_yield <= filters.dividend_max / 100]

    if filters.price_min is not None:
        result = [s for s in result if s.price >= filters.price_min]

    if filters.price_max is not None:
        result = [s for s in result if s.price <= filters.price_max]

    if filters.change_min is not None:
        result = [s for s in result if s.change_percent >= filters.change_min]

    if filters.change_max is not None:
        result = [s for s in result if s.change_percent <= filters.change_max]

    if filters.beta_min is not None:
        result = [s for s in result if s.beta and s.beta >= filters.beta_min]

    if filters.beta_max is not None:
        result = [s for s in result if s.beta and s.beta <= filters.beta_max]

    return result


def _get_cached_info(ticker: str) -> dict:
    """Get yfinance .info with caching. Empty results are NOT cached."""
    now = time.time()
    if ticker in _info_cache:
        cached_time, cached_info = _info_cache[ticker]
        if now - cached_time < _INFO_TTL:
            return cached_info

    try:
        info = yf.Ticker(ticker).info or {}
    except Exception:
        info = {}

    # Only cache non-empty results to avoid poisoning cache with failures
    if info and info.get("regularMarketPrice"):
        _info_cache[ticker] = (now, info)
    return info
