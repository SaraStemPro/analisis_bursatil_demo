from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field

from .common import MessageRole


# --- Sub-models ---

class Source(BaseModel):
    document_id: UUID
    filename: str
    page: int | None = None
    chunk_text: str


# --- Requests ---

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: UUID | None = None


# --- Responses ---

class MessageResponse(BaseModel):
    id: UUID
    role: MessageRole
    content: str
    sources: list[Source] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatResponse(BaseModel):
    conversation_id: UUID
    message: MessageResponse


class ConversationResponse(BaseModel):
    id: UUID
    created_at: datetime
    last_message: str | None = None
    message_count: int

    model_config = {"from_attributes": True}


class DocumentResponse(BaseModel):
    id: UUID
    filename: str
    course_id: UUID | None = None
    uploaded_by: UUID
    processed: bool
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class ConversationMessagesResponse(BaseModel):
    id: UUID
    messages: list[MessageResponse]


class FAQItem(BaseModel):
    question: str
    count: int


class FAQResponse(BaseModel):
    items: list[FAQItem]
