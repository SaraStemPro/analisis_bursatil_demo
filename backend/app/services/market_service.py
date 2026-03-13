import logging
import math
import threading
import time
from concurrent.futures import Future

import numpy as np
import yfinance as yf

logger = logging.getLogger(__name__)
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


# ============================================================================
# Cache layer — all TTLs generous for educational use (not real-time trading)
# ============================================================================
_screener_cache: dict[str, tuple[float, list[DetailedQuoteResponse]]] = {}
_SCREENER_TTL = 300  # 5 minutes

_info_cache: dict[str, tuple[float, dict]] = {}
_INFO_TTL = 1800  # 30 minutes

_volatility_cache: dict[str, tuple[float, dict[str, float]]] = {}
_VOLATILITY_TTL = 300  # 5 minutes

_quote_cache: dict[str, tuple[float, QuoteResponse]] = {}
_QUOTE_TTL = 300  # 5 minutes

_history_cache: dict[str, tuple[float, HistoryResponse]] = {}
_HISTORY_TTL = 600  # 10 minutes

# ============================================================================
# Request coalescing — prevents duplicate Yahoo calls for the same resource
# When multiple users request the same ticker simultaneously, only ONE call
# goes to Yahoo. The rest wait for that single result.
# ============================================================================
_inflight: dict[str, Future] = {}
_inflight_lock = threading.Lock()


def _coalesced_call(key: str, fn):
    """Execute fn() with request coalescing: if another thread is already
    fetching the same key, wait for its result instead of calling Yahoo again."""
    is_caller = False
    with _inflight_lock:
        if key in _inflight:
            # Another thread is already fetching this — just grab its future
            future = _inflight[key]
        else:
            # We're the first — create a future and register it
            future = Future()
            _inflight[key] = future
            is_caller = True

    if is_caller:
        try:
            result = fn()
            future.set_result(result)
        except Exception as e:
            future.set_exception(e)
        finally:
            with _inflight_lock:
                _inflight.pop(key, None)

    # All threads (including the caller) get the result from the same future
    return future.result(timeout=30)


# Background cache warmer — tracks which tickers users are viewing
_active_tickers: set[str] = set()
_warmer_running = False


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

INDICES_TICKERS = [
    "^GSPC", "^DJI", "^IXIC", "^RUT", "^VIX", "^FTSE", "^GDAXI", "^FCHI",
    "^N225", "^HSI", "^STOXX50E", "^IBEX",
]

CURRENCIES_TICKERS = [
    "EURUSD=X", "GBPUSD=X", "USDJPY=X", "USDCHF=X", "AUDUSD=X", "USDCAD=X",
    "NZDUSD=X", "EURGBP=X", "EURJPY=X", "GBPJPY=X",
]

COMMODITIES_TICKERS = [
    "GC=F", "SI=F", "CL=F", "NG=F", "HG=F", "PL=F",
    "ZW=F", "ZC=F", "ZS=F", "KC=F", "CT=F", "SB=F",
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
    "indices": INDICES_TICKERS,
    "currencies": CURRENCIES_TICKERS,
    "commodities": COMMODITIES_TICKERS,
    "all": list(set(SP500_TICKERS + IBEX35_TICKERS + TECH_TICKERS + HEALTHCARE_TICKERS + FINANCE_TICKERS + ENERGY_TICKERS + INDUSTRIALS_TICKERS + CONSUMER_TICKERS + INDICES_TICKERS + CURRENCIES_TICKERS + COMMODITIES_TICKERS)),
}


