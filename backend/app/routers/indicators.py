from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.indicator_preset import IndicatorPreset
from ..models.user import User
from ..schemas.indicators import (
    CalculateRequest,
    CalculateResponse,
    CatalogResponse,
    PresetCreateRequest,
    PresetResponse,
    IndicatorRequest,
)
from ..services import indicator_service
from ..utils.auth import get_current_user

router = APIRouter(prefix="/api/indicators", tags=["indicators"])


@router.get("/catalog", response_model=CatalogResponse)
def catalog():
    return indicator_service.get_catalog()


@router.post("/calculate", response_model=CalculateResponse)
def calculate(body: CalculateRequest):
    return indicator_service.calculate_indicators(
        ticker=body.ticker,
        period=body.period,
        interval=body.interval,
        indicators=body.indicators,
    )


@router.get("/presets", response_model=list[PresetResponse])
def list_presets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    presets = (
        db.query(IndicatorPreset)
        .filter(IndicatorPreset.user_id == current_user.id)
        .order_by(IndicatorPreset.created_at.desc())
        .all()
    )
    return [
        PresetResponse(
            id=p.id,
            name=p.name,
            indicators=[IndicatorRequest(**i) for i in p.indicators],
            created_at=p.created_at,
        )
        for p in presets
    ]


@router.post("/presets", response_model=PresetResponse, status_code=201)
def create_preset(
    body: PresetCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    preset = IndicatorPreset(
        user_id=current_user.id,
        name=body.name,
        indicators=[i.model_dump() for i in body.indicators],
    )
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return PresetResponse(
        id=preset.id,
        name=preset.name,
        indicators=[IndicatorRequest(**i) for i in preset.indicators],
        created_at=preset.created_at,
    )
