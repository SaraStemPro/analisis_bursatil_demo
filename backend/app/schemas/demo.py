from uuid import UUID
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from .common import OrderType, OrderStatus


# --- Requests ---

class OrderCreateRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=20)
    type: OrderType
    quantity: int = Field(gt=0, le=100_000)
    price: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    stop_loss: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    take_profit: Decimal | None = Field(default=None, gt=0, decimal_places=2)


class PortfolioResetRequest(BaseModel):
    initial_balance: Decimal = Field(
        default=Decimal("100000.00"),
        gt=0,
        le=Decimal("10000000.00"),
        decimal_places=2,
    )


# --- Responses ---

class PositionResponse(BaseModel):
    ticker: str
    quantity: int
    avg_price: Decimal
    current_price: Decimal
    pnl: Decimal
    pnl_pct: Decimal

    model_config = {"from_attributes": True}


class PortfolioResponse(BaseModel):
    id: UUID
    balance: Decimal
    initial_balance: Decimal
    total_value: Decimal
    total_pnl: Decimal
    total_pnl_pct: Decimal
    positions: list[PositionResponse]
    created_at: datetime

    model_config = {"from_attributes": True}


class OrderResponse(BaseModel):
    id: UUID
    ticker: str
    type: OrderType
    quantity: int
    price: Decimal
    stop_loss: Decimal | None = None
    take_profit: Decimal | None = None
    status: OrderStatus
    pnl: Decimal | None = None
    created_at: datetime
    closed_at: datetime | None = None

    model_config = {"from_attributes": True}


class PerformanceResponse(BaseModel):
    total_return: float
    total_return_pct: float
    sharpe_ratio: float | None = None
    max_drawdown: float
    max_drawdown_pct: float
    win_rate: float
    total_trades: int
    profitable_trades: int
    losing_trades: int
    best_trade_pnl: float | None = None
    worst_trade_pnl: float | None = None
    avg_trade_duration_days: float | None = None
