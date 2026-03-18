from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

import pandas as pd
import yfinance as yf
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..models.backtest_run import BacktestRun
from ..models.backtest_trade import BacktestTrade
from ..models.backtest_portfolio_run import BacktestPortfolioRun
from ..models.strategy import Strategy
from ..schemas.backtest import (
    BacktestCompareResponse,
    BacktestMetrics,
    BacktestRunRequest,
    BacktestRunResponse,
    BacktestRunSummary,
    BacktestTradeResponse,
    ConditionGroup,
    ConditionOperand,
    EquityPoint,
    PortfolioBacktestRequest,
    PortfolioBacktestResponse,
    PortfolioRunSummary,
    PortfolioTickerResult,
    StrategyCreateRequest,
    StrategyResponse,
    StrategyRules,
    StrategyUpdateRequest,
)
from ..schemas.common import CandlePattern, Comparator, ConditionOperandType, StopLossType, StrategySide
from ..services import indicator_service

import numpy as np


# ──────────────────────────────────────
# Estrategias predefinidas (templates)
# ──────────────────────────────────────

TEMPLATES: list[dict] = [
    {
        "name": "Cruce Dorado",
        "description": "Compra cuando SMA 50 cruza por encima de SMA 200. Vende cuando cruza por debajo.",
        "rules": {
            "entry": {
                "operator": "AND",
                "conditions": [{
                    "left": {"type": "indicator", "name": "SMA", "params": {"length": 50}},
                    "comparator": "crosses_above",
                    "right": {"type": "indicator", "name": "SMA", "params": {"length": 200}},
                }],
            },
            "exit": {
                "operator": "AND",
                "conditions": [{
                    "left": {"type": "indicator", "name": "SMA", "params": {"length": 50}},
                    "comparator": "crosses_below",
                    "right": {"type": "indicator", "name": "SMA", "params": {"length": 200}},
                }],
            },
            "risk_management": {"stop_loss_pct": 10, "take_profit_pct": 25, "position_size_pct": 100},
        },
    },
    {
        "name": "Cruce de Muerte (Short)",
        "description": "Abre posición corta cuando SMA 50 cruza por debajo de SMA 200. Cierra cuando cruza por encima.",
        "rules": {
            "entry": {
                "operator": "AND",
                "conditions": [{
                    "left": {"type": "indicator", "name": "SMA", "params": {"length": 50}},
                    "comparator": "crosses_below",
                    "right": {"type": "indicator", "name": "SMA", "params": {"length": 200}},
                }],
            },
            "exit": {
                "operator": "AND",
                "conditions": [{
                    "left": {"type": "indicator", "name": "SMA", "params": {"length": 50}},
                    "comparator": "crosses_above",
                    "right": {"type": "indicator", "name": "SMA", "params": {"length": 200}},
                }],
            },
            "risk_management": {"stop_loss_pct": 10, "take_profit_pct": 25, "position_size_pct": 100},
            "side": "short",
        },
    },
    {
        "name": "RSI Reversión a la Media",
        "description": "Compra cuando RSI(14) < 30 (sobreventa). Vende cuando RSI(14) > 70 (sobrecompra).",
        "rules": {
            "entry": {
                "operator": "AND",
                "conditions": [{
                    "left": {"type": "indicator", "name": "RSI", "params": {"length": 14}},
                    "comparator": "less_than",
                    "right": {"type": "value", "value": 30},
                }],
            },
            "exit": {
                "operator": "AND",
                "conditions": [{
                    "left": {"type": "indicator", "name": "RSI", "params": {"length": 14}},
                    "comparator": "greater_than",
                    "right": {"type": "value", "value": 70},
                }],
            },
            "risk_management": {"stop_loss_pct": 5, "take_profit_pct": 15, "position_size_pct": 100},
        },
    },
    {
        "name": "MACD Signal",
        "description": "Compra cuando línea MACD cruza por encima de Signal. Vende cuando cruza por debajo.",
        "rules": {
            "entry": {
                "operator": "AND",
                "conditions": [{
                    "left": {"type": "indicator", "name": "MACD", "params": {"fast": 12, "slow": 26, "signal": 9}},
                    "comparator": "crosses_above",
                    "right": {"type": "value", "value": 0},
                }],
            },
            "exit": {
                "operator": "AND",
                "conditions": [{
                    "left": {"type": "indicator", "name": "MACD", "params": {"fast": 12, "slow": 26, "signal": 9}},
                    "comparator": "crosses_below",
                    "right": {"type": "value", "value": 0},
                }],
            },
            "risk_management": {"stop_loss_pct": 5, "take_profit_pct": 15, "position_size_pct": 100},
        },
    },
    {
        "name": "Bollinger Bounce",
        "description": "Compra cuando el precio toca la banda inferior de Bollinger. Vende en la banda superior.",
        "rules": {
            "entry": {
                "operator": "AND",
                "conditions": [{
                    "left": {"type": "price", "field": "close"},
                    "comparator": "less_than",
                    "right": {"type": "indicator", "name": "BBANDS", "params": {"length": 20, "std": 2, "band": "lower"}},
                }],
            },
            "exit": {
                "operator": "AND",
                "conditions": [{
                    "left": {"type": "price", "field": "close"},
                    "comparator": "greater_than",
                    "right": {"type": "indicator", "name": "BBANDS", "params": {"length": 20, "std": 2, "band": "upper"}},
                }],
            },
            "risk_management": {"stop_loss_pct": 3, "take_profit_pct": 10, "position_size_pct": 100},
        },
    },
    {
        "name": "EMA Momentum",
        "description": "Compra cuando precio cruza por encima de EMA 20 y RSI > 50. Vende cuando precio cruza por debajo de EMA 20.",
        "rules": {
            "entry": {
                "operator": "AND",
                "conditions": [
                    {
                        "left": {"type": "price", "field": "close"},
                        "comparator": "crosses_above",
                        "right": {"type": "indicator", "name": "EMA", "params": {"length": 20}},
                    },
                    {
                        "left": {"type": "indicator", "name": "RSI", "params": {"length": 14}},
                        "comparator": "greater_than",
                        "right": {"type": "value", "value": 50},
                    },
                ],
            },
            "exit": {
                "operator": "AND",
                "conditions": [{
                    "left": {"type": "price", "field": "close"},
                    "comparator": "crosses_below",
                    "right": {"type": "indicator", "name": "EMA", "params": {"length": 20}},
                }],
            },
            "risk_management": {"stop_loss_pct": 5, "take_profit_pct": 15, "position_size_pct": 100},
        },
    },
]


# ──────────────────────────────────────
# CRUD Estrategias
# ──────────────────────────────────────

def get_templates() -> list[StrategyResponse]:
    now = datetime.now(timezone.utc)
    return [
        StrategyResponse(
            id=UUID(int=i),
            name=t["name"],
            description=t["description"],
            is_template=True,
            rules=StrategyRules(**t["rules"]),
            created_at=now,
            updated_at=now,
        )
        for i, t in enumerate(TEMPLATES)
    ]


