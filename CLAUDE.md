# Plataforma de Análisis Bursátil Educativa

## Descripción
Plataforma web educativa para estudiantes de Máster (~23 años) que permite practicar análisis técnico bursátil. Combina gráficos interactivos con datos reales, paper trading, backtesting de estrategias y un tutor IA basado en PDFs del profesor.

## Especificación
Toda la especificación funcional está en `SPEC.md`. Consultarla siempre antes de implementar cualquier módulo.

## Stack

### Backend (`backend/`)
- **Python 3.12+**, FastAPI 0.115+
- **ORM**: SQLAlchemy 2.0+ con SQLite (dev) / PostgreSQL (prod)
- **Validación**: Pydantic 2.0+ (schemas en `backend/app/schemas/`)
- **Auth**: JWT con python-jose, passwords con bcrypt (directo, sin passlib)
- **Datos bursátiles**: yfinance
- **Indicadores técnicos**: pandas + numpy (cálculos nativos, sin pandas-ta)
- **RAG (Tutor IA)**: LangChain + FAISS + sentence-transformers + pdfplumber
- **Tests**: pytest + httpx

### Frontend (`frontend/`)
- **React 18+** con TypeScript strict, Vite 5+
- **Estilos**: TailwindCSS 3+
- **Gráficos**: Lightweight Charts (TradingView) 5+ (Primitives API para dibujos)
- **Data fetching**: TanStack Query 5+
- **Routing**: React Router 6+
- **Formularios**: React Hook Form
- **Estado global**: Zustand

## Estructura de Schemas (ya implementados)
```
backend/app/schemas/
├── __init__.py      ← re-exports todo
├── common.py        ← enums compartidos (UserRole, OrderType, Comparator, etc.)
├── auth.py          ← Register, Login, Token, User, Invite
├── course.py        ← Course CRUD
├── market.py        ← Search, Quote, OHLCV, HistoryQuery
├── indicators.py    ← Catalog, Calculate, Presets (max 5 indicadores)
├── demo.py          ← Portfolio, Orders, Performance (paper trading)
├── tutor.py         ← Chat, Conversations, Documents, FAQ
└── backtest.py      ← Strategy rules, BacktestRun, Trades, Compare
```

## Convenciones

### Código
- **Commits convencionales**: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`
- **Backend**: type hints en todo, docstrings solo donde la lógica no es obvia
- **Frontend**: TypeScript strict, sin `any`
- **Sin datos falsos**: siempre datos reales de Yahoo Finance
- **Variables sensibles**: todo en `.env`, nunca en código

### Arquitectura
- Backend primero: cada módulo se implementa backend → tests → frontend
- Cada endpoint tiene mínimo un test
- Los schemas Pydantic son la fuente de verdad para validaciones
- Los modelos SQLAlchemy llevan `model_config = {"from_attributes": True}` en sus schemas

### Patrones clave
- Schemas Pydantic usan `model_validator(mode="after")` para validaciones cruzadas
- Enums en `schemas/common.py`, nunca strings sueltos
- Imports centralizados via `schemas/__init__.py`
- Responses siempre llevan `model_config = {"from_attributes": True}`

## Base de Datos
- **Supabase** (PostgreSQL gestionado) — solo como BD, no usamos Supabase Auth ni Storage
- Connection string en `.env` como `DATABASE_URL`
- SQLAlchemy apunta a Supabase PostgreSQL
- Para desarrollo local se puede usar SQLite cambiando `DATABASE_URL`

## Fases de implementación
1. ✅ Schemas Pydantic
2. ✅ Estructura + Auth (FastAPI, config, database, JWT, modelos SQLAlchemy)
3. ✅ Gráficos (yfinance: search, quote, history OHLCV)
4. ✅ Indicadores (catálogo 9 indicadores, cálculo, presets)
5. ✅ Modo Demo (paper trading: portfolio, órdenes, rendimiento, reset)
6. ✅ Backtesting (motor completo, 6 templates, constructor, simulación, métricas, comparación)
7. ✅ Tutor IA (RAG: PDF upload, chunking, FAISS/keyword search, chat con LLM, FAQ)
8. ✅ Frontend completo (React 18 + TS strict + Vite + TailwindCSS v4 + lightweight-charts v5)
   - Herramientas de dibujo (trendline, arrow, text, Fibonacci, Elliott) con Primitives API
   - Preview en vivo mientras se dibuja
   - Detección de patrones de velas: envolvente (EA/EB), marubozu (MA/MB), long line (LLA/LLB)
   - Indicadores overlay + oscilador con editor de parámetros
   - Soporte intradiario (1m, 5m, 15m, 1h) con timestamps Unix + validación período/intervalo
9. Pulido (UI/UX, ranking, deploy)

## API — 34 rutas implementadas
```
Auth:       POST register, login | GET me | POST invite
Market:     GET search, quote/{ticker}, history/{ticker}
Indicators: GET catalog | POST calculate | GET/POST presets
Demo:       GET portfolio, orders, performance | POST order, reset
Backtest:   GET templates, strategies, strategies/{id} | POST strategies
            PUT/DELETE strategies/{id}
            POST run | GET runs, runs/{id}, runs/{id}/trades | DELETE runs/{id}
            POST compare
Tutor:      POST chat | GET conversations | POST/GET documents | GET faq
Health:     GET /api/health
```

## Comandos útiles
```bash
# Backend
cd backend && pip install -e ".[dev]"
uvicorn app.main:app --reload
pytest tests/

# Frontend
cd frontend && npm install
npm run dev
npm run build
```
