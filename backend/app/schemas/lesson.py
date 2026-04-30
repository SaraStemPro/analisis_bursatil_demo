from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class LessonResponseUpsert(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)


class LessonResponseRead(BaseModel):
    lesson_id: str
    data: dict[str, Any]
    updated_at: datetime

    model_config = {"from_attributes": True}


class StudentLessonResponse(BaseModel):
    user_id: str
    user_name: str
    user_email: str
    lesson_id: str
    data: dict[str, Any]
    updated_at: datetime | None

    model_config = {"from_attributes": True}
