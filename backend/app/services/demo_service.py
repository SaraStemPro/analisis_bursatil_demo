import logging
import math
import threading
import time
from datetime import datetime, timezone
from decimal import Decimal

import yfinance as yf
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from ..models.order import Order
from ..models.portfolio import Portfolio
from ..models.user import User
from ..schemas.demo import (
    ClosePositionRequest,
    OrderCreateRequest,
    OrderResponse,
    PerformanceResponse,
    PortfolioResponse,
    PortfolioSummaryResponse,
    PositionResponse,
    SectorAllocation,
)


# --- Cache for sector info (rarely changes) ---
_sector_cache: dict[str, str | None] = {}

# --- Cache for ticker currency (never changes) ---
_currency_cache: dict[str, str] = {}

# --- Daily EUR/USD rate cache ---
_fx_rate_cache: dict[str, tuple[Decimal, float]] = {}  # {"EURUSD": (rate, timestamp)}
_FX_RATE_TTL = 86400  # 24 hours


def _get_ticker_currency(ticker: str) -> str:
    """Get the trading currency for a ticker (cached, never changes)."""
    t = ticker.upper()
    if t in _currency_cache:
        return _currency_cache[t]
    # Forex pairs and some indices don't have a meaningful "currency" for conversion
    if t.endswith("=X"):
        _currency_cache[t] = "USD"
        return "USD"
    try:
        info = yf.Ticker(t).info
        currency = info.get("currency", "USD")
        _currency_cache[t] = currency
        return currency
    except Exception:
        _currency_cache[t] = "USD"
        return "USD"


def _get_daily_fx_rate() -> Decimal:
    """Get daily EUR/USD rate. Cached 24h. Returns how many USD per 1 EUR."""
    cached = _fx_rate_cache.get("EURUSD")
    if cached:
        rate, ts = cached
        if time.time() - ts < _FX_RATE_TTL:
            return rate

    try:
        info = yf.Ticker("EURUSD=X").info
        price = info.get("regularMarketPrice") or info.get("currentPrice")
        if price:
            rate = Decimal(str(price))
            _fx_rate_cache["EURUSD"] = (rate, time.time())
            return rate
    except Exception:
        pass

    # Stale fallback
    if cached:
        return cached[0]
    # Ultimate fallback
    return Decimal("1.08")


def _needs_fx_conversion(ticker: str) -> bool:
    """Check if ticker trades in USD and needs EUR conversion."""
    currency = _get_ticker_currency(ticker)
    return currency == "USD"


def _usd_to_eur(usd_amount: Decimal, fx_rate: Decimal) -> Decimal:
    """Convert USD to EUR. fx_rate = USD per 1 EUR."""
    return usd_amount / fx_rate


def _eur_to_usd(eur_amount: Decimal, fx_rate: Decimal) -> Decimal:
    """Convert EUR to USD. fx_rate = USD per 1 EUR."""
    return eur_amount * fx_rate

# --- Spread & CFD/Futures margin ---
_SPREAD_PCT = Decimal("0.0001")  # 0.01% spread on all trades
_CFD_MARGIN_PCT = Decimal("0.05")  # 5% margin for indices, commodities, currencies

# Tickers that trade as CFDs/Futures (not spot)
_CFD_TICKERS = {
    # Indices
    "^GSPC", "^DJI", "^IXIC", "^RUT", "^VIX", "^FTSE", "^GDAXI", "^FCHI",
    "^N225", "^HSI", "^STOXX50E", "^IBEX",
    # Commodities
    "GC=F", "SI=F", "CL=F", "NG=F", "HG=F", "PL=F",
    "ZW=F", "ZC=F", "ZS=F", "KC=F", "CT=F", "SB=F",
    # Currencies (forex)
    "EURUSD=X", "GBPUSD=X", "USDJPY=X", "USDCHF=X", "AUDUSD=X", "USDCAD=X",
    "NZDUSD=X", "EURGBP=X", "EURJPY=X", "GBPJPY=X",
}


def _is_cfd(ticker: str) -> bool:
    """Check if ticker trades as CFD/Future (not spot)."""
    t = ticker.upper()
    return t in _CFD_TICKERS or t.endswith("=X") or t.endswith("=F") or t.startswith("^")


def _is_market_open(ticker: str) -> bool:
    """¿Está abierto el mercado del ticker AHORA? Determinista, no usa Yahoo.
    Lógica por sufijo:
    - `=X` (forex): 24/5, abierto domingo 22:00 UTC → viernes 22:00 UTC
    - `=F` (futuros US): igual que forex (CME 23h, parón 1h diaria ignorado)
    - `^IBEX` y `.MC` (BME): L-V 9:00-17:30 hora de Madrid
    - `^FCHI`, `^GDAXI`, `^STOXX50E` (Euronext/Eurex): L-V 9:00-17:30 CET
    - `^FTSE` (LSE): L-V 8:00-16:30 hora de Londres
    - Otros índices (^GSPC, ^DJI, ^IXIC, ^RUT, ^VIX): mercado USA
    - ETFs y stocks USA por defecto: NYSE/NASDAQ 9:30-16:00 hora de NY
    """
    import datetime
    try:
        from zoneinfo import ZoneInfo
    except ImportError:  # py < 3.9 fallback
        from pytz import timezone as ZoneInfo  # type: ignore
    t = ticker.upper()
    now_utc = datetime.datetime.now(datetime.timezone.utc)

    # Forex y futuros: 24/5 (lun-vie casi continuo)
    if t.endswith("=X") or t.endswith("=F"):
        wd = now_utc.weekday()  # 0=lun, 6=dom
        if wd == 5:  # sábado entero cerrado
            return False
        if wd == 6 and now_utc.hour < 22:  # domingo antes de 22:00 UTC
            return False
        if wd == 4 and now_utc.hour >= 22:  # viernes después de 22:00 UTC
            return False
        return True

    # España (BME / IBEX): 9:00-17:30 hora Madrid
    if t.endswith(".MC") or t in ("^IBEX",):
        madrid = now_utc.astimezone(ZoneInfo("Europe/Madrid"))
        if madrid.weekday() >= 5:
            return False
        minutes = madrid.hour * 60 + madrid.minute
        return 9 * 60 <= minutes < 17 * 60 + 30

    # Otros índices/exchanges europeos (París, Frankfurt, Euronext): 9:00-17:30 CET
    if t in ("^FCHI", "^GDAXI", "^STOXX50E"):
        madrid = now_utc.astimezone(ZoneInfo("Europe/Madrid"))
        if madrid.weekday() >= 5:
            return False
        minutes = madrid.hour * 60 + madrid.minute
        return 9 * 60 <= minutes < 17 * 60 + 30

    # FTSE / LSE: 8:00-16:30 hora de Londres
    if t == "^FTSE":
        london = now_utc.astimezone(ZoneInfo("Europe/London"))
        if london.weekday() >= 5:
            return False
        minutes = london.hour * 60 + london.minute
        return 8 * 60 <= minutes < 16 * 60 + 30

    # Por defecto: NYSE/NASDAQ — 9:30-16:00 hora de Nueva York
    ny = now_utc.astimezone(ZoneInfo("America/New_York"))
    if ny.weekday() >= 5:
        return False
    minutes = ny.hour * 60 + ny.minute
    return 9 * 60 + 30 <= minutes < 16 * 60