def get_user_strategies(db: Session, user_id: str) -> list[StrategyResponse]:
    strategies = (
        db.query(Strategy)
        .filter(Strategy.user_id == user_id, Strategy.is_template == False)
        .order_by(Strategy.created_at.desc())
        .all()
    )
    return [_strategy_to_response(s) for s in strategies]


def create_strategy(db: Session, user_id: str, body: StrategyCreateRequest) -> StrategyResponse:
    strategy = Strategy(
        user_id=user_id,
        name=body.name,
        description=body.description,
        is_template=False,
        rules=body.rules.model_dump(),
    )
    db.add(strategy)
    db.commit()
    db.refresh(strategy)
    return _strategy_to_response(strategy)


def get_strategy(db: Session, user_id: str, strategy_id: str) -> StrategyResponse:
    # Primero buscar en templates
    for i, t in enumerate(TEMPLATES):
        if str(UUID(int=i)) == strategy_id:
            now = datetime.now(timezone.utc)
            return StrategyResponse(
                id=UUID(int=i),
                name=t["name"],
                description=t["description"],
                is_template=True,
                rules=StrategyRules(**t["rules"]),
                created_at=now,
                updated_at=now,
            )

    strategy = (
        db.query(Strategy)
        .filter(Strategy.id == strategy_id, Strategy.user_id == user_id)
        .first()
    )
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estrategia no encontrada")
    return _strategy_to_response(strategy)


def update_strategy(db: Session, user_id: str, strategy_id: str, body: StrategyUpdateRequest) -> StrategyResponse:
    strategy = (
        db.query(Strategy)
        .filter(Strategy.id == strategy_id, Strategy.user_id == user_id, Strategy.is_template == False)
        .first()
    )
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estrategia no encontrada")

    if body.name is not None:
        strategy.name = body.name
    if body.description is not None:
        strategy.description = body.description
    if body.rules is not None:
        strategy.rules = body.rules.model_dump()

    db.commit()
    db.refresh(strategy)
    return _strategy_to_response(strategy)


def delete_strategy(db: Session, user_id: str, strategy_id: str) -> None:
    strategy = (
        db.query(Strategy)
        .filter(Strategy.id == strategy_id, Strategy.user_id == user_id, Strategy.is_template == False)
        .first()
    )
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estrategia no encontrada")
    db.delete(strategy)
    db.commit()


# ──────────────────────────────────────
# Motor de Backtesting
# ──────────────────────────────────────

