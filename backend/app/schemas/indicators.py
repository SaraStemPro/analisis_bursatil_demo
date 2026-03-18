from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field


# --- Sub-models ---

class IndicatorParam(BaseModel):
    name: str
    type: str = Field(description="int, float")
    default: float | int
    min: float | int | None = None
    max: float | int | None = None


class IndicatorDefinition(BaseModel):
    name: str
    display_name: str
    category: str = Field(description="tendencia, momentum, volatilidad, volumen, soporte_resistencia")
    overlay: bool = Field(description="True si se superpone al gráfico principal, False si va en panel separado")
    params: list[IndicatorParam]


class IndicatorRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    params: dict[str, float | int] = Field(default_factory=dict)


# --- Requests ---

class CalculateRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=20)
    period: str = Field(
        default="1mo",
        pattern=r"^(1d|5d|1mo|3mo|6mo|1y|5y|max)$",
    )
    interval: str = Field(
        default="1d",
        pattern=r"^(1m|5m|15m|30m|1h|1d|1wk|1mo)$",
    )
    indicators: list[IndicatorRequest] = Field(min_length=1, max_length=5)


class PresetCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    indicators: list[IndicatorRequest] = Field(min_length=1, max_length=5)


# --- Responses ---

class CatalogResponse(BaseModel):
    indicators: list[IndicatorDefinition]


class IndicatorSeries(BaseModel):
    name: str
    params: dict[str, float | int]
    data: dict[str, list[float | None]]


class CalculateResponse(BaseModel):
    ticker: str
    period: str
    interval: str
    indicators: list[IndicatorSeries]
    dates: list[str] = []


class PresetResponse(BaseModel):
    id: UUID
    name: str
    indicators: list[IndicatorRequest]
    created_at: datetime

    model_config = {"from_attributes": True}