def _notional_value(ticker: str, price: Decimal) -> Decimal:
    """Get notional value per contract. Forex with >2 decimal precision
    gets multiplied by 10000 (e.g. EURUSD 1.16 → 11600)."""
    if _is_cfd(ticker):
        # Forex: prices with many decimals → multiply by 10000
        if price < 10:  # forex-like (EURUSD=1.16, GBPUSD=1.27, etc.)
            return price * 10000
    return price


def _apply_spread(price: Decimal, is_buy: bool) -> Decimal:
    """Apply spread to execution price. Buys pay slightly more, sells slightly less."""
    if is_buy:
        return price * (1 + _SPREAD_PCT)
    return price * (1 - _SPREAD_PCT)


def get_or_create_portfolio(db: Session, user_id: str) -> Portfolio:
    portfolio = db.query(Portfolio).filter(Portfolio.user_id == user_id).first()
    if not portfolio:
        portfolio = Portfolio(user_id=user_id)
        db.add(portfolio)
        db.commit()
        db.refresh(portfolio)
    return portfolio


def _close_order_internal(
    db: Session, portfolio: Portfolio, order: Order,
    qty: int, exec_price: Decimal, reason: str | None = None,
) -> Order:
    """Close an order (or partial qty) and update portfolio balance. No market state check."""
    ticker = order.ticker
    is_cfd = _is_cfd(ticker)
    entry_price = order.price
    side = order.side  # "long" | "short"

    entry_fx = order.fx_rate
    current_fx = _get_daily_fx_rate() if entry_fx is not None else None

    if side == "long":
        if is_cfd:
            notional_entry = _notional_value(ticker, entry_price) * qty
            notional_exit = _notional_value(ticker, exec_price) * qty
            pnl_usd = notional_exit - notional_entry
            margin_paid = notional_entry * _CFD_MARGIN_PCT
            balance_return_usd = margin_paid + pnl_usd
        else:
            pnl_usd = (exec_price - entry_price) * qty
            balance_return_usd = exec_price * qty
    else:  # short
        if is_cfd:
            notional_entry = _notional_value(ticker, entry_price) * qty
            notional_exit = _notional_value(ticker, exec_price) * qty
            pnl_usd = notional_entry - notional_exit
            margin_paid = notional_entry * _CFD_MARGIN_PCT
            balance_return_usd = margin_paid + pnl_usd
        else:
            pnl_usd = (entry_price - exec_price) * qty
            balance_return_usd = entry_price * qty + pnl_usd

    if entry_fx is not None and current_fx is not None:
        pnl = _usd_to_eur(pnl_usd, current_fx)
        portfolio.balance += _usd_to_eur(balance_return_usd, current_fx)
    else:
        pnl = pnl_usd
        portfolio.balance += balance_return_usd

    # Update original order: reduce quantity or mark closed
    if qty >= order.quantity:
        order.status = "closed"
        order.closed_at = datetime.now(timezone.utc)
        order.pnl = pnl
    else:
        order.quantity -= qty

    close_order = Order(
        portfolio_id=portfolio.id,
        ticker=ticker,
        type="close",
        quantity=qty,
        price=exec_price,
        status="closed",
        side=side,
        pnl=pnl,
        cost=None,
        closed_at=datetime.now(timezone.utc),
        fx_rate=current_fx,
        notes=f"[Auto] {reason}" if reason else None,
    )
    db.add(close_order)
    return close_order


def _check_stop_losses(db: Session, portfolio: Portfolio) -> None:
    """Check all open orders for stop loss / take profit triggers and auto-close."""
    open_orders = (
        db.query(Order)
        .filter(
            Order.portfolio_id == portfolio.id,
            Order.status == "open",
        )
        .all()
    )

    # Cache prices per ticker
    price_cache: dict[str, Decimal] = {}

    for o in open_orders:
        if o.stop_loss is None and o.take_profit is None:
            continue

        ticker = o.ticker
        if ticker not in price_cache:
            try:
                price_cache[ticker] = Decimal(str(_get_current_price(ticker)))
            except Exception:
                continue

        current_price = price_cache[ticker]
        side = o.side  # "long" | "short"
        sl = o.stop_loss
        tp = o.take_profit

        triggered = False
        trigger_reason = ""

        if side == "long":
            if sl is not None and current_price <= sl:
                triggered = True
                trigger_reason = f"Stop loss ({sl})"
            elif tp is not None and current_price >= tp:
                triggered = True
                trigger_reason = f"Take profit ({tp})"
        else:
            if sl is not None and current_price >= sl:
                triggered = True
                trigger_reason = f"Stop loss ({sl})"
            elif tp is not None and current_price <= tp:
                triggered = True
                trigger_reason = f"Take profit ({tp})"

        if not triggered:
            continue

        # Execution price: long closes at bid (no spread), short closes at ask (spread)
        exec_price = _apply_spread(current_price, is_buy=True) if side == "short" else current_price
        _close_order_internal(db, portfolio, o, o.quantity, exec_price, trigger_reason)

    db.commit()
    db.refresh(portfolio)


