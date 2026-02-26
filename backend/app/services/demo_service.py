from datetime import datetime, timezone
from decimal import Decimal

import yfinance as yf
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.portfolio import Portfolio
from ..schemas.demo import (
    OrderCreateRequest,
    OrderResponse,
    PerformanceResponse,
    PortfolioResponse,
    PositionResponse,
)


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
    total_positions_value = sum(p.current_price * p.quantity for p in positions)
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
    exec_price = body.price if body.price else Decimal(str(current_price))

    if body.type == "buy":
        cost = exec_price * body.quantity
        if cost > portfolio.balance:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Saldo insuficiente. Necesitas {cost}€ pero tienes {portfolio.balance}€",
            )
        portfolio.balance -= cost
    else:
        held = _held_quantity(db, portfolio.id, body.ticker)
        if body.quantity > held:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No tienes suficientes acciones. Tienes {held} de {body.ticker}",
            )
        revenue = exec_price * body.quantity
        portfolio.balance += revenue

        avg_buy_price = _avg_buy_price(db, portfolio.id, body.ticker)
        pnl = (exec_price - avg_buy_price) * body.quantity

    order = Order(
        portfolio_id=portfolio.id,
        ticker=body.ticker.upper(),
        type=body.type,
        quantity=body.quantity,
        price=exec_price,
        stop_loss=body.stop_loss,
        take_profit=body.take_profit,
        status="closed" if body.type == "sell" else "open",
        pnl=pnl if body.type == "sell" else None,
        closed_at=datetime.now(timezone.utc) if body.type == "sell" else None,
    )

    db.add(order)
    db.commit()
    db.refresh(order)
    db.refresh(portfolio)

    return OrderResponse(
        id=order.id,
        ticker=order.ticker,
        type=order.type,
        quantity=order.quantity,
        price=order.price,
        stop_loss=order.stop_loss,
        take_profit=order.take_profit,
        status=order.status,
        pnl=order.pnl,
        created_at=order.created_at,
        closed_at=order.closed_at,
    )


def get_orders(db: Session, user_id: str) -> list[OrderResponse]:
    portfolio = get_or_create_portfolio(db, user_id)
    orders = (
        db.query(Order)
        .filter(Order.portfolio_id == portfolio.id)
        .order_by(Order.created_at.desc())
        .all()
    )
    return [
        OrderResponse(
            id=o.id,
            ticker=o.ticker,
            type=o.type,
            quantity=o.quantity,
            price=o.price,
            stop_loss=o.stop_loss,
            take_profit=o.take_profit,
            status=o.status,
            pnl=o.pnl,
            created_at=o.created_at,
            closed_at=o.closed_at,
        )
        for o in orders
    ]


def get_performance(db: Session, user_id: str) -> PerformanceResponse:
    portfolio = get_or_create_portfolio(db, user_id)
    closed_orders = (
        db.query(Order)
        .filter(Order.portfolio_id == portfolio.id, Order.type == "sell")
        .all()
    )

    if not closed_orders:
        positions = _calculate_positions(db, portfolio)
        total_positions_value = sum(p.current_price * p.quantity for p in positions)
        total_value = portfolio.balance + total_positions_value
        total_return = float(total_value - portfolio.initial_balance)
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


def _held_quantity(db: Session, portfolio_id: str, ticker: str) -> int:
    """Calcula acciones en cartera: compras - ventas."""
    orders = (
        db.query(Order)
        .filter(Order.portfolio_id == portfolio_id, Order.ticker == ticker.upper())
        .all()
    )
    bought = sum(o.quantity for o in orders if o.type == "buy")
    sold = sum(o.quantity for o in orders if o.type == "sell")
    return bought - sold


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


def _calculate_positions(db: Session, portfolio: Portfolio) -> list[PositionResponse]:
    """Calcula posiciones abiertas con P&L actual."""
    buy_orders = (
        db.query(Order)
        .filter(Order.portfolio_id == portfolio.id, Order.type == "buy")
        .all()
    )

    tickers = {o.ticker for o in buy_orders}
    positions = []

    for ticker in tickers:
        held = _held_quantity(db, portfolio.id, ticker)
        if held <= 0:
            continue

        avg_price = _avg_buy_price(db, portfolio.id, ticker)
        try:
            current_price = Decimal(str(_get_current_price(ticker)))
        except HTTPException:
            current_price = avg_price

        pnl = (current_price - avg_price) * held
        pnl_pct = (pnl / (avg_price * held) * 100) if avg_price else Decimal(0)

        positions.append(
            PositionResponse(
                ticker=ticker,
                quantity=held,
                avg_price=round(avg_price, 2),
                current_price=round(current_price, 2),
                pnl=round(pnl, 2),
                pnl_pct=round(pnl_pct, 2),
            )
        )

    return positions
