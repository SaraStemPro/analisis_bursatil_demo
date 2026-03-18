import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class BacktestPortfolioRun(Base):
    __tablename__ = "backtest_portfolio_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    strategy_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    strategy_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    universe: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tickers_json: Mapped[list] = mapped_column(JSON, nullable=False)
    allocations_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    initial_capital: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    commission_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    interval: Mapped[str] = mapped_column(String(10), default="1d")
    portfolio_metrics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    portfolio_equity_curve: Mapped[list | None] = mapped_column(JSON, nullable=True)
    failed_tickers: Mapped[list | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)

    child_runs: Mapped[list["BacktestRun"]] = relationship(back_populates="portfolio_run")


from .backtest_run import BacktestRun  # noqa: E402
