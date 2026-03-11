from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..schemas.demo import (
    ClosePositionRequest,
    OrderCreateRequest,
    OrderResponse,
    PerformanceResponse,
    PortfolioResetRequest,
    PortfolioResponse,
    PortfolioSummaryResponse,
)
from ..services import demo_service
from ..utils.auth import get_current_user

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.get("/portfolio", response_model=PortfolioResponse)
def portfolio(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return demo_service.get_portfolio(db, current_user.id)


@router.post("/order", response_model=OrderResponse, status_code=201)
def create_order(
    body: OrderCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return demo_service.create_order(db, current_user.id, body)


@router.get("/orders", response_model=list[OrderResponse])
def orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return demo_service.get_orders(db, current_user.id)


@router.get("/performance", response_model=PerformanceResponse)
def performance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return demo_service.get_performance(db, current_user.id)


@router.post("/close-position", response_model=OrderResponse, status_code=201)
def close_pos(
    body: ClosePositionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return demo_service.close_position(db, current_user.id, body)


@router.post("/close-all", response_model=list[OrderResponse], status_code=201)
def close_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return demo_service.close_all_positions(db, current_user.id)


@router.get("/portfolio/summary", response_model=PortfolioSummaryResponse)
def portfolio_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return demo_service.get_portfolio_summary(db, current_user.id)


@router.get("/carteras")
def get_carteras(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get list of named portfolio groups (carteras)."""
    return demo_service.get_carteras(db, current_user.id)


@router.post("/close-cartera/{cartera_name}", response_model=list[OrderResponse])
def close_cartera(
    cartera_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Close all positions in a named cartera."""
    return demo_service.close_cartera(db, current_user.id, cartera_name)


@router.post("/reset", response_model=PortfolioResponse)
def reset(
    body: PortfolioResetRequest = PortfolioResetRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return demo_service.reset_portfolio(db, current_user.id, body.initial_balance)


@router.get("/ranking")
def ranking(db: Session = Depends(get_db)):
    return demo_service.get_ranking(db)
