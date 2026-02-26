from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field


# --- Requests ---

class CourseCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)


# --- Responses ---

class CourseResponse(BaseModel):
    id: UUID
    name: str
    professor_id: UUID
    invite_code: str
    created_at: datetime | None = None

    model_config = {"from_attributes": True}
