import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class BacktestTrade(Base):
    __tablename__ = "backtest_trades"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("backtest_runs.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(10), nullable=False)
    entry_date: Mapped[datetime] = mapped_column(nullable=False)
    entry_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    exit_date: Mapped[datetime | None] = mapped_column(nullable=True)
    exit_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    pnl: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    pnl_pct: Mapped[Decimal | None] = mapped_column(Numeric(8, 4), nullable=True)
    exit_reason: Mapped[str | None] = mapped_column(String(20), nullable=True)
    duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    run: Mapped["BacktestRun"] = relationship(back_populates="trades")


from .backtest_run import BacktestRun  # noqa: E402