def get_portfolio(db: Session, user_id: str) -> PortfolioResponse:
    portfolio = get_or_create_portfolio(db, user_id)
    positions = _calculate_positions(db, portfolio)
    total_positions_value = Decimal(str(sum(_position_value(p) for p in positions)))
    total_value = portfolio.balance + total_positions_value
    total_pnl = total_value - portfolio.initial_balance
    total_pnl_pct = (
        (total_pnl / portfolio.initial_balance * 100) if portfolio.initial_balance else Decimal(0)
    )

    return PortfolioResponse(
        id=portfolio.id,
        balance=portfolio.balance,
        initial_balance=portfolio.initial_balance,
        total_value=round(total_value, 2),
        total_pnl=round(total_pnl, 2),
        total_pnl_pct=round(total_pnl_pct, 2),
        positions=positions,
        created_at=portfolio.created_at,
    )


def create_order(db: Session, user_id: str, body: OrderCreateRequest) -> OrderResponse:
    portfolio = get_or_create_portfolio(db, user_id)

    # Check market state — DETERMINISTA por hora + exchange del ticker.
    # No depende de Yahoo (antes era inconsistente: algunos tickers daban
    # CLOSED y otros no, según el cache). Si está cerrado, bloquea TODO.
    ticker = body.ticker.upper()
    if not _is_market_open(ticker):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mercado cerrado para {ticker}. Solo puedes operar en horario de mercado.",
        )

    # Si la orden trae precio explícito (típico desde el simulador del
    # screener), úsalo y no llames a Yahoo. Solo consulta el precio
    # actual cuando no nos lo pasen.
    if body.price:
        base_price = body.price
    else:
        try:
            current_price = _get_current_price(body.ticker)
            base_price = Decimal(str(current_price))
        except Exception as e:
            # Fallback: stale quote del cache si está, si no error
            try:
                from .market_service import get_quote
                quote_data = get_quote(ticker)
                base_price = Decimal(str(quote_data.price))
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"No se pudo obtener precio de {ticker}. Reintenta en unos segundos o pasa el precio explícito.",
                ) from e
    is_cfd = _is_cfd(ticker)

    # FX conversion for USD-denominated assets
    needs_fx = _needs_fx_conversion(ticker)
    fx_rate = _get_daily_fx_rate() if needs_fx else None

    if body.type == "buy":
        # Buy = ask side → apply spread (pay slightly more)
        exec_price = _apply_spread(base_price, is_buy=True)
        side = "long"

        if is_cfd:
            # CFD/Futures: charge margin % of notional value
            notional = _notional_value(ticker, exec_price) * body.quantity
            cost = notional * _CFD_MARGIN_PCT
        else:
            # Spot: full price
            cost = exec_price * body.quantity

        # Convert cost to EUR if USD asset
        cost_eur = _usd_to_eur(cost, fx_rate) if needs_fx else cost

        if cost_eur > portfolio.balance:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Saldo insuficiente. Necesitas {round(cost_eur, 2)}€ pero tienes {portfolio.balance}€",
            )
        portfolio.balance -= cost_eur

    elif body.type == "sell":
        # Sell = bid side → NO spread (bid is lower, already implicit)
        exec_price = base_price
        side = "short"

        if is_cfd:
            notional = _notional_value(ticker, exec_price) * body.quantity
            cost = notional * _CFD_MARGIN_PCT
        else:
            cost = exec_price * body.quantity

        # Convert cost to EUR if USD asset
        cost_eur = _usd_to_eur(cost, fx_rate) if needs_fx else cost

        if cost_eur > portfolio.balance:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Saldo insuficiente para margen. Necesitas {round(cost_eur, 2)}€ pero tienes {portfolio.balance}€",
            )
        portfolio.balance -= cost_eur

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usa el endpoint /close-position para cerrar posiciones",
        )

    order = Order(
        portfolio_id=portfolio.id,
        ticker=body.ticker.upper(),
        type=body.type,
        quantity=body.quantity,
        price=exec_price,
        stop_loss=body.stop_loss,
        take_profit=body.take_profit,
        status="open",
        side=side,
        pnl=None,
        cost=cost_eur,
        closed_at=None,
        portfolio_group=body.portfolio_group,
        notes=body.notes,
        fx_rate=fx_rate,
    )

    db.add(order)
    db.commit()
    db.refresh(order)
    db.refresh(portfolio)

    return _order_to_response(order)


def update_stop_loss(db: Session, user_id: str, ticker: str, side: str, stop_loss: float | None, order_id: str | None = None) -> dict:
    """Update stop loss for a specific order or all open orders of a ticker+side."""
    portfolio = get_or_create_portfolio(db, user_id)
    if order_id:
        order = db.query(Order).filter(
            Order.id == order_id, Order.portfolio_id == portfolio.id, Order.status == "open"
        ).first()
        if not order:
            raise HTTPException(status_code=404, detail="Orden no encontrada")
        order.stop_loss = Decimal(str(stop_loss)) if stop_loss else None
        db.commit()
        return {"ok": True, "updated": 1}
    # Fallback: update all matching orders (backwards compat)
    order_type = "buy" if side == "long" else "sell"
    orders = (
        db.query(Order)
        .filter(Order.portfolio_id == portfolio.id, Order.ticker == ticker.upper(),
                Order.type == order_type, Order.status == "open")
        .all()
    )
    if not orders:
        raise HTTPException(status_code=404, detail="Posicion no encontrada")
    for o in orders:
        o.stop_loss = Decimal(str(stop_loss)) if stop_loss else None
    db.commit()
    return {"ok": True, "updated": len(orders)}


