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
    price: Decimal | None = Field(default=None, gt=0, decimal_places=5)
    stop_loss: Decimal | None = Field(default=None, gt=0, decimal_places=5)
    take_profit: Decimal | None = Field(default=None, gt=0, decimal_places=5)
    portfolio_group: str | None = None
    notes: str = Field(min_length=1, max_length=500)


class ClosePositionRequest(BaseModel):
    order_id: str = Field(min_length=1, max_length=36)
    quantity: int = Field(gt=0, le=100_000)


class PortfolioResetRequest(BaseModel):
    initial_balance: Decimal = Field(
        default=Decimal("100000.00"),
        gt=0,
        le=Decimal("10000000.00"),
        decimal_places=5,
    )


# --- Responses ---

class PositionResponse(BaseModel):
    order_id: str
    ticker: str
    quantity: int
    entry_price: Decimal
    current_price: Decimal
    pnl: Decimal
    pnl_pct: Decimal
    side: str = "long"  # "long" | "short"
    portfolio_group: str | None = None
    currency: str = "EUR"  # "EUR" | "USD"
    fx_rate_entry: Decimal | None = None
    fx_rate_current: Decimal | None = None
    fx_pnl: Decimal | None = None
    stop_loss: Decimal | None = None
    take_profit: Decimal | None = None
    invested_value: Decimal | None = None
    notes: str | None = None
    created_at: datetime | None = None

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
    side: str | None = None
    pnl: Decimal | None = None
    portfolio_group: str | None = None
    notes: str | None = None
    cost: Decimal | None = None
    fx_rate: Decimal | None = None
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
    loss_rate: float = 0.0
    total_trades: int
    profitable_trades: int
    losing_trades: int
    best_trade_pnl: float | None = None
    worst_trade_pnl: float | None = None
    avg_trade_duration_days: float | None = None
    avg_win: float | None = None  # ganancia media en € de las ops ganadoras
    avg_loss: float | None = None  # pérdida media en € de las ops perdedoras (positivo)
    expected_value: float | None = None  # E = P_gan × G̅ − P_per × L̅
    risk_reward_ratio: float | None = None  # G̅ / L̅


class SectorAllocation(BaseModel):
    sector: str
    weight_pct: float
    value: float


class PortfolioSummaryResponse(BaseModel):
    total_value: float
    balance: float
    invested: float
    positions_count: int
    sectors: list[SectorAllocation]
    diversity_score: float  # 0-100, Shannon entropy normalizada