def run_backtest(db: Session, user_id: str, body: BacktestRunRequest) -> BacktestRunResponse:
    # Obtener reglas: inline o desde estrategia guardada
    if body.rules:
        rules = body.rules
        strategy_id = str(body.strategy_id) if body.strategy_id else None
        strategy_name = body.strategy_name or "Prueba rápida"
    else:
        strategy_id = str(body.strategy_id)
        strategy_resp = get_strategy(db, user_id, strategy_id)
        rules = strategy_resp.rules
        strategy_name = strategy_resp.name

    # Crear registro del run
    run = BacktestRun(
        user_id=user_id,
        strategy_id=strategy_id,
        strategy_name=strategy_name,
        ticker=body.ticker.upper(),
        start_date=body.start_date,
        end_date=body.end_date,
        initial_capital=body.initial_capital,
        commission_pct=body.commission_pct,
        status="running",
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        # Calcular período de warmup según indicadores usados
        warmup_bars = _calc_warmup(rules)

        # Descargar datos con warmup extra
        tk = yf.Ticker(body.ticker)
        interval = body.interval if hasattr(body, "interval") else "1d"
        # Calcular warmup en tiempo real según intervalo
        if interval in ("1m", "5m", "15m"):
            warmup_td = pd.Timedelta(hours=warmup_bars)
        elif interval in ("1h", "4h"):
            warmup_td = pd.Timedelta(days=warmup_bars // 6 + 1)
        else:
            warmup_td = pd.Timedelta(days=int(warmup_bars * 1.6))
        warmup_start = pd.Timestamp(body.start_date) - warmup_td
        df = tk.history(start=warmup_start.strftime("%Y-%m-%d"), end=body.end_date.isoformat(), interval=interval)

        if df.empty:
            raise ValueError(f"Sin datos para {body.ticker} en el rango indicado")

        # Calcular indicadores sobre todo el dataset (incluido warmup)
        indicator_data = _compute_all_indicators(df, rules)

        # Encontrar el índice donde empieza el rango real del usuario
        sim_start_idx = 0
        start_ts = pd.Timestamp(body.start_date, tz=df.index.tz)
        for idx_i in range(len(df)):
            if df.index[idx_i] >= start_ts:
                sim_start_idx = idx_i
                break

        # Ejecutar simulación solo desde sim_start_idx
        trades, equity_curve = _simulate(
            df=df,
            rules=rules,
            indicator_data=indicator_data,
            initial_capital=float(body.initial_capital),
            commission_pct=float(body.commission_pct),
            position_size_pct=rules.risk_management.position_size_pct,
            sim_start_idx=sim_start_idx,
        )

        # Guardar trades
        db_trades = []
        for t in trades:
            bt = BacktestTrade(
                run_id=run.id,
                type=t["type"],
                entry_date=t["entry_date"],
                entry_price=Decimal(str(round(t["entry_price"], 2))),
                exit_date=t.get("exit_date"),
                exit_price=Decimal(str(round(t["exit_price"], 2))) if t.get("exit_price") else None,
                quantity=Decimal(str(round(t["quantity"], 4))),
                pnl=Decimal(str(round(t["pnl"], 2))) if t.get("pnl") is not None else None,
                pnl_pct=Decimal(str(round(t["pnl_pct"], 4))) if t.get("pnl_pct") is not None else None,
                exit_reason=t.get("exit_reason"),
                duration_days=t.get("duration_days"),
            )
            db.add(bt)
            db_trades.append(bt)

        # Calcular métricas
        metrics = _calculate_metrics(trades, equity_curve, float(body.initial_capital), df)

        # Actualizar run
        run.status = "completed"
        run.metrics = metrics.model_dump()
        run.equity_curve = [{"date": e.date.isoformat(), "equity": e.equity} for e in equity_curve]
        run.completed_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(run)

        return _run_to_response(run, db_trades, metrics, equity_curve)

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.completed_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


def get_runs(db: Session, user_id: str) -> list[BacktestRunSummary]:
    runs = (
        db.query(BacktestRun)
        .filter(BacktestRun.user_id == user_id)
        .order_by(BacktestRun.created_at.desc())
        .all()
    )
    results = []
    for r in runs:
        if r.strategy_name:
            strategy_name = r.strategy_name
        elif r.strategy_id:
            strategy = db.query(Strategy).filter(Strategy.id == r.strategy_id).first()
            strategy_name = strategy.name if strategy else _get_template_name(r.strategy_id)
        else:
            strategy_name = "Prueba rápida"
        metrics = r.metrics or {}
        results.append(BacktestRunSummary(
            id=r.id,
            strategy_id=r.strategy_id,
            strategy_name=strategy_name,
            ticker=r.ticker,
            start_date=r.start_date,
            end_date=r.end_date,
            status=r.status,
            total_return_pct=metrics.get("total_return_pct"),
            total_trades=metrics.get("total_trades"),
            created_at=r.created_at,
        ))
    return results


def get_run(db: Session, user_id: str, run_id: str) -> BacktestRunResponse:
    run = db.query(BacktestRun).filter(BacktestRun.id == run_id, BacktestRun.user_id == user_id).first()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backtest no encontrado")

    trades = db.query(BacktestTrade).filter(BacktestTrade.run_id == run.id).all()
    metrics = BacktestMetrics(**run.metrics) if run.metrics else None
    equity = [EquityPoint(date=date.fromisoformat(e["date"]), equity=e["equity"]) for e in (run.equity_curve or [])]

    return _run_to_response(run, trades, metrics, equity)


def get_run_trades(db: Session, user_id: str, run_id: str) -> list[BacktestTradeResponse]:
    run = db.query(BacktestRun).filter(BacktestRun.id == run_id, BacktestRun.user_id == user_id).first()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backtest no encontrado")

    trades = db.query(BacktestTrade).filter(BacktestTrade.run_id == run.id).all()
    return [_trade_to_response(t) for t in trades]


def delete_run(db: Session, user_id: str, run_id: str) -> None:
    run = db.query(BacktestRun).filter(BacktestRun.id == run_id, BacktestRun.user_id == user_id).first()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backtest no encontrado")
    db.query(BacktestTrade).filter(BacktestTrade.run_id == run.id).delete()
    db.delete(run)
    db.commit()


def delete_all_runs(db: Session, user_id: str) -> None:
    # Delete portfolio runs first (cascade to child runs)
    portfolio_runs = db.query(BacktestPortfolioRun).filter(BacktestPortfolioRun.user_id == user_id).all()
    for pr in portfolio_runs:
        child_runs = db.query(BacktestRun).filter(BacktestRun.portfolio_run_id == pr.id).all()
        for cr in child_runs:
            db.query(BacktestTrade).filter(BacktestTrade.run_id == cr.id).delete()
            db.delete(cr)
        db.delete(pr)

    # Delete remaining single runs
    runs = db.query(BacktestRun).filter(BacktestRun.user_id == user_id).all()
    for r in runs:
        db.query(BacktestTrade).filter(BacktestTrade.run_id == r.id).delete()
        db.delete(r)

    db.commit()


def compare_runs(db: Session, user_id: str, run_ids: list[UUID]) -> BacktestCompareResponse:
    runs = []
    for rid in run_ids:
        run_resp = get_run(db, user_id, str(rid))
        runs.append(run_resp)
    return BacktestCompareResponse(runs=runs)


# ──────────────────────────────────────
# Detección de patrones de velas
# ──────────────────────────────────────

def _detect_candle_patterns(df: pd.DataFrame) -> dict[str, pd.Series]:
    """Detecta patrones de velas. Devuelve series booleanas (1.0 si patrón presente, 0.0 si no)."""
    o, h, l, c = df["Open"], df["High"], df["Low"], df["Close"]
    body = (c - o).abs()
    full_range = h - l
    upper_shadow = h - pd.concat([o, c], axis=1).max(axis=1)
    lower_shadow = pd.concat([o, c], axis=1).min(axis=1) - l

    prev_body = body.shift(1)
    prev_o = o.shift(1)
    prev_c = c.shift(1)

    patterns = {}

    # Envolvente alcista: vela bajista seguida de vela alcista que envuelve
    patterns[CandlePattern.bullish_engulfing.value] = (
        (prev_c < prev_o) & (c > o) &
        (o <= prev_c) & (c >= prev_o) &
        (body > prev_body)
    ).astype(float)

    # Envolvente bajista: vela alcista seguida de vela bajista que envuelve
    patterns[CandlePattern.bearish_engulfing.value] = (
        (prev_c > prev_o) & (c < o) &
        (o >= prev_c) & (c <= prev_o) &
        (body > prev_body)
    ).astype(float)

    # Martillo alcista: cuerpo pequeño arriba, sombra inferior larga (>2x cuerpo)
    patterns[CandlePattern.bullish_hammer.value] = (
        (lower_shadow >= 2 * body) &
        (upper_shadow <= body * 0.5) &
        (body > 0) &
        (full_range > 0)
    ).astype(float)

    # Martillo bajista (shooting star): cuerpo pequeño abajo, sombra superior larga
    patterns[CandlePattern.bearish_hammer.value] = (
        (upper_shadow >= 2 * body) &
        (lower_shadow <= body * 0.5) &
        (body > 0) &
        (full_range > 0)
    ).astype(float)

    # Vela 20/20 alcista: marubozu (cuerpo >=90%) OR long line (cuerpo >=70% y significativo)
    bullish_marubozu = (c > o) & (body >= 0.9 * full_range) & (full_range > 0)
    bullish_longline = (
        (c > o) & (body >= 0.7 * full_range) & (full_range > 0)
        & (body > body.rolling(20, min_periods=1).mean() * 1.5)
    )
    patterns[CandlePattern.bullish_2020.value] = (bullish_marubozu | bullish_longline).astype(float)

    # Vela 20/20 bajista
    bearish_marubozu = (c < o) & (body >= 0.9 * full_range) & (full_range > 0)
    bearish_longline = (
        (c < o) & (body >= 0.7 * full_range) & (full_range > 0)
        & (body > body.rolling(20, min_periods=1).mean() * 1.5)
    )
    patterns[CandlePattern.bearish_2020.value] = (bearish_marubozu | bearish_longline).astype(float)

    return {k: v.fillna(0.0) for k, v in patterns.items()}


# ──────────────────────────────────────
# Motor de simulación interno
# ──────────────────────────────────────

def _compute_all_indicators(df: pd.DataFrame, rules: StrategyRules) -> dict[str, pd.Series]:
    """Calcula todos los indicadores y patrones de velas referenciados en las reglas."""
    needed: dict[str, tuple[str, dict]] = {}
    needs_patterns = False
    needs_fractals_for_stop = rules.risk_management.stop_loss_type == StopLossType.fractal

    for group in [rules.entry, rules.exit]:
        for cond in group.conditions:
            for operand in [cond.left, cond.right]:
                if operand.type == ConditionOperandType.indicator and operand.name:
                    # Strip 'band' from params for key/calculation (it's only for selection)
                    calc_params = {k: v for k, v in (operand.params or {}).items() if k != "band"}
                    key = f"{operand.name}_{_params_key(calc_params)}"
                    needed[key] = (operand.name.upper(), calc_params)
                elif operand.type == ConditionOperandType.candle_pattern:
                    needs_patterns = True
            if cond.right_upper and cond.right_upper.type == ConditionOperandType.indicator:
                calc_params = {k: v for k, v in (cond.right_upper.params or {}).items() if k != "band"}
                key = f"{cond.right_upper.name}_{_params_key(calc_params)}"
                needed[key] = (cond.right_upper.name.upper(), calc_params)

    data: dict[str, pd.Series] = {}

    for key, (name, params) in needed.items():
        if name == "SMA":
            data[key] = indicator_service._sma(df["Close"], int(params.get("length", 20)))
        elif name == "EMA":
            data[key] = indicator_service._ema(df["Close"], int(params.get("length", 20)))
        elif name == "RSI":
            data[key] = indicator_service._rsi(df["Close"], int(params.get("length", 14)))
        elif name == "MACD":
            result = indicator_service._macd(df["Close"], int(params.get("fast", 12)), int(params.get("slow", 26)), int(params.get("signal", 9)))
            data[key] = result["macd"]
            data[f"{key}_signal"] = result["signal"]
        elif name == "BBANDS":
            result = indicator_service._bbands(df["Close"], int(params.get("length", 20)), float(params.get("std", 2.0)))
            data[f"{key}_lower"] = result["bbl"]
            data[f"{key}_mid"] = result["bbm"]
            data[f"{key}_upper"] = result["bbu"]
        elif name == "STOCH":
            result = indicator_service._stoch(df["High"], df["Low"], df["Close"], int(params.get("k", 14)), int(params.get("d", 3)))
            data[key] = result["stochk"]
        elif name == "ATR":
            data[key] = indicator_service._atr(df["High"], df["Low"], df["Close"], int(params.get("length", 14)))
        elif name == "OBV":
            data[key] = indicator_service._obv(df["Close"], df["Volume"])
        elif name == "VWAP":
            data[key] = indicator_service._vwap(df["High"], df["Low"], df["Close"], df["Volume"])
        elif name == "FRACTALS":
            period = int(params.get("period", 21))
            result = indicator_service._fractals(df["High"], df["Low"], period)
            data[f"{key}_up"] = result["fractal_up"]
            data[f"{key}_down"] = result["fractal_down"]

    # Compute fractals for dynamic stop if needed
    if needs_fractals_for_stop and "_stop_fractal_down" not in data:
        result = indicator_service._fractals(df["High"], df["Low"], 21)
        data["_stop_fractal_down"] = result["fractal_down"]
        data["_stop_fractal_up"] = result["fractal_up"]

    # Compute candle patterns if needed
    if needs_patterns:
        patterns = _detect_candle_patterns(df)
        for pname, pseries in patterns.items():
            data[f"_pattern_{pname}"] = pseries

    return data


def _get_operand_value(operand: ConditionOperand, i: int, df: pd.DataFrame, indicator_data: dict) -> float | None:
    """Obtiene el valor numérico de un operando en el índice i."""
    if operand.type == ConditionOperandType.value:
        return operand.value
    elif operand.type == ConditionOperandType.price:
        field_map = {"open": "Open", "high": "High", "low": "Low", "close": "Close"}
        col = field_map.get(operand.field.value, "Close") if operand.field else "Close"
        return float(df.iloc[i][col])
    elif operand.type == ConditionOperandType.volume:
        return float(df.iloc[i]["Volume"])
    elif operand.type == ConditionOperandType.candle_pattern:
        pattern_name = operand.pattern.value if operand.pattern else ""
        series = indicator_data.get(f"_pattern_{pattern_name}")
        if series is None:
            return 0.0
        val = series.iloc[i]
        return 0.0 if pd.isna(val) else float(val)
    elif operand.type == ConditionOperandType.indicator:
        params = operand.params or {}
        # Excluir 'band' del key para que coincida con el key de cálculo
        calc_params = {k: v for k, v in params.items() if k != "band"}
        key = f"{operand.name}_{_params_key(calc_params)}"
        name = operand.name.upper() if operand.name else ""
        if name == "BBANDS":
            band = str(params.get("band", "lower"))
            series = indicator_data.get(f"{key}_{band}")
        elif name == "FRACTALS":
            series = indicator_data.get(f"{key}_down")
        else:
            series = indicator_data.get(key)
        if series is None:
            return None
        val = series.iloc[i]
        return None if pd.isna(val) else float(val)
    return None


def _evaluate_condition(cond, i: int, df: pd.DataFrame, indicator_data: dict, is_exit: bool = False) -> bool:
    """Evalúa una condición en el índice i, con soporte de offset (velas atrás)."""
    get_val = _get_operand_value
    offset = cond.offset if hasattr(cond, "offset") and cond.offset else 0
    eval_i = i - offset

    if eval_i < 0:
        return False

    left_val = get_val(cond.left, eval_i, df, indicator_data)
    right_val = get_val(cond.right, eval_i, df, indicator_data)

    if left_val is None or right_val is None:
        return False

    comp = cond.comparator

    if comp == Comparator.greater_than:
        return left_val > right_val
    elif comp == Comparator.less_than:
        return left_val < right_val
    elif comp in (Comparator.crosses_above, Comparator.crosses_below):
        if eval_i < 1:
            return False
        prev_left = get_val(cond.left, eval_i - 1, df, indicator_data)
        prev_right = get_val(cond.right, eval_i - 1, df, indicator_data)
        if prev_left is None or prev_right is None:
            return False
        if comp == Comparator.crosses_above:
            return prev_left <= prev_right and left_val > right_val
        else:
            return prev_left >= prev_right and left_val < right_val
    elif comp == Comparator.between:
        upper_val = get_val(cond.right_upper, eval_i, df, indicator_data) if cond.right_upper else None
        if upper_val is None:
            return False
        return right_val <= left_val <= upper_val
    elif comp == Comparator.outside:
        upper_val = get_val(cond.right_upper, eval_i, df, indicator_data) if cond.right_upper else None
        if upper_val is None:
            return False
        return left_val < right_val or left_val > upper_val

    return False


def _evaluate_group(group: ConditionGroup, i: int, df: pd.DataFrame, indicator_data: dict, is_exit: bool = False) -> bool:
    """Evalúa un grupo de condiciones con operador AND/OR."""
    results = [_evaluate_condition(c, i, df, indicator_data, is_exit) for c in group.conditions]
    if group.operator.value == "AND":
        return all(results)
    return any(results)


def _find_last_fractal_support(indicator_data: dict, i: int, entry_price: float) -> float | None:
    """Encuentra el último fractal inferior (soporte) por debajo del precio de entrada."""
    series = indicator_data.get("_stop_fractal_down")
    if series is None:
        return None
    for j in range(i, -1, -1):
        val = series.iloc[j]
        if not pd.isna(val) and float(val) < entry_price:
            return float(val)
    return None


def _find_last_fractal_resistance(indicator_data: dict, i: int, entry_price: float) -> float | None:
    """Encuentra el último fractal superior (resistencia) por encima del precio de entrada."""
    series = indicator_data.get("_stop_fractal_up")
    if series is None:
        return None
    for j in range(i, -1, -1):
        val = series.iloc[j]
        if not pd.isna(val) and float(val) > entry_price:
            return float(val)
    return None


def _calc_warmup(rules: StrategyRules) -> int:
    """Calcula las barras de warmup necesarias según los indicadores usados."""
    max_period = 50  # mínimo razonable
    for group in [rules.entry, rules.exit]:
        for cond in group.conditions:
            for operand in [cond.left, cond.right]:
                if operand.type == ConditionOperandType.indicator and operand.params:
                    for k, v in operand.params.items():
                        if k in ("length", "slow", "period") and isinstance(v, (int, float)):
                            max_period = max(max_period, int(v))
            if cond.right_upper and cond.right_upper.type == ConditionOperandType.indicator and cond.right_upper.params:
                for k, v in cond.right_upper.params.items():
                    if k in ("length", "slow", "period") and isinstance(v, (int, float)):
                        max_period = max(max_period, int(v))
    return max_period + 20  # extra buffer


def _open_position(capital: float, close: float, pos_is_short: bool, rules: StrategyRules,
                   indicator_data: dict, i: int, current_date, commission_pct: float,
                   position_size_pct: float):
    """Abre una posición y devuelve (position_dict, capital_restante) o (None, capital)."""
    stop_loss_pct = rules.risk_management.stop_loss_pct
    stop_loss_type = rules.risk_management.stop_loss_type
    max_risk_pct = rules.risk_management.max_risk_pct

    stop_price = None
    if stop_loss_type == StopLossType.fractal:
        if pos_is_short:
            stop_price = _find_last_fractal_resistance(indicator_data, i, close)
        else:
            stop_price = _find_last_fractal_support(indicator_data, i, close)
        if stop_price is None and stop_loss_pct:
            stop_price = close * (1 + stop_loss_pct / 100) if pos_is_short else close * (1 - stop_loss_pct / 100)
    elif stop_loss_pct:
        stop_price = close * (1 + stop_loss_pct / 100) if pos_is_short else close * (1 - stop_loss_pct / 100)

    if max_risk_pct and stop_price:
        risk_per_share = abs(close - stop_price)
        if risk_per_share > 0:
            risk_amount = capital * (max_risk_pct / 100)
            quantity = risk_amount / risk_per_share
            invest = quantity * close
            if invest > capital * (position_size_pct / 100):
                invest = capital * (position_size_pct / 100)
                commission = invest * (commission_pct / 100)
                quantity = (invest - commission) / close
            else:
                commission = invest * (commission_pct / 100)
                invest += commission
                if invest > capital:
                    invest = capital
                    commission = invest * (commission_pct / 100)
                    quantity = (invest - commission) / close
        else:
            invest = capital * (position_size_pct / 100)
            commission = invest * (commission_pct / 100)
            quantity = (invest - commission) / close
    else:
        invest = capital * (position_size_pct / 100)
        commission = invest * (commission_pct / 100)
        quantity = (invest - commission) / close

    if quantity <= 0:
        return None, capital

    pos = {
        "entry_date": current_date,
        "entry_price": close,
        "quantity": quantity,
        "commission_in": commission,
        "stop_price": stop_price,
        "invested": min(invest, capital),
        "is_short": pos_is_short,
    }
    return pos, capital - min(invest, capital)


def _close_position(position: dict, close: float, current_date, commission_pct: float,
                    exit_reason: str) -> tuple[dict, float]:
    """Cierra una posición y devuelve (trade_dict, capital_devuelto)."""
    entry_price = position["entry_price"]
    pos_is_short = position["is_short"]
    commission = position["quantity"] * close * (commission_pct / 100)

    if pos_is_short:
        pnl = (entry_price - close) * position["quantity"] - position["commission_in"] - commission
        pnl_pct = (entry_price - close) / entry_price * 100
        capital_back = position["invested"] + pnl
    else:
        revenue = position["quantity"] * close
        capital_back = revenue - commission
        pnl = (close - entry_price) * position["quantity"] - position["commission_in"] - commission
        pnl_pct = (close - entry_price) / entry_price * 100

    duration = (current_date - position["entry_date"]).days
    trade = {
        "type": "sell" if pos_is_short else "buy",
        "entry_date": position["entry_date"],
        "entry_price": entry_price,
        "exit_date": current_date,
        "exit_price": close,
        "quantity": position["quantity"],
        "pnl": pnl,
        "pnl_pct": pnl_pct,
        "exit_reason": exit_reason,
        "duration_days": duration,
    }
    return trade, capital_back


def _simulate(
    df: pd.DataFrame,
    rules: StrategyRules,
    indicator_data: dict,
    initial_capital: float,
    commission_pct: float,
    position_size_pct: float,
    sim_start_idx: int = 0,
) -> tuple[list[dict], list[EquityPoint]]:
    """Ejecuta la simulación. Soporta long, short y both.

    Modo both:
    - Señal de entrada → abre Long
    - Señal de salida → abre Short
    - Cada posición se cierra por su señal contraria, stop o take profit
    - Si al cerrar una posición la señal opuesta está activa, abre la contraria
    """
    capital = initial_capital
    position = None
    trades = []
    equity_curve = []

    side = rules.side
    is_both = side == StrategySide.both
    stop_loss_pct = rules.risk_management.stop_loss_pct
    take_profit_pct = rules.risk_management.take_profit_pct

    for i in range(len(df)):
        current_date = df.index[i].to_pydatetime()
        close = float(df.iloc[i]["Close"])

        if i < sim_start_idx:
            continue

        if position is None:
            # Sin posición → evaluar si hay señal para abrir
            if is_both:
                # Señal de entrada → Long, señal de salida → Short
                entry_signal = _evaluate_group(rules.entry, i, df, indicator_data, is_exit=False)
                exit_signal = _evaluate_group(rules.exit, i, df, indicator_data, is_exit=True)
                if entry_signal:
                    position, capital = _open_position(
                        capital, close, False, rules, indicator_data, i,
                        current_date, commission_pct, position_size_pct)
                elif exit_signal:
                    position, capital = _open_position(
                        capital, close, True, rules, indicator_data, i,
                        current_date, commission_pct, position_size_pct)
            else:
                if _evaluate_group(rules.entry, i, df, indicator_data, is_exit=False):
                    open_short = side == StrategySide.short
                    position, capital = _open_position(
                        capital, close, open_short, rules, indicator_data, i,
                        current_date, commission_pct, position_size_pct)
        else:
            exit_reason = None
            pos_is_short = position["is_short"]
            entry_price = position["entry_price"]

            # Check stop loss
            stop_price = position.get("stop_price")
            if stop_price:
                if pos_is_short and close >= stop_price:
                    exit_reason = "stop_loss"
                elif not pos_is_short and close <= stop_price:
                    exit_reason = "stop_loss"

            if not exit_reason and stop_loss_pct and not stop_price:
                if pos_is_short:
                    pnl_pct_cur = (entry_price - close) / entry_price * 100
                else:
                    pnl_pct_cur = (close - entry_price) / entry_price * 100
                if pnl_pct_cur <= -stop_loss_pct:
                    exit_reason = "stop_loss"

            # Check take profit
            if not exit_reason and take_profit_pct:
                if pos_is_short:
                    pnl_pct_cur = (entry_price - close) / entry_price * 100
                else:
                    pnl_pct_cur = (close - entry_price) / entry_price * 100
                if pnl_pct_cur >= take_profit_pct:
                    exit_reason = "take_profit"

            # Check signal exit
            if not exit_reason:
                if is_both:
                    # Long se cierra con señal de salida, Short se cierra con señal de entrada
                    if pos_is_short:
                        signal_exit = _evaluate_group(rules.entry, i, df, indicator_data, is_exit=False)
                    else:
                        signal_exit = _evaluate_group(rules.exit, i, df, indicator_data, is_exit=True)
                else:
                    signal_exit = _evaluate_group(rules.exit, i, df, indicator_data, is_exit=True)
                if signal_exit:
                    exit_reason = "signal"

            if exit_reason:
                trade, capital_back = _close_position(position, close, current_date, commission_pct, exit_reason)
                capital += capital_back
                trades.append(trade)
                position = None

                # Modo both: tras cerrar, si la señal opuesta está activa, abrir
                if is_both and exit_reason == "signal":
                    if pos_is_short:
                        # Cerré short por señal de entrada → la entrada está activa → abrir Long
                        position, capital = _open_position(
                            capital, close, False, rules, indicator_data, i,
                            current_date, commission_pct, position_size_pct)
                    else:
                        # Cerré long por señal de salida → la salida está activa → abrir Short
                        position, capital = _open_position(
                            capital, close, True, rules, indicator_data, i,
                            current_date, commission_pct, position_size_pct)

        # Equity
        if position:
            if position["is_short"]:
                unrealized = (position["entry_price"] - close) * position["quantity"]
                pos_value = position["invested"] + unrealized
            else:
                pos_value = position["quantity"] * close
        else:
            pos_value = 0
        equity_curve.append(EquityPoint(date=current_date.date(), equity=round(capital + pos_value, 2)))

    # Cerrar posición abierta al final
    if position:
        close = float(df.iloc[-1]["Close"])
        current_date = df.index[-1].to_pydatetime()
        trade, capital_back = _close_position(position, close, current_date, commission_pct, "signal")
        capital += capital_back
        trades.append(trade)

    return trades, equity_curve


def _calculate_metrics(
    trades: list[dict],
    equity_curve: list[EquityPoint],
    initial_capital: float,
    df: pd.DataFrame,
) -> BacktestMetrics:
    """Calcula métricas de rendimiento del backtest."""
    if not equity_curve:
        return BacktestMetrics(
            total_return=0, total_return_pct=0, max_drawdown=0, max_drawdown_pct=0,
            win_rate=0, total_trades=0,
        )

    final_equity = equity_curve[-1].equity
    total_return = final_equity - initial_capital
    total_return_pct = total_return / initial_capital * 100

    # Annualized return
    days = (equity_curve[-1].date - equity_curve[0].date).days
    annualized = ((final_equity / initial_capital) ** (365 / days) - 1) * 100 if days > 0 else None

    # Sharpe ratio (simplificado, daily returns)
    equities = [e.equity for e in equity_curve]
    daily_returns = [(equities[i] - equities[i - 1]) / equities[i - 1] for i in range(1, len(equities)) if equities[i - 1] != 0]
    if daily_returns and len(daily_returns) > 1:
        import statistics
        mean_r = statistics.mean(daily_returns)
        std_r = statistics.stdev(daily_returns)
        sharpe = (mean_r / std_r) * (252 ** 0.5) if std_r > 0 else None
    else:
        sharpe = None

    # Max drawdown
    peak = 0
    max_dd = 0
    for e in equities:
        if e > peak:
            peak = e
        dd = peak - e
        if dd > max_dd:
            max_dd = dd
    max_dd_pct = max_dd / peak * 100 if peak > 0 else 0

    # Trade stats
    pnls = [t["pnl"] for t in trades]
    winners = [p for p in pnls if p > 0]
    losers = [p for p in pnls if p <= 0]
    win_rate = len(winners) / len(pnls) * 100 if pnls else 0

    gross_profit = sum(winners) if winners else 0
    gross_loss = abs(sum(losers)) if losers else 0
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else None

    durations = [t["duration_days"] for t in trades if t.get("duration_days") is not None]

    # Buy & hold benchmark
    first_close = float(df.iloc[0]["Close"])
    last_close = float(df.iloc[-1]["Close"])
    bh_return_pct = (last_close - first_close) / first_close * 100

    return BacktestMetrics(
        total_return=round(total_return, 2),
        total_return_pct=round(total_return_pct, 2),
        annualized_return_pct=round(annualized, 2) if annualized is not None else None,
        sharpe_ratio=round(sharpe, 2) if sharpe is not None else None,
        max_drawdown=round(max_dd, 2),
        max_drawdown_pct=round(max_dd_pct, 2),
        win_rate=round(win_rate, 2),
        profit_factor=round(profit_factor, 2) if profit_factor is not None else None,
        total_trades=len(trades),
        avg_trade_duration_days=round(sum(durations) / len(durations), 1) if durations else None,
        best_trade_pnl=round(max(pnls), 2) if pnls else None,
        worst_trade_pnl=round(min(pnls), 2) if pnls else None,
        buy_and_hold_return_pct=round(bh_return_pct, 2),
    )


# ──────────────────────────────────────
# Portfolio backtest (multi-ticker)
# ──────────────────────────────────────

MAX_PORTFOLIO_TICKERS = 50

UNIVERSE_LABELS: dict[str, str] = {
    "sp500": "S&P 500",
    "ibex35": "IBEX 35",
    "tech": "Tecnología",
    "healthcare": "Salud",
    "finance": "Finanzas",
    "energy": "Energía",
    "industrials": "Industriales",
    "consumer": "Consumo",
    "indices": "Índices",
    "currencies": "Divisas",
    "commodities": "Materias Primas",
}


def get_backtest_universes() -> dict[str, dict]:
    from ..services.market_service import UNIVERSES
    return {
        name: {"label": UNIVERSE_LABELS.get(name, name), "count": len(tickers)}
        for name, tickers in UNIVERSES.items()
        if name != "all"
    }


def run_portfolio_backtest(
    db: Session, user_id: str, body: PortfolioBacktestRequest
) -> PortfolioBacktestResponse:
    import logging
    logger = logging.getLogger(__name__)

    # 1. Resolve tickers
    if body.universe:
        from ..services.market_service import UNIVERSES
        tickers = UNIVERSES.get(body.universe, [])
        if not tickers:
            raise HTTPException(status_code=400, detail=f"Universo '{body.universe}' no encontrado")
    else:
        tickers = [t.upper() for t in body.tickers]

    # Limit tickers
    if len(tickers) > MAX_PORTFOLIO_TICKERS:
        tickers = tickers[:MAX_PORTFOLIO_TICKERS]

    # 2. Resolve rules
    if body.rules:
        rules = body.rules
        strategy_id = str(body.strategy_id) if body.strategy_id else None
        strategy_name = body.strategy_name or "Prueba rápida"
    else:
        strategy_id = str(body.strategy_id)
        strategy_resp = get_strategy(db, user_id, strategy_id)
        rules = strategy_resp.rules
        strategy_name = strategy_resp.name

    # 3. Calculate allocations
    if body.allocations:
        alloc_map = {a.ticker.upper(): a.weight_pct for a in body.allocations}
    else:
        weight = round(100.0 / len(tickers), 4)
        alloc_map = {t: weight for t in tickers}

    # 4. Create portfolio run record
    portfolio_run = BacktestPortfolioRun(
        user_id=user_id,
        strategy_id=strategy_id,
        strategy_name=strategy_name,
        universe=body.universe,
        tickers_json=tickers,
        allocations_json=alloc_map,
        initial_capital=body.initial_capital,
        commission_pct=body.commission_pct,
        start_date=body.start_date,
        end_date=body.end_date,
        interval=body.interval,
        status="running",
    )
    db.add(portfolio_run)
    db.commit()
    db.refresh(portfolio_run)

    try:
        # 5. Run each ticker
        ticker_results: list[PortfolioTickerResult] = []
        failed_tickers: list[str] = []
        child_equity_curves: dict[str, list[EquityPoint]] = {}
        all_trades: list[dict] = []

        for ticker in tickers:
            allocated_capital = float(body.initial_capital) * alloc_map.get(ticker, 0) / 100.0
            if allocated_capital < 1:
                continue
            try:
                single_req = BacktestRunRequest(
                    rules=rules,
                    strategy_name=f"{strategy_name} — {ticker}",
                    ticker=ticker,
                    start_date=body.start_date,
                    end_date=body.end_date,
                    interval=body.interval,
                    initial_capital=Decimal(str(round(allocated_capital, 2))),
                    commission_pct=body.commission_pct,
                )
                result = run_backtest(db, user_id, single_req)

                # Link child run to portfolio parent
                child_run = db.query(BacktestRun).filter(BacktestRun.id == str(result.id)).first()
                if child_run:
                    child_run.portfolio_run_id = portfolio_run.id
                    db.commit()

                ticker_results.append(PortfolioTickerResult(
                    ticker=ticker,
                    weight_pct=alloc_map.get(ticker, 0),
                    allocated_capital=allocated_capital,
                    metrics=result.metrics,
                    trades_count=result.metrics.total_trades if result.metrics else 0,
                    run_id=str(result.id),
                ))
                if result.equity_curve:
                    child_equity_curves[ticker] = result.equity_curve

                # Collect trades for aggregate metrics
                if result.metrics:
                    child_trades = db.query(BacktestTrade).filter(BacktestTrade.run_id == str(result.id)).all()
                    for t in child_trades:
                        all_trades.append({
                            "pnl": float(t.pnl) if t.pnl else 0,
                            "duration_days": t.duration_days,
                        })

            except Exception as e:
                logger.warning(f"Portfolio backtest: ticker {ticker} failed: {e}")
                failed_tickers.append(ticker)

        if not ticker_results:
            raise ValueError("Ningún ticker pudo ejecutarse correctamente")

        # 6. Combine equity curves
        portfolio_equity = _combine_equity_curves(child_equity_curves)

        # 7. Calculate portfolio metrics
        portfolio_metrics = _calculate_portfolio_metrics(
            all_trades, portfolio_equity, float(body.initial_capital)
        )

        # 8. Update portfolio run record
        portfolio_run.portfolio_metrics = portfolio_metrics.model_dump()
        portfolio_run.portfolio_equity_curve = [
            {"date": e.date.isoformat(), "equity": e.equity} for e in portfolio_equity
        ]
        portfolio_run.failed_tickers = failed_tickers
        portfolio_run.status = "completed"
        portfolio_run.completed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(portfolio_run)

        return _portfolio_run_to_response(portfolio_run, portfolio_metrics, portfolio_equity, ticker_results, failed_tickers)

    except Exception as e:
        portfolio_run.status = "failed"
        portfolio_run.error_message = str(e)
        portfolio_run.completed_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(status_code=400, detail=str(e))


def _combine_equity_curves(curves: dict[str, list[EquityPoint]]) -> list[EquityPoint]:
    """Combine per-ticker equity curves into a portfolio curve by summing equities per date."""
    if not curves:
        return []

    # Collect all unique dates and per-ticker values
    all_dates: set[date] = set()
    ticker_series: dict[str, dict[date, float]] = {}
    for ticker, curve in curves.items():
        series = {}
        for pt in curve:
            series[pt.date] = pt.equity
            all_dates.add(pt.date)
        ticker_series[ticker] = series

    sorted_dates = sorted(all_dates)
    combined: list[EquityPoint] = []

    # Forward-fill: track last known equity per ticker
    last_known: dict[str, float] = {}
    for d in sorted_dates:
        total = 0.0
        for ticker, series in ticker_series.items():
            if d in series:
                last_known[ticker] = series[d]
            equity = last_known.get(ticker, 0.0)
            total += equity
        combined.append(EquityPoint(date=d, equity=round(total, 2)))

    return combined


def _calculate_portfolio_metrics(
    all_trades: list[dict],
    equity_curve: list[EquityPoint],
    initial_capital: float,
) -> BacktestMetrics:
    """Calculate portfolio-level metrics from the combined equity curve and all trades."""
    if not equity_curve:
        return BacktestMetrics(
            total_return=0, total_return_pct=0, max_drawdown=0, max_drawdown_pct=0,
            win_rate=0, total_trades=0,
        )

    final_equity = equity_curve[-1].equity
    total_return = final_equity - initial_capital
    total_return_pct = total_return / initial_capital * 100 if initial_capital > 0 else 0

    # Annualized return
    days = (equity_curve[-1].date - equity_curve[0].date).days
    annualized = ((final_equity / initial_capital) ** (365 / days) - 1) * 100 if days > 0 and initial_capital > 0 else None

    # Sharpe ratio from combined equity curve
    equities = [e.equity for e in equity_curve]
    daily_returns = [
        (equities[i] - equities[i - 1]) / equities[i - 1]
        for i in range(1, len(equities))
        if equities[i - 1] != 0
    ]
    sharpe = None
    if daily_returns and len(daily_returns) > 1:
        import statistics
        mean_r = statistics.mean(daily_returns)
        std_r = statistics.stdev(daily_returns)
        sharpe = round((mean_r / std_r) * (252 ** 0.5), 2) if std_r > 0 else None

    # Max drawdown
    peak = 0.0
    max_dd = 0.0
    for e in equities:
        if e > peak:
            peak = e
        dd = peak - e
        if dd > max_dd:
            max_dd = dd
    max_dd_pct = max_dd / peak * 100 if peak > 0 else 0

    # Trade stats (from all tickers combined)
    pnls = [t["pnl"] for t in all_trades]
    winners = [p for p in pnls if p > 0]
    losers = [p for p in pnls if p <= 0]
    win_rate = len(winners) / len(pnls) * 100 if pnls else 0

    gross_profit = sum(winners) if winners else 0
    gross_loss = abs(sum(losers)) if losers else 0
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else None

    durations = [t["duration_days"] for t in all_trades if t.get("duration_days") is not None]

    return BacktestMetrics(
        total_return=round(total_return, 2),
        total_return_pct=round(total_return_pct, 2),
        annualized_return_pct=round(annualized, 2) if annualized is not None else None,
        sharpe_ratio=sharpe,
        max_drawdown=round(max_dd, 2),
        max_drawdown_pct=round(max_dd_pct, 2),
        win_rate=round(win_rate, 2),
        profit_factor=round(profit_factor, 2) if profit_factor is not None else None,
        total_trades=len(all_trades),
        avg_trade_duration_days=round(sum(durations) / len(durations), 1) if durations else None,
        best_trade_pnl=round(max(pnls), 2) if pnls else None,
        worst_trade_pnl=round(min(pnls), 2) if pnls else None,
    )


def _portfolio_run_to_response(
    run: BacktestPortfolioRun,
    metrics: BacktestMetrics | None,
    equity_curve: list[EquityPoint],
    ticker_results: list[PortfolioTickerResult],
    failed_tickers: list[str],
) -> PortfolioBacktestResponse:
    return PortfolioBacktestResponse(
        id=run.id,
        strategy_name=run.strategy_name or "Portfolio",
        tickers=run.tickers_json,
        universe=run.universe,
        start_date=run.start_date,
        end_date=run.end_date,
        initial_capital=run.initial_capital,
        commission_pct=run.commission_pct,
        portfolio_metrics=metrics,
        equity_curve=equity_curve,
        ticker_results=ticker_results,
        failed_tickers=failed_tickers,
        status=run.status,
        created_at=run.created_at,
        completed_at=run.completed_at,
    )


def get_portfolio_runs(db: Session, user_id: str) -> list[PortfolioRunSummary]:
    runs = (
        db.query(BacktestPortfolioRun)
        .filter(BacktestPortfolioRun.user_id == user_id)
        .order_by(BacktestPortfolioRun.created_at.desc())
        .all()
    )
    results = []
    for r in runs:
        metrics = r.portfolio_metrics or {}
        results.append(PortfolioRunSummary(
            id=r.id,
            strategy_name=r.strategy_name,
            ticker_count=len(r.tickers_json) if r.tickers_json else 0,
            universe=r.universe,
            start_date=r.start_date,
            end_date=r.end_date,
            total_return_pct=metrics.get("total_return_pct"),
            status=r.status,
            created_at=r.created_at,
        ))
    return results


def get_portfolio_run(db: Session, user_id: str, run_id: str) -> PortfolioBacktestResponse:
    run = db.query(BacktestPortfolioRun).filter(
        BacktestPortfolioRun.id == run_id,
        BacktestPortfolioRun.user_id == user_id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Portfolio backtest no encontrado")

    metrics = BacktestMetrics(**run.portfolio_metrics) if run.portfolio_metrics else None
    equity = [
        EquityPoint(date=date.fromisoformat(e["date"]), equity=e["equity"])
        for e in (run.portfolio_equity_curve or [])
    ]

    # Build ticker results from child runs
    child_runs = db.query(BacktestRun).filter(BacktestRun.portfolio_run_id == run.id).all()
    alloc_map = run.allocations_json or {}
    ticker_results = []
    for cr in child_runs:
        cr_metrics = BacktestMetrics(**cr.metrics) if cr.metrics else None
        ticker_results.append(PortfolioTickerResult(
            ticker=cr.ticker,
            weight_pct=alloc_map.get(cr.ticker, 0),
            allocated_capital=float(cr.initial_capital),
            metrics=cr_metrics,
            trades_count=cr_metrics.total_trades if cr_metrics else 0,
            run_id=cr.id,
        ))

    return _portfolio_run_to_response(
        run, metrics, equity, ticker_results, run.failed_tickers or []
    )


def delete_portfolio_run(db: Session, user_id: str, run_id: str) -> None:
    run = db.query(BacktestPortfolioRun).filter(
        BacktestPortfolioRun.id == run_id,
        BacktestPortfolioRun.user_id == user_id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Portfolio backtest no encontrado")

    # Delete child runs and their trades
    child_runs = db.query(BacktestRun).filter(BacktestRun.portfolio_run_id == run.id).all()
    for cr in child_runs:
        db.query(BacktestTrade).filter(BacktestTrade.run_id == cr.id).delete()
        db.delete(cr)

    db.delete(run)
    db.commit()


# ──────────────────────────────────────
# Helpers
# ──────────────────────────────────────

def _params_key(params: dict) -> str:
    return "_".join(f"{k}{v}" for k, v in sorted(params.items()))


def _get_template_name(strategy_id: str) -> str:
    for i, t in enumerate(TEMPLATES):
        if str(UUID(int=i)) == strategy_id:
            return t["name"]
    return "Desconocida"


def _strategy_to_response(s: Strategy) -> StrategyResponse:
    return StrategyResponse(
        id=s.id,
        user_id=s.user_id,
        name=s.name,
        description=s.description,
        is_template=s.is_template,
        rules=StrategyRules(**s.rules),
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


def _trade_to_response(t: BacktestTrade) -> BacktestTradeResponse:
    return BacktestTradeResponse(
        id=t.id,
        type=t.type,
        entry_date=t.entry_date,
        entry_price=t.entry_price,
        exit_date=t.exit_date,
        exit_price=t.exit_price,
        quantity=t.quantity,
        pnl=t.pnl,
        pnl_pct=t.pnl_pct,
        exit_reason=t.exit_reason,
        duration_days=t.duration_days,
    )


def _run_to_response(
    run: BacktestRun,
    trades: list,
    metrics: BacktestMetrics | None,
    equity_curve: list[EquityPoint],
) -> BacktestRunResponse:
    trade_responses = [_trade_to_response(t) if isinstance(t, BacktestTrade) else t for t in trades]
    return BacktestRunResponse(
        id=run.id,
        user_id=run.user_id,
        strategy_id=run.strategy_id,
        ticker=run.ticker,
        start_date=run.start_date,
        end_date=run.end_date,
        initial_capital=run.initial_capital,
        commission_pct=run.commission_pct,
        status=run.status,
        metrics=metrics,
        equity_curve=equity_curve,
        trades=trade_responses,
        error_message=run.error_message,
        created_at=run.created_at,
        completed_at=run.completed_at,
    )