def close_position(db: Session, user_id: str, body: ClosePositionRequest) -> OrderResponse:
    portfolio = get_or_create_portfolio(db, user_id)

    # Find the specific order
    order = db.query(Order).filter(
        Order.id == body.order_id,
        Order.portfolio_id == portfolio.id,
        Order.status == "open",
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada o ya cerrada")

    ticker = order.ticker
    if body.quantity > order.quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Solo tienes {order.quantity} unidades en esta orden",
        )

    # Check market state
    try:
        from .market_service import get_quote
        quote_data = get_quote(ticker)
        market_state = quote_data.market_state.upper()
        if market_state in ("CLOSED", "PREPRE", "POSTPOST"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mercado cerrado para {ticker}. No puedes cerrar posiciones fuera de horario.",
            )
    except HTTPException:
        raise
    except Exception:
        pass

    current_price = Decimal(str(_get_current_price(ticker)))
    exec_price = _apply_spread(current_price, is_buy=True) if order.side == "short" else current_price

    close_order = _close_order_internal(db, portfolio, order, body.quantity, exec_price)
    db.commit()
    db.refresh(close_order)
    db.refresh(portfolio)

    return _order_to_response(close_order)


def close_all_positions(db: Session, user_id: str) -> list[OrderResponse]:
    """Close all open positions at market price.

    Bulk close con confirmación explícita del alumno: NO comprueba market_state
    y tolera fallos de precio por ticker (Yahoo rate-limit) usando el precio de
    entrada como fallback en lugar de romper el bucle entero.
    """
    portfolio = get_or_create_portfolio(db, user_id)
    open_orders = (
        db.query(Order)
        .filter(Order.portfolio_id == portfolio.id, Order.status == "open")
        .all()
    )

    if not open_orders:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay posiciones abiertas",
        )

    # Cache prices per ticker (con fallback a entry_price si Yahoo falla)
    price_cache: dict[str, Decimal] = {}
    results = []
    for o in open_orders:
        if o.ticker not in price_cache:
            try:
                price_cache[o.ticker] = Decimal(str(_get_current_price(o.ticker)))
            except Exception:
                # fallback: cierra al precio de entrada (PnL = 0 para esa orden)
                price_cache[o.ticker] = o.price
        current_price = price_cache[o.ticker]
        exec_price = _apply_spread(current_price, is_buy=True) if o.side == "short" else current_price
        try:
            close_order = _close_order_internal(db, portfolio, o, o.quantity, exec_price)
            results.append(_order_to_response(close_order))
        except Exception:
            # ningún error por orden debe abortar el cierre del resto
            continue

    db.commit()
    db.refresh(portfolio)
    return results


def get_orders(db: Session, user_id: str) -> list[OrderResponse]:
    portfolio = get_or_create_portfolio(db, user_id)
    orders = (
        db.query(Order)
        .filter(Order.portfolio_id == portfolio.id)
        .order_by(Order.created_at.desc())
        .all()
    )
    return [_order_to_response(o) for o in orders]


def _calculate_trade_stats(pnls: list[float]) -> dict:
    """Estadísticas didácticas a partir de la lista de PnLs cerrados.
    Devuelve win_rate, loss_rate, avg_win, avg_loss (positivo), expected_value, R/R.
    """
    if not pnls:
        return {
            "total_trades": 0,
            "profitable_trades": 0,
            "losing_trades": 0,
            "win_rate": 0.0,
            "loss_rate": 0.0,
            "avg_win": None,
            "avg_loss": None,
            "expected_value": None,
            "risk_reward_ratio": None,
            "best_trade_pnl": None,
            "worst_trade_pnl": None,
        }
    profitable = [p for p in pnls if p > 0]
    losing = [p for p in pnls if p < 0]  # excluye 0 (break-even) de "perdedoras"
    n = len(pnls)
    p_win = len(profitable) / n
    p_loss = len(losing) / n
    avg_win = sum(profitable) / len(profitable) if profitable else None
    avg_loss = abs(sum(losing) / len(losing)) if losing else None  # positivo
    e = None
    if avg_win is not None or avg_loss is not None:
        e = (p_win * (avg_win or 0)) - (p_loss * (avg_loss or 0))
    rr = (avg_win / avg_loss) if (avg_win is not None and avg_loss and avg_loss > 0) else None
    return {
        "total_trades": n,
        "profitable_trades": len(profitable),
        "losing_trades": len(losing),
        "win_rate": round(p_win * 100, 2),
        "loss_rate": round(p_loss * 100, 2),
        "avg_win": round(avg_win, 2) if avg_win is not None else None,
        "avg_loss": round(avg_loss, 2) if avg_loss is not None else None,
        "expected_value": round(e, 2) if e is not None else None,
        "risk_reward_ratio": round(rr, 2) if rr is not None else None,
        "best_trade_pnl": round(max(pnls), 2),
        "worst_trade_pnl": round(min(pnls), 2),
    }


