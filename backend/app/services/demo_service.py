import math
import time
from datetime import datetime, timezone
from decimal import Decimal

import yfinance as yf
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

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

    current_price = _get_current_price(body.ticker)
    base_price = body.price if body.price else Decimal(str(current_price))
    ticker = body.ticker.upper()
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


def close_position(db: Session, user_id: str, body: ClosePositionRequest) -> OrderResponse:
    portfolio = get_or_create_portfolio(db, user_id)
    ticker = body.ticker.upper()
    is_cfd = _is_cfd(ticker)

    current_price = _get_current_price(ticker)
    base_price = Decimal(str(current_price))

    # Check if this position was opened with FX conversion
    entry_fx_rate = _get_entry_fx_rate(db, portfolio.id, ticker, body.side)
    needs_fx = entry_fx_rate is not None
    current_fx_rate = _get_daily_fx_rate() if needs_fx else None

    if body.side == "long":
        # Closing long = selling at bid → NO spread
        exec_price = base_price
        held = _long_quantity(db, portfolio.id, ticker)
        if body.quantity > held:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Solo tienes {held} acciones LONG de {ticker}",
            )
        avg_price = _avg_buy_price(db, portfolio.id, ticker)

        if is_cfd:
            # CFD: P&L on notional, return margin + P&L
            notional_entry = _notional_value(ticker, avg_price) * body.quantity
            notional_exit = _notional_value(ticker, exec_price) * body.quantity
            pnl_usd = notional_exit - notional_entry
            margin_paid = notional_entry * _CFD_MARGIN_PCT
            balance_return_usd = margin_paid + pnl_usd
        else:
            pnl_usd = (exec_price - avg_price) * body.quantity
            balance_return_usd = exec_price * body.quantity

        if needs_fx:
            pnl = _usd_to_eur(pnl_usd, current_fx_rate)
            portfolio.balance += _usd_to_eur(balance_return_usd, current_fx_rate)
        else:
            pnl = pnl_usd
            portfolio.balance += balance_return_usd

    else:  # short
        # Closing short = buying at ask → apply spread
        exec_price = _apply_spread(base_price, is_buy=True)
        held = _short_quantity(db, portfolio.id, ticker)
        if body.quantity > held:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Solo tienes {held} acciones SHORT de {ticker}",
            )
        avg_price = _avg_sell_price(db, portfolio.id, ticker)

        if is_cfd:
            notional_entry = _notional_value(ticker, avg_price) * body.quantity
            notional_exit = _notional_value(ticker, exec_price) * body.quantity
            pnl_usd = notional_entry - notional_exit
            margin_paid = notional_entry * _CFD_MARGIN_PCT
            balance_return_usd = margin_paid + pnl_usd
        else:
            pnl_usd = (avg_price - exec_price) * body.quantity
            balance_return_usd = avg_price * body.quantity + pnl_usd

        if needs_fx:
            pnl = _usd_to_eur(pnl_usd, current_fx_rate)
            portfolio.balance += _usd_to_eur(balance_return_usd, current_fx_rate)
        else:
            pnl = pnl_usd
            portfolio.balance += balance_return_usd

    order = Order(
        portfolio_id=portfolio.id,
        ticker=ticker,
        type="close",
        quantity=body.quantity,
        price=exec_price,
        status="closed",
        side=body.side,
        pnl=pnl,
        cost=None,
        closed_at=datetime.now(timezone.utc),
        fx_rate=current_fx_rate,
    )

    db.add(order)
    db.commit()
    db.refresh(order)
    db.refresh(portfolio)

    return _order_to_response(order)


