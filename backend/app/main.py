from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from .config import settings
from .database import Base, engine
from .routers import auth, market, indicators, demo, backtest, tutor

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
    if "backtest_runs" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("backtest_runs")]
        if "strategy_name" not in columns:
            conn.execute(text("ALTER TABLE backtest_runs ADD COLUMN strategy_name VARCHAR(200)"))
            conn.commit()
        # Make strategy_id nullable (PostgreSQL only; SQLite ignores ALTER COLUMN)
        db_url = str(engine.url)
        if "postgresql" in db_url:
            col_info = {c["name"]: c for c in inspector.get_columns("backtest_runs")}
            if col_info.get("strategy_id", {}).get("nullable") is False:
                conn.execute(text("ALTER TABLE backtest_runs ALTER COLUMN strategy_id DROP NOT NULL"))
                conn.commit()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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


@app.get("/api/health")
def health():
    return {"status": "ok"}
