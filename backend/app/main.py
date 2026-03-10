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
