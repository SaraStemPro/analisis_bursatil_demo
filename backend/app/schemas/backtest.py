from uuid import UUID
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from .common import (
    BacktestStatus,
    CandlePattern,
    Comparator,
    ConditionOperandType,
    ExitReason,
    LogicalOperator,
    OrderType,
    PriceField,
    StopLossType,
    StrategySide,
)


# --- Strategy rule sub-models ---

class ConditionOperand(BaseModel):
    type: ConditionOperandType
    name: str | None = Field(
        default=None,
        description="Nombre del indicador (requerido si type='indicator')",
    )
    params: dict[str, float | int | str] | None = Field(
        default=None,
        description="Parámetros del indicador (ej: {'period': 14, 'band': 'lower'})",
    )
    field: PriceField | None = Field(
        default=None,
        description="Campo de precio (requerido si type='price')",
    )
    value: float | None = Field(
        default=None,
        description="Valor numérico (requerido si type='value')",
    )
    pattern: CandlePattern | None = Field(
        default=None,
        description="Patrón de vela (requerido si type='candle_pattern')",
    )

    @model_validator(mode="after")
    def validate_operand(self):
        if self.type == ConditionOperandType.indicator:
            if not self.name:
                raise ValueError("'name' es requerido para operandos de tipo 'indicator'")
        elif self.type == ConditionOperandType.price:
            if not self.field:
                raise ValueError("'field' es requerido para operandos de tipo 'price'")
        elif self.type == ConditionOperandType.value:
            if self.value is None:
                raise ValueError("'value' es requerido para operandos de tipo 'value'")
        elif self.type == ConditionOperandType.candle_pattern:
            if not self.pattern:
                raise ValueError("'pattern' es requerido para operandos de tipo 'candle_pattern'")
        return self


class Condition(BaseModel):
    left: ConditionOperand
    comparator: Comparator
    right: ConditionOperand
    right_upper: ConditionOperand | None = Field(
        default=None,
        description="Límite superior para comparador 'between' / 'outside'",
    )
    offset: int = Field(
        default=0,
        ge=0,
        le=100,
        description="Evaluar la condición N velas atrás (0 = vela actual)",
    )

    @model_validator(mode="after")
    def validate_between(self):
        needs_upper = self.comparator in (Comparator.between, Comparator.outside)
        if needs_upper and not self.right_upper:
            raise ValueError(
                f"'right_upper' es requerido para el comparador '{self.comparator.value}'"
            )
        if not needs_upper and self.right_upper:
            raise ValueError(
                f"'right_upper' no aplica para el comparador '{self.comparator.value}'"
            )
        return self


class ConditionGroup(BaseModel):
    operator: LogicalOperator
    conditions: list[Condition] = Field(min_length=1, max_length=10)


class RiskManagement(BaseModel):
    stop_loss_pct: float | None = Field(default=None, gt=0, le=100, description="Stop loss fijo (%)")
    stop_loss_type: StopLossType = Field(default=StopLossType.fixed, description="Tipo: 'fixed' (%) o 'fractal' (soporte dinámico)")
    take_profit_pct: float | None = Field(default=None, gt=0, le=1000)
    position_size_pct: float = Field(default=100.0, gt=0, le=100, description="% del capital disponible por operación")
    max_risk_pct: float | None = Field(default=None, gt=0, le=100, description="Riesgo máx. por trade como % del capital (ej: 2%). Ajusta el tamaño de posición automáticamente.")


class StrategyRules(BaseModel):
    entry: ConditionGroup
    exit: ConditionGroup
    risk_management: RiskManagement = Field(default_factory=RiskManagement)
    side: StrategySide = Field(default=StrategySide.long, description="'long' o 'short'")


# --- Requests ---

class StrategyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    rules: StrategyRules


class StrategyUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    rules: StrategyRules | None = None


