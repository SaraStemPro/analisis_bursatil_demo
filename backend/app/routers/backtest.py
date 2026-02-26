from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..schemas.backtest import (
    BacktestCompareRequest,
    BacktestCompareResponse,
    BacktestRunRequest,
    BacktestRunResponse,
    BacktestRunSummary,
    BacktestTradeResponse,
    StrategyCreateRequest,
    StrategyResponse,
    StrategyUpdateRequest,
)
from ..services import backtest_service
from ..utils.auth import get_current_user

router = APIRouter(prefix="/api/backtest", tags=["backtest"])


# --- Estrategias ---

@router.get("/strategies/templates", response_model=list[StrategyResponse])
def templates():
    return backtest_service.get_templates()


@router.get("/strategies", response_model=list[StrategyResponse])
def list_strategies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return backtest_service.get_user_strategies(db, current_user.id)


@router.post("/strategies", response_model=StrategyResponse, status_code=201)
def create_strategy(
    body: StrategyCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return backtest_service.create_strategy(db, current_user.id, body)


@router.get("/strategies/{strategy_id}", response_model=StrategyResponse)
def get_strategy(
    strategy_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return backtest_service.get_strategy(db, current_user.id, strategy_id)


@router.put("/strategies/{strategy_id}", response_model=StrategyResponse)
def update_strategy(
    strategy_id: str,
    body: StrategyUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return backtest_service.update_strategy(db, current_user.id, strategy_id, body)


@router.delete("/strategies/{strategy_id}", status_code=204)
def delete_strategy(
    strategy_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    backtest_service.delete_strategy(db, current_user.id, strategy_id)


# --- Ejecución ---

@router.post("/run", response_model=BacktestRunResponse, status_code=201)
def run_backtest(
    body: BacktestRunRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return backtest_service.run_backtest(db, current_user.id, body)


@router.get("/runs", response_model=list[BacktestRunSummary])
def list_runs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return backtest_service.get_runs(db, current_user.id)


@router.get("/runs/{run_id}", response_model=BacktestRunResponse)
def get_run(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return backtest_service.get_run(db, current_user.id, run_id)


@router.get("/runs/{run_id}/trades", response_model=list[BacktestTradeResponse])
def get_run_trades(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return backtest_service.get_run_trades(db, current_user.id, run_id)


@router.delete("/runs/{run_id}", status_code=204)
def delete_run(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    backtest_service.delete_run(db, current_user.id, run_id)


# --- Comparación ---

@router.post("/compare", response_model=BacktestCompareResponse)
def compare(
    body: BacktestCompareRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return backtest_service.compare_runs(db, current_user.id, body.run_ids)