def get_performance(db: Session, user_id: str) -> PerformanceResponse:
    portfolio = get_or_create_portfolio(db, user_id)
    closed_orders = (
        db.query(Order)
        .filter(Order.portfolio_id == portfolio.id, Order.type == "close")
        .all()
    )

    if not closed_orders:
        positions = _calculate_positions(db, portfolio)
        total_positions_value = sum(_position_value(p) for p in positions)
        total_value = float(portfolio.balance) + total_positions_value
        total_return = total_value - float(portfolio.initial_balance)
        total_return_pct = (
            total_return / float(portfolio.initial_balance) * 100
            if portfolio.initial_balance
            else 0
        )
        return PerformanceResponse(
            total_return=round(total_return, 2),
            total_return_pct=round(total_return_pct, 2),
            max_drawdown=0,
            max_drawdown_pct=0,
            win_rate=0,
            total_trades=0,
            profitable_trades=0,
            losing_trades=0,
        )

    pnls = [float(o.pnl) for o in closed_orders if o.pnl is not None]
    stats = _calculate_trade_stats(pnls)

    total_return = sum(pnls)
    total_return_pct = total_return / float(portfolio.initial_balance) * 100

    # Drawdown simplificado sobre P&L acumulado
    cumulative = []
    running = 0
    for p in pnls:
        running += p
        cumulative.append(running)

    peak = 0
    max_dd = 0
    for c in cumulative:
        if c > peak:
            peak = c
        dd = peak - c
        if dd > max_dd:
            max_dd = dd

    max_dd_pct = max_dd / float(portfolio.initial_balance) * 100 if portfolio.initial_balance else 0

    durations = []
    for o in closed_orders:
        if o.closed_at and o.created_at:
            durations.append((o.closed_at - o.created_at).total_seconds() / 86400)

    return PerformanceResponse(
        total_return=round(total_return, 2),
        total_return_pct=round(total_return_pct, 2),
        max_drawdown=round(max_dd, 2),
        max_drawdown_pct=round(max_dd_pct, 2),
        win_rate=stats["win_rate"],
        loss_rate=stats["loss_rate"],
        total_trades=stats["total_trades"],
        profitable_trades=stats["profitable_trades"],
        losing_trades=stats["losing_trades"],
        best_trade_pnl=stats["best_trade_pnl"],
        worst_trade_pnl=stats["worst_trade_pnl"],
        avg_trade_duration_days=round(sum(durations) / len(durations), 1) if durations else None,
        avg_win=stats["avg_win"],
        avg_loss=stats["avg_loss"],
        expected_value=stats["expected_value"],
        risk_reward_ratio=stats["risk_reward_ratio"],
    )


def get_portfolio_summary(db: Session, user_id: str) -> PortfolioSummaryResponse:
    portfolio = get_or_create_portfolio(db, user_id)
    positions = _calculate_positions(db, portfolio)

    total_invested = sum(_invested_value(p) for p in positions)
    total_current = sum(_position_value(p) for p in positions)
    total_value = float(portfolio.balance) + total_current

    # Sector allocation (by invested value, not current)
    sector_values: dict[str, float] = {}
    for p in positions:
        sector = _get_sector(p.ticker)
        val = _invested_value(p)
        sector_values[sector] = sector_values.get(sector, 0) + val

    sectors = []
    for sector, value in sorted(sector_values.items(), key=lambda x: -x[1]):
        weight = (value / total_invested * 100) if total_invested > 0 else 0
        sectors.append(SectorAllocation(sector=sector, weight_pct=round(weight, 1), value=round(value, 2)))

    # Diversity score: Shannon entropy with penalizations
    diversity_score = 0.0
    n_positions = sum(p.quantity for p in positions)
    n_sectors = len(sectors)
    if n_sectors > 1 and total_invested > 0:
        weights = [s.weight_pct / 100 for s in sectors]
        entropy = -sum(w * math.log(w) for w in weights if w > 0)
        max_entropy = math.log(n_sectors)
        entropy_score = (entropy / max_entropy) if max_entropy > 0 else 0

        position_penalty = min(n_positions / 5, 1)
        sector_penalty = min(n_sectors / 3, 1)
        max_weight = max(weights)
        concentration_penalty = 1 - (max_weight - 0.4) if max_weight > 0.4 else 1

        diversity_score = round(
            entropy_score * position_penalty * sector_penalty * concentration_penalty * 100, 1
        )
    elif n_sectors == 1:
        diversity_score = 0.0

    return PortfolioSummaryResponse(
        total_value=round(total_value, 2),
        balance=round(float(portfolio.balance), 2),
        invested=round(total_invested, 2),
        positions_count=len(positions),
        sectors=sectors,
        diversity_score=diversity_score,
    )


def get_carteras(db: Session, user_id: str) -> list[dict]:
    """Get named portfolio groups (carteras) with their positions."""
    portfolio = get_or_create_portfolio(db, user_id)
    positions = _calculate_positions(db, portfolio)

    # Group positions by portfolio_group
    groups: dict[str, list[PositionResponse]] = {}
    for p in positions:
        if p.portfolio_group:
            groups.setdefault(p.portfolio_group, []).append(p)

    result = []
    for name, group_positions in groups.items():
        total_invested = sum(_invested_value(p) for p in group_positions)
        total_current = sum(_position_value(p) for p in group_positions)
        total_pnl = sum(float(p.pnl) for p in group_positions)

        # Sector diversity for this cartera
        sector_map: dict[str, float] = {}
        for p in group_positions:
            sec = _get_sector(p.ticker)
            sector_map[sec] = sector_map.get(sec, 0) + _invested_value(p)
        n_sectors = len(sector_map)

        # Shannon entropy diversity score with penalizations
        diversity_score = 0.0
        n_positions = sum(p.quantity for p in group_positions)
        if n_sectors > 1 and total_current > 0:
            weights = [v / total_current for v in sector_map.values()]
            entropy = -sum(w * math.log(w) for w in weights if w > 0)
            max_entropy = math.log(n_sectors)
            entropy_score = (entropy / max_entropy) if max_entropy > 0 else 0

            # Penalize: min 5 positions and 3 sectors for real diversification
            position_penalty = min(n_positions / 5, 1)
            sector_penalty = min(n_sectors / 3, 1)
            # Concentration: penalize if one sector > 40%
            max_weight = max(weights)
            concentration_penalty = 1 - (max_weight - 0.4) if max_weight > 0.4 else 1

            diversity_score = round(
                entropy_score * position_penalty * sector_penalty * concentration_penalty * 100, 1
            )

        result.append({
            "name": name,
            "positions": [
                {
                    "order_id": p.order_id,
                    "ticker": p.ticker,
                    "quantity": p.quantity,
                    "entry_price": float(p.entry_price),
                    "current_price": float(p.current_price),
                    "pnl": float(p.pnl),
                    "pnl_pct": float(p.pnl_pct),
                    "side": p.side,
                    "currency": p.currency,
                    "fx_pnl": float(p.fx_pnl) if p.fx_pnl is not None else None,
                    "stop_loss": float(p.stop_loss) if p.stop_loss else None,
                    "take_profit": float(p.take_profit) if p.take_profit else None,
                    "invested_value": float(p.invested_value) if p.invested_value else None,
                    "notes": p.notes,
                    "created_at": p.created_at.isoformat() if p.created_at else None,
                }
                for p in group_positions
            ],
            "total_invested": round(total_invested, 2),
            "total_current": round(total_current, 2),
            "total_pnl": round(total_pnl, 2),
            "total_pnl_pct": round(total_pnl / total_invested * 100, 2) if total_invested > 0 else 0,
            "sectors": n_sectors,
            "diversity_score": diversity_score,
        })

    return sorted(result, key=lambda x: x["name"])