class BacktestRunRequest(BaseModel):
    strategy_id: UUID | None = Field(default=None, description="ID de estrategia guardada (opcional si se pasan rules)")
    rules: StrategyRules | None = Field(default=None, description="Reglas inline (alternativa a strategy_id)")
    strategy_name: str | None = Field(default=None, max_length=200, description="Nombre para mostrar en historial")
    ticker: str = Field(min_length=1, max_length=20)
    start_date: date
    end_date: date
    interval: str = Field(
        default="1d",
        description="Intervalo: 1m, 5m, 15m, 1h, 4h, 1d, 1wk",
    )
    initial_capital: Decimal = Field(
        default=Decimal("100000.00"),
        gt=0,
        le=Decimal("10000000.00"),
    )
    commission_pct: Decimal = Field(
        default=Decimal("0.1"),
        ge=0,
        le=Decimal("10.0"),
    )

    @model_validator(mode="after")
    def validate_strategy_source(self):
        if not self.strategy_id and not self.rules:
            raise ValueError("Debe proporcionar 'strategy_id' o 'rules'")
        return self

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date <= self.start_date:
            raise ValueError("'end_date' debe ser posterior a 'start_date'")
        return self

    @model_validator(mode="after")
    def validate_interval(self):
        valid = {"1m", "5m", "15m", "1h", "4h", "1d", "1wk"}
        if self.interval not in valid:
            raise ValueError(f"'interval' debe ser uno de: {', '.join(sorted(valid))}")
        return self


class BacktestCompareRequest(BaseModel):
    run_ids: list[UUID] = Field(min_length=2, max_length=3)


# --- Responses ---

class StrategyResponse(BaseModel):
    id: UUID
    user_id: UUID | None = None
    name: str
    description: str | None = None
    is_template: bool
    rules: StrategyRules
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BacktestMetrics(BaseModel):
    total_return: float
    total_return_pct: float
    annualized_return_pct: float | None = None
    sharpe_ratio: float | None = None
    max_drawdown: float
    max_drawdown_pct: float
    win_rate: float
    profit_factor: float | None = None
    total_trades: int
    avg_trade_duration_days: float | None = None
    best_trade_pnl: float | None = None
    worst_trade_pnl: float | None = None
    buy_and_hold_return_pct: float | None = None


class EquityPoint(BaseModel):
    date: date
    equity: float


class BacktestTradeResponse(BaseModel):
    id: UUID
    type: OrderType
    entry_date: datetime
    entry_price: Decimal
    exit_date: datetime | None = None
    exit_price: Decimal | None = None
    quantity: Decimal
    pnl: Decimal | None = None
    pnl_pct: Decimal | None = None
    exit_reason: ExitReason | None = None
    duration_days: int | None = None

    model_config = {"from_attributes": True}


class BacktestRunResponse(BaseModel):
    id: UUID
    user_id: UUID
    strategy_id: UUID | None = None
    ticker: str
    start_date: date
    end_date: date
    initial_capital: Decimal
    commission_pct: Decimal
    status: BacktestStatus
    metrics: BacktestMetrics | None = None
    equity_curve: list[EquityPoint] | None = None
    trades: list[BacktestTradeResponse] | None = None
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class BacktestRunSummary(BaseModel):
    id: UUID
    strategy_id: UUID | None = None
    strategy_name: str
    ticker: str
    start_date: date
    end_date: date
    status: BacktestStatus
    total_return_pct: float | None = None
    total_trades: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class BacktestCompareResponse(BaseModel):
    runs: list[BacktestRunResponse]


# --- Portfolio Backtest (multi-ticker) ---

class TickerAllocation(BaseModel):
    ticker: str = Field(min_length=1, max_length=20)
    weight_pct: float = Field(gt=0, le=100, description="% del capital total asignado a este ticker")