def close_all_positions(db: Session, user_id: str) -> list[OrderResponse]:
    """Close all open positions at market price."""
    portfolio = get_or_create_portfolio(db, user_id)
    positions = _calculate_positions(db, portfolio)

    if not positions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay posiciones abiertas",
        )

    results = []
    for p in positions:
        body = ClosePositionRequest(ticker=p.ticker, quantity=p.quantity, side=p.side)
        result = close_position(db, user_id, body)
        results.append(result)

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
    profitable = [p for p in pnls if p > 0]
    losing = [p for p in pnls if p <= 0]

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
        win_rate=round(len(profitable) / len(pnls) * 100, 2) if pnls else 0,
        total_trades=len(pnls),
        profitable_trades=len(profitable),
        losing_trades=len(losing),
        best_trade_pnl=round(max(pnls), 2) if pnls else None,
        worst_trade_pnl=round(min(pnls), 2) if pnls else None,
        avg_trade_duration_days=round(sum(durations) / len(durations), 1) if durations else None,
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
                    "ticker": p.ticker,
                    "quantity": p.quantity,
                    "avg_price": float(p.avg_price),
                    "current_price": float(p.current_price),
                    "pnl": float(p.pnl),
                    "pnl_pct": float(p.pnl_pct),
                    "side": p.side,
                    "currency": p.currency,
                    "fx_pnl": float(p.fx_pnl) if p.fx_pnl is not None else None,
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
    """Close all open positions in a named cartera."""
    portfolio = get_or_create_portfolio(db, user_id)
    positions = _calculate_positions(db, portfolio)

    cartera_positions = [p for p in positions if p.portfolio_group == cartera_name]
    if not cartera_positions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No hay posiciones abiertas en la cartera '{cartera_name}'",
        )

    results = []
    for p in cartera_positions:
        body = ClosePositionRequest(ticker=p.ticker, quantity=p.quantity, side=p.side)
        result = close_position(db, user_id, body)
        results.append(result)

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
    """Precio medio de compra ponderado por cantidad."""
    buys = (
        db.query(Order)
        .filter(
            Order.portfolio_id == portfolio_id,
            Order.ticker == ticker.upper(),
            Order.type == "buy",
        )
        .all()
    )
    if not buys:
        return Decimal(0)

    total_cost = sum(o.price * o.quantity for o in buys)
    total_qty = sum(o.quantity for o in buys)
    return total_cost / total_qty if total_qty else Decimal(0)


def _avg_sell_price(db: Session, portfolio_id: str, ticker: str) -> Decimal:
    """Precio medio de venta (short) ponderado por cantidad."""
    sells = (
        db.query(Order)
        .filter(
            Order.portfolio_id == portfolio_id,
            Order.ticker == ticker.upper(),
            Order.type == "sell",
        )
        .all()
    )
    if not sells:
        return Decimal(0)

    total_revenue = sum(o.price * o.quantity for o in sells)
    total_qty = sum(o.quantity for o in sells)
    return total_revenue / total_qty if total_qty else Decimal(0)


