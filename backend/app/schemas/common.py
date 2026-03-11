from enum import Enum


class UserRole(str, Enum):
    student = "student"
    professor = "professor"
    admin = "admin"


class OrderType(str, Enum):
    buy = "buy"      # Abrir LONG
    sell = "sell"     # Abrir SHORT
    close = "close"  # Cerrar posicion (total o parcial)


class OrderStatus(str, Enum):
    open = "open"
    closed = "closed"
    cancelled = "cancelled"


class MessageRole(str, Enum):
    user = "user"
    assistant = "assistant"


class BacktestStatus(str, Enum):
    running = "running"
    completed = "completed"
    failed = "failed"


class ExitReason(str, Enum):
    signal = "signal"
    stop_loss = "stop_loss"
    take_profit = "take_profit"


class Comparator(str, Enum):
    greater_than = "greater_than"
    less_than = "less_than"
    crosses_above = "crosses_above"
    crosses_below = "crosses_below"
    between = "between"
    outside = "outside"


class LogicalOperator(str, Enum):
    AND = "AND"
    OR = "OR"


class ConditionOperandType(str, Enum):
    indicator = "indicator"
    price = "price"
    volume = "volume"
    value = "value"
    candle_pattern = "candle_pattern"


class PriceField(str, Enum):
    open = "open"
    high = "high"
    low = "low"
    close = "close"


class CandlePattern(str, Enum):
    bullish_engulfing = "bullish_engulfing"
    bearish_engulfing = "bearish_engulfing"
    bullish_hammer = "bullish_hammer"
    bearish_hammer = "bearish_hammer"
    bullish_marubozu = "bullish_marubozu"
    bearish_marubozu = "bearish_marubozu"
    bullish_long_line = "bullish_long_line"
    bearish_long_line = "bearish_long_line"


class StrategySide(str, Enum):
    long = "long"
    short = "short"
    both = "both"


class StopLossType(str, Enum):
    fixed = "fixed"
    fractal = "fractal"