def _calculate_volatilities(tickers: list[str]) -> dict[str, float]:
    """Batch-calculate annualized volatility for a list of tickers.

    Returns dict mapping ticker -> annualized volatility as a decimal (e.g. 0.25 = 25%).
    Uses yf.download for efficiency. Results are cached.
    """
    now = time.time()
    cache_key = ",".join(sorted(tickers))
    if cache_key in _volatility_cache:
        cached_time, cached_data = _volatility_cache[cache_key]
        if now - cached_time < _VOLATILITY_TTL:
            return cached_data

    result: dict[str, float] = {}
    try:
        df = yf.download(tickers, period="1y", interval="1d", progress=False, threads=True)
        if df.empty:
            return result

        if len(tickers) == 1:
            close = df["Close"].dropna()
            if len(close) > 1:
                log_returns = np.log(close / close.shift(1)).dropna()
                vol = float(log_returns.std() * math.sqrt(252))
                result[tickers[0]] = round(vol, 4)
        else:
            close = df["Close"] if "Close" in df.columns else df.get("Close")
            if close is not None:
                for ticker in tickers:
                    try:
                        series = close[ticker].dropna()
                        if len(series) > 1:
                            log_returns = np.log(series / series.shift(1)).dropna()
                            vol = float(log_returns.std() * math.sqrt(252))
                            result[ticker] = round(vol, 4)
                    except (KeyError, TypeError):
                        continue
    except Exception:
        pass

    if result:
        _volatility_cache[cache_key] = (now, result)
    return result


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
    cache_key = ticker.upper()
    cached = _quote_cache.get(cache_key)
    if cached and time.time() - cached[0] < _QUOTE_TTL:
        return cached[1]

    try:
        info = _coalesced_call(f"quote:{cache_key}", lambda: yf.Ticker(ticker).info)
    except Exception as e:
        if cached:
            logger.warning(f"Yahoo error for quote {ticker}, returning stale cache: {e}")
            return cached[1]
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Servicio de datos temporalmente no disponible. Inténtalo de nuevo en unos segundos.",
        )

    if not info or info.get("trailingPegRatio") is None and info.get("regularMarketPrice") is None:
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

    result = QuoteResponse(
        symbol=info.get("symbol", ticker.upper()),
        name=info.get("shortName") or info.get("longName", ticker.upper()),
        price=price,
        change=round(change, 2),
        change_percent=round(change_pct, 2),
        currency=info.get("currency", "USD"),
        market_state=info.get("marketState", "UNKNOWN"),
        exchange=info.get("exchange", ""),
    )
    _quote_cache[cache_key] = (time.time(), result)
    return result


def get_history(ticker: str, period: str, interval: str) -> HistoryResponse:
    """Obtiene datos OHLCV históricos de un ticker."""
    cache_key = f"{ticker.upper()}:{period}:{interval}"
    cached = _history_cache.get(cache_key)
    if cached and time.time() - cached[0] < _HISTORY_TTL:
        return cached[1]

    try:
        df = _coalesced_call(
            f"history:{cache_key}",
            lambda: yf.Ticker(ticker).history(period=period, interval=interval),
        )
    except Exception as e:
        if cached:
            logger.warning(f"Yahoo error for history {ticker}, returning stale cache: {e}")
            return cached[1]
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Servicio de datos temporalmente no disponible. Inténtalo de nuevo en unos segundos.",
        )

    if df.empty:
        if cached:
            logger.warning(f"Empty history for {ticker}, returning stale cache")
            return cached[1]
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

    result = HistoryResponse(
        symbol=ticker.upper(),
        period=period,
        interval=interval,
        data=data,
    )
    _history_cache[cache_key] = (time.time(), result)
    return result


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

    # Enrich with volatility data
    if stocks:
        volatilities = _calculate_volatilities(tickers)
        for stock in stocks:
            stock.volatility = volatilities.get(stock.symbol)

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

    if filters.volatility_min is not None:
        result = [s for s in result if s.volatility and s.volatility >= filters.volatility_min]

    if filters.volatility_max is not None:
        result = [s for s in result if s.volatility is not None and s.volatility <= filters.volatility_max]

    if filters.roe_min is not None:
        result = [s for s in result if s.roe and s.roe >= filters.roe_min]

    if filters.roe_max is not None:
        result = [s for s in result if s.roe is not None and s.roe <= filters.roe_max]

    return result


def _get_cached_info(ticker: str) -> dict:
    """Get yfinance .info with caching. Empty results are NOT cached."""
    now = time.time()
    if ticker in _info_cache:
        cached_time, cached_info = _info_cache[ticker]
        if now - cached_time < _INFO_TTL:
            return cached_info

    try:
        info = _coalesced_call(f"info:{ticker}", lambda: yf.Ticker(ticker).info or {})
    except Exception:
        info = {}

    # Only cache non-empty results to avoid poisoning cache with failures
    if info and info.get("regularMarketPrice"):
        _info_cache[ticker] = (now, info)
    return info


# ============================================================================
# Background cache warmer — refreshes active tickers using batch download
# ============================================================================

def track_ticker(ticker: str):
    """Register a ticker as actively viewed. Called from route handlers."""
    _active_tickers.add(ticker.upper())