def close_cartera(db: Session, user_id: str, cartera_name: str) -> list[OrderResponse]:
    """Close all open positions in a named cartera.

    Bulk close con confirmación explícita: bypassea el check de market_state que
    tiene `close_position` y tolera fallos de precio por ticker (mismo criterio
    que `close_all_positions`).
    """
    portfolio = get_or_create_portfolio(db, user_id)
    open_orders = (
        db.query(Order)
        .filter(
            Order.portfolio_id == portfolio.id,
            Order.status == "open",
            Order.portfolio_group == cartera_name,
        )
        .all()
    )

    if not open_orders:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No hay posiciones abiertas en la cartera '{cartera_name}'",
        )

    price_cache: dict[str, Decimal] = {}
    results = []
    for o in open_orders:
        if o.ticker not in price_cache:
            try:
                price_cache[o.ticker] = Decimal(str(_get_current_price(o.ticker)))
            except Exception:
                price_cache[o.ticker] = o.price
        current_price = price_cache[o.ticker]
        exec_price = _apply_spread(current_price, is_buy=True) if o.side == "short" else current_price
        try:
            close_order = _close_order_internal(db, portfolio, o, o.quantity, exec_price)
            results.append(_order_to_response(close_order))
        except Exception:
            continue

    db.commit()
    db.refresh(portfolio)
    return results


def reset_portfolio(db: Session, user_id: str, initial_balance: Decimal) -> PortfolioResponse:
    portfolio = get_or_create_portfolio(db, user_id)

    # Eliminar órdenes anteriores
    db.query(Order).filter(Order.portfolio_id == portfolio.id).delete()

    portfolio.balance = initial_balance
    portfolio.initial_balance = initial_balance
    db.commit()
    db.refresh(portfolio)

    return PortfolioResponse(
        id=portfolio.id,
        balance=portfolio.balance,
        initial_balance=portfolio.initial_balance,
        total_value=portfolio.balance,
        total_pnl=Decimal(0),
        total_pnl_pct=Decimal(0),
        positions=[],
        created_at=portfolio.created_at,
    )



# --- Helpers ---

def _order_to_response(o: Order) -> OrderResponse:
    return OrderResponse(
        id=o.id,
        ticker=o.ticker,
        type=o.type,
        quantity=o.quantity,
        price=o.price,
        stop_loss=o.stop_loss,
        take_profit=o.take_profit,
        status=o.status,
        side=o.side,
        pnl=o.pnl,
        cost=o.cost,
        fx_rate=o.fx_rate,
        portfolio_group=o.portfolio_group,
        notes=o.notes,
        created_at=o.created_at,
        closed_at=o.closed_at,
    )


def _get_entry_fx_rate(db: Session, portfolio_id: str, ticker: str, side: str) -> Decimal | None:
    """Get the FX rate used when the position was opened. Returns None if no FX was applied."""
    order_type = "buy" if side == "long" else "sell"
    entry_order = (
        db.query(Order)
        .filter(
            Order.portfolio_id == portfolio_id,
            Order.ticker == ticker.upper(),
            Order.type == order_type,
            Order.fx_rate.isnot(None),
        )
        .order_by(Order.created_at.desc())
        .first()
    )
    return entry_order.fx_rate if entry_order else None


def _get_current_price(ticker: str) -> float:
    tk = yf.Ticker(ticker)
    info = tk.info
    price = info.get("regularMarketPrice") or info.get("currentPrice")
    if price is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No se pudo obtener precio de '{ticker}'",
        )
    return price


def _long_quantity(db: Session, portfolio_id: str, ticker: str) -> int:
    """Acciones LONG en cartera: compras - cierres de long."""
    orders = (
        db.query(Order)
        .filter(Order.portfolio_id == portfolio_id, Order.ticker == ticker.upper())
        .all()
    )
    bought = sum(o.quantity for o in orders if o.type == "buy")
    closed_long = sum(o.quantity for o in orders if o.type == "close" and o.side == "long")
    return bought - closed_long


def _short_quantity(db: Session, portfolio_id: str, ticker: str) -> int:
    """Acciones SHORT en cartera: ventas - cierres de short."""
    orders = (
        db.query(Order)
        .filter(Order.portfolio_id == portfolio_id, Order.ticker == ticker.upper())
        .all()
    )
    sold = sum(o.quantity for o in orders if o.type == "sell")
    closed_short = sum(o.quantity for o in orders if o.type == "close" and o.side == "short")
    return sold - closed_short


