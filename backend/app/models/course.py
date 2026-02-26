import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    professor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    invite_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    professor: Mapped["User"] = relationship(foreign_keys=[professor_id])
    students: Mapped[list["User"]] = relationship(back_populates="course", foreign_keys="User.course_id")
    documents: Mapped[list["Document"]] = relationship(back_populates="course")


from .user import User  # noqa: E402
from .document import Document  # noqa: E402