def _warm_quotes_batch(tickers: list[str]):
    """Batch-refresh quotes using yf.download (1 HTTP request for N tickers)."""
    if not tickers:
        return
    try:
        df = yf.download(tickers, period="2d", interval="1d", progress=False, threads=True)
        if df.empty:
            return

        if len(tickers) == 1:
            t = tickers[0]
            if "Close" in df.columns and len(df) > 0:
                row = df.iloc[-1]
                prev_row = df.iloc[-2] if len(df) > 1 else row
                price = float(row["Close"])
                prev = float(prev_row["Close"])
                change = price - prev
                pct = (change / prev * 100) if prev else 0
                cached = _quote_cache.get(t)
                _quote_cache[t] = (time.time(), QuoteResponse(
                    symbol=t,
                    name=cached[1].name if cached else t,
                    price=round(price, 4),
                    change=round(change, 4),
                    change_percent=round(pct, 2),
                    currency=cached[1].currency if cached else "USD",
                    market_state=cached[1].market_state if cached else "REGULAR",
                    exchange=cached[1].exchange if cached else "",
                ))
        else:
            close = df["Close"] if "Close" in df.columns else None
            if close is not None:
                for t in tickers:
                    try:
                        series = close[t].dropna()
                        if len(series) < 1:
                            continue
                        price = float(series.iloc[-1])
                        prev = float(series.iloc[-2]) if len(series) > 1 else price
                        change = price - prev
                        pct = (change / prev * 100) if prev else 0
                        cached = _quote_cache.get(t)
                        _quote_cache[t] = (time.time(), QuoteResponse(
                            symbol=t,
                            name=cached[1].name if cached else t,
                            price=round(price, 4),
                            change=round(change, 4),
                            change_percent=round(pct, 2),
                            currency=cached[1].currency if cached else "USD",
                            market_state=cached[1].market_state if cached else "REGULAR",
                            exchange=cached[1].exchange if cached else "",
                        ))
                    except (KeyError, TypeError, IndexError):
                        continue
        logger.info(f"Cache warmer: refreshed {len(tickers)} tickers via batch download")
    except Exception as e:
        logger.warning(f"Cache warmer batch error: {e}")


def _cache_warmer_loop():
    """Background thread that periodically refreshes active ticker caches."""
    global _warmer_running
    _warmer_running = True
    logger.info("Cache warmer started")
    while _warmer_running:
        try:
            now = time.time()
            # Collect tickers whose quote cache is about to expire (>80% of TTL)
            stale_tickers = []
            for t in list(_active_tickers):
                cached = _quote_cache.get(t)
                if not cached or (now - cached[0]) > _QUOTE_TTL * 0.8:
                    stale_tickers.append(t)

            if stale_tickers:
                _warm_quotes_batch(stale_tickers)

            # Pre-warm history for active tickers (3mo/1d is the default view)
            for t in list(_active_tickers):
                cache_key = f"{t}:3mo:1d"
                cached = _history_cache.get(cache_key)
                if not cached or (now - cached[0]) > _HISTORY_TTL * 0.8:
                    try:
                        df = yf.Ticker(t).history(period="3mo", interval="1d")
                        if not df.empty:
                            df = df.dropna(subset=["Open", "High", "Low", "Close"])
                            data = [
                                OHLCV(
                                    date=idx.to_pydatetime(),
                                    open=round(row["Open"], 4),
                                    high=round(row["High"], 4),
                                    low=round(row["Low"], 4),
                                    close=round(row["Close"], 4),
                                    volume=int(row["Volume"]),
                                )
                                for idx, row in df.iterrows()
                            ]
                            _history_cache[cache_key] = (time.time(), HistoryResponse(
                                symbol=t, period="3mo", interval="1d", data=data,
                            ))
                        time.sleep(1)  # space out individual history fetches
                    except Exception:
                        continue

            # Clean tickers not accessed in last 30 minutes
            for t in list(_active_tickers):
                cached = _quote_cache.get(t)
                if cached and (now - cached[0]) > 1800:
                    _active_tickers.discard(t)

        except Exception as e:
            logger.warning(f"Cache warmer error: {e}")

        # Sleep 3 minutes between warming cycles
        time.sleep(180)


def start_cache_warmer():
    """Start the background cache warmer thread."""
    if _warmer_running:
        return
    t = threading.Thread(target=_cache_warmer_loop, daemon=True, name="cache-warmer")
    t.start()