def _avg_buy_price(db: Session, portfolio_id: str, ticker: str) -> Decimal:
    """Precio medio de compra ponderado por cantidad (solo posición abierta, FIFO)."""
    buys = (
        db.query(Order)
        .filter(
            Order.portfolio_id == portfolio_id,
            Order.ticker == ticker.upper(),
            Order.type == "buy",
        )
        .order_by(Order.created_at)
        .all()
    )
    if not buys:
        return Decimal(0)

    # Total closed long quantity (to consume from oldest buys first)
    closed = sum(
        o.quantity for o in db.query(Order).filter(
            Order.portfolio_id == portfolio_id,
            Order.ticker == ticker.upper(),
            Order.type == "close",
            Order.side == "long",
        ).all()
    )

    # FIFO: skip fully consumed buys, partial on the boundary
    total_cost = Decimal(0)
    total_qty = 0
    remaining_to_skip = closed
    for o in buys:
        if remaining_to_skip >= o.quantity:
            remaining_to_skip -= o.quantity
            continue
        active_qty = o.quantity - remaining_to_skip
        remaining_to_skip = 0
        total_cost += o.price * active_qty
        total_qty += active_qty

    return total_cost / total_qty if total_qty else Decimal(0)


def _avg_sell_price(db: Session, portfolio_id: str, ticker: str) -> Decimal:
    """Precio medio de venta (short) ponderado por cantidad (solo posición abierta, FIFO)."""
    sells = (
        db.query(Order)
        .filter(
            Order.portfolio_id == portfolio_id,
            Order.ticker == ticker.upper(),
            Order.type == "sell",
        )
        .order_by(Order.created_at)
        .all()
    )
    if not sells:
        return Decimal(0)

    # Total closed short quantity (to consume from oldest sells first)
    closed = sum(
        o.quantity for o in db.query(Order).filter(
            Order.portfolio_id == portfolio_id,
            Order.ticker == ticker.upper(),
            Order.type == "close",
            Order.side == "short",
        ).all()
    )

    # FIFO: skip fully consumed sells, partial on the boundary
    total_revenue = Decimal(0)
    total_qty = 0
    remaining_to_skip = closed
    for o in sells:
        if remaining_to_skip >= o.quantity:
            remaining_to_skip -= o.quantity
            continue
        active_qty = o.quantity - remaining_to_skip
        remaining_to_skip = 0
        total_revenue += o.price * active_qty
        total_qty += active_qty

    return total_revenue / total_qty if total_qty else Decimal(0)


def _calculate_positions(db: Session, portfolio: Portfolio) -> list[PositionResponse]:
    """Each open order = one independent position."""
    open_orders = (
        db.query(Order)
        .filter(Order.portfolio_id == portfolio.id, Order.status == "open")
        .order_by(Order.created_at)
        .all()
    )

    if not open_orders:
        return []

    positions = []
    # Cache current prices per ticker and FX rate
    price_cache: dict[str, Decimal] = {}
    _current_fx_rate: Decimal | None = None

    def current_fx_rate() -> Decimal:
        nonlocal _current_fx_rate
        if _current_fx_rate is None:
            _current_fx_rate = _get_daily_fx_rate()
        return _current_fx_rate

    for o in open_orders:
        ticker = o.ticker
        is_cfd = _is_cfd(ticker)
        entry_price = o.price
        qty = o.quantity
        side = o.side  # "long" | "short"

        # Get current price (cached per ticker)
        if ticker not in price_cache:
            try:
                price_cache[ticker] = Decimal(str(_get_current_price(ticker)))
            except HTTPException:
                price_cache[ticker] = entry_price

        raw_price = price_cache[ticker]
        # Short positions show ask price (with spread) as current/close price
        current_price = _apply_spread(raw_price, is_buy=True) if side == "short" else raw_price

        # P&L calculation
        if side == "long":
            if is_cfd:
                notional_entry = _notional_value(ticker, entry_price) * qty
                notional_current = _notional_value(ticker, current_price) * qty
                pnl_usd = notional_current - notional_entry
                margin_invested = notional_entry * _CFD_MARGIN_PCT
                pnl_pct = (pnl_usd / margin_invested * 100) if margin_invested else Decimal(0)
            else:
                pnl_usd = (current_price - entry_price) * qty
                pnl_pct = (pnl_usd / (entry_price * qty) * 100) if entry_price else Decimal(0)
        else:  # short
            if is_cfd:
                notional_entry = _notional_value(ticker, entry_price) * qty
                notional_current = _notional_value(ticker, current_price) * qty
                pnl_usd = notional_entry - notional_current
                margin_invested = notional_entry * _CFD_MARGIN_PCT
                pnl_pct = (pnl_usd / margin_invested * 100) if margin_invested else Decimal(0)
            else:
                pnl_usd = (entry_price - current_price) * qty
                pnl_pct = (pnl_usd / (entry_price * qty) * 100) if entry_price else Decimal(0)

        # FX conversion
        entry_fx = o.fx_rate
        if entry_fx is not None:
            fx_now = current_fx_rate()
            pnl = _usd_to_eur(pnl_usd, fx_now)
            invested_usd = margin_invested if is_cfd else entry_price * qty
            fx_pnl = invested_usd * (Decimal(1) / fx_now - Decimal(1) / entry_fx)
            if side == "short":
                fx_pnl = -fx_pnl
            currency = "USD"
        else:
            pnl = pnl_usd
            fx_pnl = None
            fx_now = None
            currency = "EUR"

        # Invested value
        if is_cfd:
            inv_val = _notional_value(ticker, entry_price) * qty * _CFD_MARGIN_PCT
        else:
            inv_val = entry_price * qty
        if entry_fx is not None:
            inv_val = _usd_to_eur(inv_val, entry_fx)

        positions.append(
            PositionResponse(
                order_id=o.id,
                ticker=ticker,
                quantity=qty,
                entry_price=round(entry_price, 5),
                current_price=round(current_price, 5),
                pnl=round(pnl, 5),
                pnl_pct=round(pnl_pct, 2),
                side=side,
                portfolio_group=o.portfolio_group,
                currency=currency,
                fx_rate_entry=entry_fx,
                fx_rate_current=round(fx_now, 6) if fx_now else None,
                fx_pnl=round(fx_pnl, 2) if fx_pnl is not None else None,
                stop_loss=round(o.stop_loss, 5) if o.stop_loss else None,
                take_profit=round(o.take_profit, 5) if o.take_profit else None,
                invested_value=round(inv_val, 2),
                notes=o.notes,
                created_at=o.created_at,
            )
        )

    return positions