def _calculate_positions(db: Session, portfolio: Portfolio) -> list[PositionResponse]:
    """Calcula posiciones abiertas con P&L actual (long y short)."""
    all_orders = (
        db.query(Order)
        .filter(Order.portfolio_id == portfolio.id)
        .all()
    )

    tickers = {o.ticker for o in all_orders}
    positions = []

    # Get current FX rate once for all USD positions
    _current_fx_rate: Decimal | None = None

    def current_fx_rate() -> Decimal:
        nonlocal _current_fx_rate
        if _current_fx_rate is None:
            _current_fx_rate = _get_daily_fx_rate()
        return _current_fx_rate

    for ticker in tickers:
        is_cfd = _is_cfd(ticker)

        # Check LONG position
        long_held = _long_quantity(db, portfolio.id, ticker)
        if long_held > 0:
            avg_price = _avg_buy_price(db, portfolio.id, ticker)
            try:
                current_price = Decimal(str(_get_current_price(ticker)))
            except HTTPException:
                current_price = avg_price

            if is_cfd:
                notional_entry = _notional_value(ticker, avg_price) * long_held
                notional_current = _notional_value(ticker, current_price) * long_held
                pnl_usd = notional_current - notional_entry
                margin_invested = notional_entry * _CFD_MARGIN_PCT
                pnl_pct = (pnl_usd / margin_invested * 100) if margin_invested else Decimal(0)
            else:
                pnl_usd = (current_price - avg_price) * long_held
                pnl_pct = (pnl_usd / (avg_price * long_held) * 100) if avg_price else Decimal(0)

            first_buy = next(
                (o for o in all_orders if o.ticker == ticker and o.type == "buy"),
                None,
            )

            # FX conversion: only for positions opened with fx_rate
            entry_fx = _get_entry_fx_rate(db, portfolio.id, ticker, "long")
            if entry_fx is not None:
                fx_now = current_fx_rate()
                pnl = _usd_to_eur(pnl_usd, fx_now)
                # FX P&L: how much the currency movement alone affected the position
                # If asset price hadn't moved, FX change would still cause P&L
                invested_usd = margin_invested if is_cfd else avg_price * long_held
                fx_pnl = invested_usd * (Decimal(1) / fx_now - Decimal(1) / entry_fx)
                currency = "USD"
            else:
                pnl = pnl_usd
                fx_pnl = None
                fx_now = None
                currency = "EUR"

            positions.append(
                PositionResponse(
                    ticker=ticker,
                    quantity=long_held,
                    avg_price=round(avg_price, 5),
                    current_price=round(current_price, 5),
                    pnl=round(pnl, 5),
                    pnl_pct=round(pnl_pct, 2),
                    side="long",
                    portfolio_group=first_buy.portfolio_group if first_buy else None,
                    currency=currency,
                    fx_rate_entry=entry_fx,
                    fx_rate_current=round(fx_now, 6) if fx_now else None,
                    fx_pnl=round(fx_pnl, 2) if fx_pnl is not None else None,
                )
            )

        # Check SHORT position
        short_held = _short_quantity(db, portfolio.id, ticker)
        if short_held > 0:
            avg_price = _avg_sell_price(db, portfolio.id, ticker)
            try:
                raw_price = Decimal(str(_get_current_price(ticker)))
            except HTTPException:
                raw_price = avg_price
            current_price = _apply_spread(raw_price, is_buy=True)

            if is_cfd:
                notional_entry = _notional_value(ticker, avg_price) * short_held
                notional_current = _notional_value(ticker, current_price) * short_held
                pnl_usd = notional_entry - notional_current
                margin_invested = notional_entry * _CFD_MARGIN_PCT
                pnl_pct = (pnl_usd / margin_invested * 100) if margin_invested else Decimal(0)
            else:
                pnl_usd = (avg_price - current_price) * short_held
                pnl_pct = (pnl_usd / (avg_price * short_held) * 100) if avg_price else Decimal(0)

            first_sell = next(
                (o for o in all_orders if o.ticker == ticker and o.type == "sell"),
                None,
            )

            # FX conversion: only for positions opened with fx_rate
            entry_fx = _get_entry_fx_rate(db, portfolio.id, ticker, "short")
            if entry_fx is not None:
                fx_now = current_fx_rate()
                pnl = _usd_to_eur(pnl_usd, fx_now)
                invested_usd = margin_invested if is_cfd else avg_price * short_held
                # Short: FX risk is inverted (you benefit if EUR strengthens)
                fx_pnl = -invested_usd * (Decimal(1) / fx_now - Decimal(1) / entry_fx)
                currency = "USD"
            else:
                pnl = pnl_usd
                fx_pnl = None
                fx_now = None
                currency = "EUR"

            positions.append(
                PositionResponse(
                    ticker=ticker,
                    quantity=short_held,
                    avg_price=round(avg_price, 5),
                    current_price=round(current_price, 5),
                    pnl=round(pnl, 5),
                    pnl_pct=round(pnl_pct, 2),
                    side="short",
                    portfolio_group=first_sell.portfolio_group if first_sell else None,
                    currency=currency,
                    fx_rate_entry=entry_fx,
                    fx_rate_current=round(fx_now, 6) if fx_now else None,
                    fx_pnl=round(fx_pnl, 2) if fx_pnl is not None else None,
                )
            )

    return positions


def _invested_value(p: PositionResponse) -> float:
    """What left the balance when position was opened (FIXED, does not change).
    CFDs: margin = notional_entry × 5%.
    Stocks: avg_price × quantity.
    """
    if _is_cfd(p.ticker):
        avg = Decimal(str(p.avg_price))
        notional_entry = _notional_value(p.ticker, avg) * p.quantity
        return float(notional_entry * _CFD_MARGIN_PCT)
    return float(p.avg_price) * p.quantity


def _position_value(p: PositionResponse) -> float:
    """Current value of a position (CHANGES with market price).
    CFDs: margin invested + unrealized P&L.
    Stocks: current_price × quantity.
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

        students.append({
            "username": user.name,
            "email": user.email,
            "balance": round(float(p.balance), 2),
            "initial_balance": round(float(p.initial_balance), 2),
            "invested": round(total_invested, 2),
            "total_value": round(total_value, 2),
            "total_pnl": round(total_pnl, 2),
            "total_pnl_pct": round(total_pnl_pct, 2),
            "positions": [
                {
                    "ticker": pos.ticker,
                    "side": pos.side,
                    "quantity": pos.quantity,
                    "avg_price": float(pos.avg_price),
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
