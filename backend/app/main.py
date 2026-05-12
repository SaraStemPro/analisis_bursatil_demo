import uuid

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from .config import settings
from .database import Base, SessionLocal, engine
from .routers import auth, market, indicators, demo, backtest, tutor, lesson
from .services.market_service import start_cache_warmer, start_info_prewarmer
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


# --- ELIMINADA: _migrate_close_order_status ---
# Esta migración corría en cada arranque y sumaba TODAS las órdenes `type=close`
# por (portfolio_id, ticker, side) sin importar fecha ni portfolio_group, luego
# consumía esa cantidad de las órdenes `buy/sell` abiertas marcándolas como
# `closed`. El bug: si una alumna había cerrado en el pasado N unidades de un
# ticker y luego abría una posición nueva del mismo ticker (típicamente dentro
# de una cartera nueva), el siguiente reinicio del backend ejecutaba la
# migración y machacaba la posición nueva consumiéndola contra los cierres
# históricos. Era un timebomb que estallaba en cada deploy/restart.
#
# El sistema actual mantiene `status` correctamente en `_close_order_internal`
# (cierres reales) y vía `close_all_positions` / `close_cartera`, así que la
# migración ya no aporta nada. Se elimina por completo.


def _restore_migration_victims():
    """One-shot restoration: reabre las órdenes que la migración rota cerró
    incorrectamente.

    Heurística para identificar víctimas (todas las condiciones a la vez):
    - type IN ('buy', 'sell')
    - status = 'closed'
    - pnl IS NULL  → la migración no calculaba PnL; los cierres legítimos sí
    - closed_at = created_at  → la migración fallback ponía closed_at=created_at;
                                los cierres reales ponen closed_at=datetime.now()
                                que siempre es posterior al created_at

    Esto es idempotente: una vez reabierto, status='open' y la heurística ya no
    matcheará (closed_at='open' es None tras el reset). Seguro de dejar en cada
    arranque por si en el futuro se restaura un dump antiguo.
    """
    from .models.order import Order

    db: Session = SessionLocal()
    try:
        victims = (
            db.query(Order)
            .filter(
                Order.type.in_(["buy", "sell"]),
                Order.status == "closed",
                Order.pnl.is_(None),
                Order.closed_at == Order.created_at,
            )
            .all()
        )
        if not victims:
            db.close()
            return
        for o in victims:
            o.status = "open"
            o.closed_at = None
            o.pnl = None
        db.commit()
        print(f"[restore] Reabiertas {len(victims)} órdenes víctimas de la migración rota.")
    finally:
        db.close()


_restore_migration_victims()


# Seed plantillas DB compartidas (Sistema Sara y futuras editables por profesor)
def _seed_db_templates():
    from .services.backtest_service import seed_db_templates
    db: Session = SessionLocal()
    try:
        seed_db_templates(db)
    finally:
        db.close()


_seed_db_templates()


# Migración idempotente: arregla Sistema Sara si tiene el bug donde una
# condición compara directamente un patrón de vela con un indicador (siempre
# falso para LONG porque 0/1 nunca es > precio, siempre verdadero para SHORT
# porque 0/1 siempre es < precio → toneladas de shorts espurios).
# Solo se aplica si detecta el patrón roto. Tras corregir, no toca nada más
# por lo que las ediciones futuras del profesor se respetan.
def _migrate_fix_sistema_sara():
    from .models.strategy import Strategy
    from .services.backtest_service import SEEDED_DB_TEMPLATES

    db: Session = SessionLocal()
    try:
        sara = (
            db.query(Strategy)
            .filter(Strategy.name == "Sistema Sara · 20/20 + Bollinger", Strategy.is_template == True)  # noqa: E712
            .first()
        )
        if not sara:
            return

        def _has_broken_pattern(group: dict | None) -> bool:
            if not group:
                return False
            for c in group.get("conditions", []):
                left = c.get("left") or {}
                right = c.get("right") or {}
                # patrón de vela comparado con un indicador → bug
                if left.get("type") == "candle_pattern" and right.get("type") == "indicator":
                    return True
                if right.get("type") == "candle_pattern" and left.get("type") == "indicator":
                    return True
            return False

        rules = sara.rules or {}
        if _has_broken_pattern(rules.get("entry")) or _has_broken_pattern(rules.get("entry_short")):
            for tpl in SEEDED_DB_TEMPLATES:
                if tpl["name"] == sara.name:
                    sara.rules = tpl["rules"]
                    db.commit()
                    break
    finally:
        db.close()


_migrate_fix_sistema_sara()


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
app.include_router(lesson.router)


@app.on_event("startup")
def _on_startup():
    start_cache_warmer()
    start_stop_loss_monitor()
    start_info_prewarmer()


@app.get("/api/health")
def health():
    return {"status": "ok"}