def _invested_value(p: PositionResponse) -> float:
    """What left the balance when position was opened (FIXED, does not change)."""
    if _is_cfd(p.ticker):
        entry = Decimal(str(p.entry_price))
        notional_entry = _notional_value(p.ticker, entry) * p.quantity
        value_usd = float(notional_entry * _CFD_MARGIN_PCT)
    else:
        value_usd = float(p.entry_price) * p.quantity

    if p.fx_rate_entry is not None:
        return value_usd / float(p.fx_rate_entry)
    return value_usd


def _position_value(p: PositionResponse) -> float:
    """Current value of a position (CHANGES with market price).
    CFDs: margin invested + unrealized P&L.
    Stocks: current_price × quantity.
    P&L is already in EUR, invested_value is already in EUR.
    """
    return _invested_value(p) + float(p.pnl)


def _get_sector(ticker: str) -> str:
    """Get sector for a ticker, with caching."""
    if ticker in _sector_cache:
        return _sector_cache[ticker] or "Otros"
    try:
        info = yf.Ticker(ticker).info
        sector = info.get("sector")
        _sector_cache[ticker] = sector
        return sector or "Otros"
    except Exception:
        _sector_cache[ticker] = None
        return "Otros"


def get_ranking(db: Session) -> list[dict]:
    """Ranking de todos los usuarios por valor total del portfolio."""
    portfolios = db.query(Portfolio).all()
    ranking = []
    for p in portfolios:
        user = db.query(User).filter(User.id == p.user_id).first()
        if not user or user.role != "student":
            continue
        if user.email in ("profesor@demo.com", "sara@demo.com"):
            continue
        positions = _calculate_positions(db, p)
        total_positions_value = sum(_position_value(pos) for pos in positions)
        total_value = float(p.balance) + total_positions_value
        total_pnl_pct = (total_value - float(p.initial_balance)) / float(p.initial_balance) * 100 if p.initial_balance else 0
        ranking.append({
            "username": user.name,
            "total_value": round(total_value, 2),
            "total_pnl_pct": round(total_pnl_pct, 2),
            "positions_count": len(positions),
            "updated_at": p.created_at.isoformat(),
        })
    ranking.sort(key=lambda x: x["total_value"], reverse=True)
    return ranking


def get_admin_positions(db: Session) -> list[dict]:
    """All students' open positions with real-time P&L. Professor-only."""
    portfolios = db.query(Portfolio).all()
    students = []
    for p in portfolios:
        user = db.query(User).filter(User.id == p.user_id).first()
        if not user or user.role != "student":
            continue
        if user.email in ("profesor@demo.com", "sara@demo.com"):
            continue
        positions = _calculate_positions(db, p)
        total_positions_value = sum(_position_value(pos) for pos in positions)
        total_invested = sum(_invested_value(pos) for pos in positions)
        total_value = float(p.balance) + total_positions_value
        total_pnl = total_value - float(p.initial_balance)
        total_pnl_pct = (total_pnl / float(p.initial_balance) * 100) if p.initial_balance else 0

        # Trade stats sobre operaciones cerradas
        closed_orders = (
            db.query(Order)
            .filter(Order.portfolio_id == p.id, Order.type == "close")
            .all()
        )
        pnls = [float(o.pnl) for o in closed_orders if o.pnl is not None]
        stats = _calculate_trade_stats(pnls)

        students.append({
            "username": user.name,
            "email": user.email,
            "balance": round(float(p.balance), 2),
            "initial_balance": round(float(p.initial_balance), 2),
            "invested": round(total_invested, 2),
            "total_value": round(total_value, 2),
            "total_pnl": round(total_pnl, 2),
            "total_pnl_pct": round(total_pnl_pct, 2),
            "stats": stats,
            "positions": [
                {
                    "ticker": pos.ticker,
                    "side": pos.side,
                    "quantity": pos.quantity,
                    "avg_price": float(pos.entry_price),
                    "current_price": float(pos.current_price),
                    "pnl": float(pos.pnl),
                    "pnl_pct": float(pos.pnl_pct),
                    "portfolio_group": pos.portfolio_group,
                    "currency": pos.currency,
                    "fx_pnl": float(pos.fx_pnl) if pos.fx_pnl is not None else None,
                }
                for pos in positions
            ],
        })
    students.sort(key=lambda x: x["total_value"], reverse=True)
    return students


# --- Background stop loss monitor ---
_sl_monitor_running = False


def _stop_loss_monitor_loop():
    """Background thread: checks all open positions with SL/TP every 2 minutes."""
    global _sl_monitor_running
    _sl_monitor_running = True
    logger.info("Stop loss monitor started")
    # Wait 30s on startup to let caches warm up
    time.sleep(30)

    while _sl_monitor_running:
        try:
            from ..database import SessionLocal

            db = SessionLocal()
            try:
                # Find all portfolios that have open orders with SL or TP
                orders_with_stops = (
                    db.query(Order)
                    .filter(
                        Order.status == "open",
                        (Order.stop_loss.isnot(None)) | (Order.take_profit.isnot(None)),
                    )
                    .all()
                )
                if orders_with_stops:
                    portfolio_ids = {o.portfolio_id for o in orders_with_stops}
                    for pid in portfolio_ids:
                        portfolio = db.query(Portfolio).filter(Portfolio.id == pid).first()
                        if portfolio:
                            try:
                                _check_stop_losses(db, portfolio)
                            except Exception as e:
                                logger.warning(f"SL check failed for portfolio {pid}: {e}")
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Stop loss monitor error: {e}")

        time.sleep(120)  # 2 minutes


def start_stop_loss_monitor():
    """Start the background stop loss monitor thread."""
    if _sl_monitor_running:
        return
    t = threading.Thread(target=_stop_loss_monitor_loop, daemon=True, name="sl-monitor")
    t.start()