class PortfolioBacktestRequest(BaseModel):
    strategy_id: UUID | None = Field(default=None)
    rules: StrategyRules | None = Field(default=None)
    strategy_name: str | None = Field(default=None, max_length=200)
    tickers: list[str] | None = Field(default=None, min_length=1, max_length=50)
    universe: str | None = Field(default=None, max_length=50)
    allocations: list[TickerAllocation] | None = Field(default=None)
    start_date: date
    end_date: date
    interval: str = Field(default="1d")
    initial_capital: Decimal = Field(default=Decimal("100000.00"), gt=0, le=Decimal("10000000.00"))
    commission_pct: Decimal = Field(default=Decimal("0.1"), ge=0, le=Decimal("10.0"))

    @model_validator(mode="after")
    def validate_strategy_source(self):
        if not self.strategy_id and not self.rules:
            raise ValueError("Debe proporcionar 'strategy_id' o 'rules'")
        return self

    @model_validator(mode="after")
    def validate_ticker_source(self):
        if not self.tickers and not self.universe:
            raise ValueError("Debe proporcionar 'tickers' o 'universe'")
        if self.tickers and self.universe:
            raise ValueError("Proporcione solo 'tickers' o 'universe', no ambos")
        return self

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date <= self.start_date:
            raise ValueError("'end_date' debe ser posterior a 'start_date'")
        return self

    @model_validator(mode="after")
    def validate_interval(self):
        valid = {"1m", "5m", "15m", "1h", "4h", "1d", "1wk"}
        if self.interval not in valid:
            raise ValueError(f"'interval' debe ser uno de: {', '.join(sorted(valid))}")
        return self

    @model_validator(mode="after")
    def validate_allocations(self):
        if self.allocations and self.tickers:
            alloc_tickers = {a.ticker.upper() for a in self.allocations}
            input_tickers = {t.upper() for t in self.tickers}
            if alloc_tickers != input_tickers:
                raise ValueError("Los tickers en 'allocations' deben coincidir con 'tickers'")
            total = sum(a.weight_pct for a in self.allocations)
            if abs(total - 100.0) > 1.0:
                raise ValueError(f"Los pesos deben sumar ~100% (actual: {total:.1f}%)")
        return self


class PortfolioTickerResult(BaseModel):
    ticker: str
    weight_pct: float
    allocated_capital: float
    metrics: BacktestMetrics | None = None
    trades_count: int
    run_id: str

    model_config = {"from_attributes": True}


class PortfolioBacktestResponse(BaseModel):
    id: str
    strategy_name: str
    tickers: list[str]
    universe: str | None = None
    start_date: date
    end_date: date
    initial_capital: Decimal
    commission_pct: Decimal
    portfolio_metrics: BacktestMetrics | None = None
    equity_curve: list[EquityPoint] | None = None
    ticker_results: list[PortfolioTickerResult] = []
    failed_tickers: list[str] = []
    status: str = "running"
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class PortfolioRunSummary(BaseModel):
    id: str
    strategy_name: str | None = None
    ticker_count: int
    universe: str | None = None
    start_date: date
    end_date: date
    total_return_pct: float | None = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Strategy Signals (for chart overlay) ---

class SignalsRequest(BaseModel):
    strategy_id: UUID | None = Field(default=None)
    rules: StrategyRules | None = Field(default=None)
    ticker: str = Field(min_length=1, max_length=20)
    period: str = Field(default="3mo", description="Período de datos: 1d, 5d, 1mo, 3mo, 6mo, 1y, 5y, max")
    interval: str = Field(default="1d")

    @model_validator(mode="after")
    def validate_strategy_source(self):
        if not self.strategy_id and not self.rules:
            raise ValueError("Debe proporcionar 'strategy_id' o 'rules'")
        return self

    @model_validator(mode="after")
    def validate_interval(self):
        valid = {"1m", "5m", "15m", "1h", "4h", "1d", "1wk"}
        if self.interval not in valid:
            raise ValueError(f"'interval' debe ser uno de: {', '.join(sorted(valid))}")
        return self


class Signal(BaseModel):
    date: str
    type: str  # 'entry_long', 'entry_short', 'exit_long', 'exit_short'


class SignalsResponse(BaseModel):
    signals: list[Signal]
    ticker: str
