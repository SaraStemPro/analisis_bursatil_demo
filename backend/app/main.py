import uuid

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from .config import settings
from .database import Base, SessionLocal, engine
from .routers import auth, market, indicators, demo, backtest, tutor
from .services.market_service import start_cache_warmer
from .services.demo_service import start_stop_loss_monitor
from .utils.auth import hash_password

Base.metadata.create_all(bind=engine)

# Lightweight migration: add missing columns to existing tables
with engine.connect() as conn:
    inspector = inspect(engine)
    if "orders" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("orders")]
        if "side" not in columns:
            conn.execute(text("ALTER TABLE orders ADD COLUMN side VARCHAR(10)"))
            conn.commit()
        if "portfolio_group" not in columns:
            conn.execute(text("ALTER TABLE orders ADD COLUMN portfolio_group VARCHAR(100)"))
            conn.commit()
        if "notes" not in columns:
            conn.execute(text("ALTER TABLE orders ADD COLUMN notes VARCHAR(500)"))
            conn.commit()
        if "cost" not in columns:
            conn.execute(text("ALTER TABLE orders ADD COLUMN cost NUMERIC(14,5)"))
            conn.commit()
        if "fx_rate" not in columns:
            conn.execute(text("ALTER TABLE orders ADD COLUMN fx_rate NUMERIC(10,6)"))
            conn.commit()
    if "backtest_runs" in inspector.get_table_names():
        columns = {c["name"]: c for c in inspector.get_columns("backtest_runs")}
        db_url = str(engine.url)
        if "strategy_name" not in columns:
            conn.execute(text("ALTER TABLE backtest_runs ADD COLUMN strategy_name VARCHAR(200)"))
            conn.commit()
        # Make strategy_id nullable
        if columns.get("strategy_id", {}).get("nullable") is False:
            if "postgresql" in db_url:
                conn.execute(text("ALTER TABLE backtest_runs ALTER COLUMN strategy_id DROP NOT NULL"))
                conn.commit()
            elif "sqlite" in db_url:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS backtest_runs_new (
                        id VARCHAR(36) PRIMARY KEY,
                        user_id VARCHAR(36) NOT NULL REFERENCES users(id),
                        strategy_id VARCHAR(36),
                        strategy_name VARCHAR(200),
                        ticker VARCHAR(20) NOT NULL,
                        start_date DATE NOT NULL,
                        end_date DATE NOT NULL,
                        initial_capital NUMERIC(14,2) NOT NULL,
                        commission_pct NUMERIC(5,2) NOT NULL,
                        metrics JSON,
                        equity_curve JSON,
                        status VARCHAR(20) NOT NULL DEFAULT 'running',
                        error_message TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        completed_at TIMESTAMP
                    )
                """))
                conn.execute(text("""
                    INSERT INTO backtest_runs_new
                    SELECT id, user_id, strategy_id, strategy_name, ticker, start_date, end_date,
                           initial_capital, commission_pct, metrics, equity_curve, status,
                           error_message, created_at, completed_at
                    FROM backtest_runs
                """))
                conn.execute(text("DROP TABLE backtest_runs"))
                conn.execute(text("ALTER TABLE backtest_runs_new RENAME TO backtest_runs"))
                conn.commit()
        if "portfolio_run_id" not in columns:
            conn.execute(text("ALTER TABLE backtest_runs ADD COLUMN portfolio_run_id VARCHAR(36)"))
            conn.commit()


# Seed: create default course, professor, and demo student
def _seed():
    from .models.course import Course
    from .models.user import User

    db: Session = SessionLocal()
    try:
        existing = db.query(Course).filter(Course.invite_code == "AB_2026").first()
        if existing:
            return

        # Create professor
        prof = User(
            id=str(uuid.uuid4()),
            email="profesor@demo.com",
            password_hash=hash_password("Demo1234"),
            name="Profesor",
            role="professor",
        )
        db.add(prof)
        db.flush()

        # Create course
        course = Course(
            id=str(uuid.uuid4()),
            name="Análisis Bursátil 2026",
            professor_id=prof.id,
            invite_code="AB_2026",
        )
        db.add(course)
        db.flush()

        # Create demo student
        student = User(
            id=str(uuid.uuid4()),
            email="sara@demo.com",
            password_hash=hash_password("Demo1234"),
            name="Sara",
            role="student",
            course_id=course.id,
        )
        db.add(student)

        db.commit()
    finally:
        db.close()


_seed()


# Migration: mark old buy/sell orders as closed if they have been fully closed
# In the old system, original orders stayed status="open" forever.
# The new system uses status="open"/"closed" on the original order itself.
def _migrate_close_order_status():
    from .models.order import Order

    db: Session = SessionLocal()
    try:
        # For each portfolio, process close orders and consume from oldest open orders (FIFO)
        close_orders = (
            db.query(Order)
            .filter(Order.type == "close")
            .order_by(Order.created_at)
            .all()
        )
        if not close_orders:
            db.close()
            return

        # Group closes by (portfolio_id, ticker, side)
        from collections import defaultdict
        closes_by_key: dict[tuple, int] = defaultdict(int)
        for co in close_orders:
            key = (co.portfolio_id, co.ticker, co.side)
            closes_by_key[key] += co.quantity

        for (pid, ticker, side), closed_qty in closes_by_key.items():
            order_type = "buy" if side == "long" else "sell"
            open_orders = (
                db.query(Order)
                .filter(
                    Order.portfolio_id == pid,
                    Order.ticker == ticker,
                    Order.type == order_type,
                    Order.status == "open",
                )
                .order_by(Order.created_at)
                .all()
            )
            remaining = closed_qty
            for o in open_orders:
                if remaining <= 0:
                    break
                if remaining >= o.quantity:
                    remaining -= o.quantity
                    o.status = "closed"
                    o.closed_at = o.closed_at or o.created_at
                else:
                    # Partial close: reduce quantity
                    o.quantity -= remaining
                    remaining = 0

        db.commit()
    finally:
        db.close()


_migrate_close_order_status()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://plataforma-trading.sarastem.com",
        "http://plataforma-trading.sarastem.com",
        "http://212.227.134.30",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(market.router)
app.include_router(indicators.router)
app.include_router(demo.router)
app.include_router(backtest.router)
app.include_router(tutor.router)


@app.on_event("startup")
def _on_startup():
    start_cache_warmer()
    start_stop_loss_monitor()


@app.get("/api/health")
def health():
    return {"status": "ok"}
