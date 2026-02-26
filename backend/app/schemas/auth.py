from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from .common import UserRole


# --- Requests ---

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=100)
    invite_code: str = Field(min_length=1, max_length=50)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class InviteCreateRequest(BaseModel):
    course_id: UUID


# --- Responses ---

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    role: UserRole
    course_id: UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class InviteResponse(BaseModel):
    invite_code: str
    course_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}
