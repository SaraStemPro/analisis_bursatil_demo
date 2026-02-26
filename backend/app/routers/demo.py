from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..schemas.demo import (
    OrderCreateRequest,
    OrderResponse,
    PerformanceResponse,
    PortfolioResetRequest,
    PortfolioResponse,
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


@router.post("/reset", response_model=PortfolioResponse)
def reset(
    body: PortfolioResetRequest = PortfolioResetRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return demo_service.reset_portfolio(db, current_user.id, body.initial_balance)
