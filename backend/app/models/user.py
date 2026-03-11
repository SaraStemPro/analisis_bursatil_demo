import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # username
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="student")
    course_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("courses.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    course: Mapped["Course | None"] = relationship(back_populates="students", foreign_keys=[course_id])
    portfolios: Mapped[list["Portfolio"]] = relationship(back_populates="user")
    conversations: Mapped[list["Conversation"]] = relationship(back_populates="user")
    indicator_presets: Mapped[list["IndicatorPreset"]] = relationship(back_populates="user")
    strategies: Mapped[list["Strategy"]] = relationship(back_populates="user")
    backtest_runs: Mapped[list["BacktestRun"]] = relationship(back_populates="user")


from .course import Course  # noqa: E402
from .portfolio import Portfolio  # noqa: E402
from .conversation import Conversation  # noqa: E402
from .indicator_preset import IndicatorPreset  # noqa: E402
from .strategy import Strategy  # noqa: E402
from .backtest_run import BacktestRun  # noqa: E402
