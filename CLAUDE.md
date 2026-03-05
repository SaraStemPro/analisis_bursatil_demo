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
├── common.py        ← enums compartidos (UserRole, OrderType[buy/sell/close], Comparator, etc.)
├── auth.py          ← Register, Login, Token, User, Invite
├── course.py        ← Course CRUD
├── market.py        ← Search, Quote, OHLCV, HistoryQuery, DetailedQuote, ScreenerFilters, ScreenerResponse
├── indicators.py    ← Catalog, Calculate, Presets (max 5 indicadores)
├── demo.py          ← Portfolio, Orders, Performance, ClosePosition, PortfolioSummary (paper trading)
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
4. ✅ Indicadores (catálogo 10 indicadores, cálculo, presets)
5. ✅ Modo Demo (paper trading: portfolio, órdenes, rendimiento, reset, short selling, close-all)
6. ✅ Backtesting (motor completo, 6 templates, constructor, simulación, métricas, comparación)
7. ✅ Tutor IA (RAG: PDF upload, chunking, FAISS/keyword search, chat con LLM, FAQ)
8. ✅ Frontend completo (React 18 + TS strict + Vite + TailwindCSS v4 + lightweight-charts v5)
   - Herramientas de dibujo (trendline, arrow, text, Fibonacci, Elliott, hline, vline) con Primitives API
   - Edición de dibujos: seleccionar + mover + cambiar color (color picker en toolbar)
   - Preview en vivo mientras se dibuja (PreviewPrimitive + subscribeCrosshairMove)
   - Detección de patrones de velas: envolvente, marubozu, long line, martillo (EA/EB, MA/MB, LLA/LLB, MaA/MaB)
   - Selector de patrones por checkbox (activar/desactivar individualmente)
   - Indicadores overlay + oscilador con editor de parámetros y colores personalizables
   - Osciladores en ventanas separadas (OscillatorChart) con scroll sincronizado al main chart
   - Fractales de Williams renderizados como marcadores sobre las velas
   - Historial de 5 tickers recientes con botón X para eliminar
   - Botón "Hoy" (scroll to realtime), escala logarítmica (toggle LOG)
   - Enlace a Yahoo Finance por ticker, info de exchange y market state
   - Soporte intradiario (1m, 5m, 15m, 1h) con timestamps Unix + validación período/intervalo
   - Preservación de escala al añadir/quitar indicadores
   - Dibujo en gráficos de osciladores (cada chart tiene DrawingManager propio, activeChartId en store)
   - VWAP oculto del catálogo (aún disponible en backend)
   - Botón "Comprar" en Charts → navega a Paper Trading con ticker pre-rellenado
   - Paper Trading mejorado:
     - Buy = abrir LONG, Sell = abrir SHORT (posiciones simultáneas long/short permitidas)
     - Cerrar posición (total o parcial) con modal de confirmación
     - Botón "Cerrar todo" para liquidar todas las posiciones
     - Posiciones en formato tabla/lista (no tarjetas)
     - Resumen portfolio con diversificación (Shannon entropy) y distribución sectorial
     - Buscador de tickers con autocompletado en formulario de orden
   - Stock Screener (página independiente `/screener`):
     - 9 universos: S&P 500 (~128), IBEX 35 (34), Tech (41), Healthcare (28), Finance (26), Energy (19), Industrials, Consumer, All
     - 7 filtros: Sector, Market Cap, P/E, Dividendo%, Precio, Cambio%, Beta
     - Tabla sorteable con 12 columnas + búsqueda por texto
     - Simulador de portfolio: seleccionar acciones, ver distribución sectorial, diversity score, comprar todo
     - Navegación: ticker → Charts, carrito → Paper Trading con ticker pre-rellenado
9. Pulido (UI/UX, ranking, deploy)

## Indicadores — 10 en catálogo backend
```
SMA, EMA          — tendencia, overlay
MACD              — tendencia, oscilador
RSI               — momentum, oscilador
STOCH             — momentum, oscilador
BBANDS            — volatilidad, overlay
ATR               — volatilidad, oscilador
OBV               — volumen, oscilador
VWAP              — volumen, overlay (oculto en frontend)
FRACTALS          — tendencia, overlay (renderizado como marcadores)
```

## Arquitectura de Charts (frontend)

### Archivos clave
```
pages/Charts.tsx                          ← Página principal, chart de velas + lógica global
components/charts/OscillatorChart.tsx      ← Un chart independiente por oscilador
components/charts/DrawingToolbar.tsx       ← Toolbar lateral de herramientas de dibujo
context/drawing-store.ts                  ← Zustand store: dibujos, herramientas, selección
lib/drawings/DrawingManager.ts            ← Gestiona primitivas de dibujo en un chart
lib/drawings/primitives/*.ts              ← 7 primitivas + PreviewPrimitive + renderers
lib/patterns.ts                           ← Detección de patrones de velas (client-side)
lib/recentTickers.ts                      ← localStorage para tickers recientes
lib/chartUtils.ts                         ← CHART_THEME, toChartTime(), INDICATOR_COLORS
```

### Patrones de sincronización (osciladores)
- Cada OscillatorChart tiene una **serie spacer invisible** con todos los timestamps del main chart
- Esto alinea los LogicalRange (índices de barra) entre charts con distinto número de datos
- Sync usa `setVisibleLogicalRange` bidireccional con un **shared `isSyncingRef`** para evitar loops
- Los charts de osciladores se registran en un `Map<string, IChartApi>` del padre vía callbacks
- No se usa React state para el sync (evita re-render loops); todo por refs + API directa

### Patrones de dibujo
- Primitivas implementan `ISeriesPrimitive<Time>` (lightweight-charts Primitives API)
- DrawingManager.syncDrawings: compara por referencia → si cambió, destruye y recrea primitiva (actualización inmediata de color/posición)
- PreviewPrimitive: dibuja preview en vivo durante crosshair move
- `activeChartId` en store determina qué chart recibe clics de dibujo ('main' | 'osc-RSI' | etc.)

## API — 39 rutas implementadas
```
Auth:       POST register, login | GET me | POST invite
Market:     GET search, quote/{ticker}, history/{ticker}, detailed-quote/{ticker}
            POST screener | GET screener/sectors/{universe}
Indicators: GET catalog | POST calculate | GET/POST presets
Demo:       GET portfolio, orders, performance, portfolio/summary
            POST order, close-position, close-all, reset
Backtest:   GET templates, strategies, strategies/{id} | POST strategies
            PUT/DELETE strategies/{id}
            POST run | GET runs, runs/{id}, runs/{id}/trades | DELETE runs/{id}
            POST compare
Tutor:      POST chat | GET conversations | POST/GET documents | GET faq
Health:     GET /api/health
```

## Arquitectura de Paper Trading (Demo)

### Semántica de órdenes
- `buy` → abre posición LONG (deduce coste del balance)
- `sell` → abre posición SHORT (deduce margen 100% del balance)
- `close` → cierra posición (total o parcial), campo `side` indica si cierra long o short
- Un mismo ticker puede tener posición LONG y SHORT simultáneamente

### Archivos clave
```
pages/Demo.tsx                             ← Página principal, tabla de posiciones, botón cerrar-todo
components/demo/OrderForm.tsx              ← Formulario con buscador de tickers, botones Long/Short
components/demo/TickerSearchInput.tsx       ← Autocompletado con market.search() + debounce
components/demo/ClosePositionDialog.tsx     ← Modal cierre parcial/total con slider
components/demo/PortfolioSummaryPanel.tsx   ← Sectores + diversity score (Shannon entropy)
components/demo/OrderHistory.tsx            ← Historial color-coded (buy verde, sell rojo, close amber)
```

### Modelo de datos (Order)
- Columna `side` (String(10), nullable): "long" | "short"
- Migration automática en `main.py` (ALTER TABLE si columna no existe)

## Arquitectura de Screener

### Backend
- Universos curados en `market_service.py`: SP500 (~128), IBEX35 (34), Tech, Healthcare, Finance, Energy, Industrials, Consumer
- Cache multinivel: `_info_cache` (30min TTL) para yf.Ticker().info, `_screener_cache` (5min TTL) por universo
- **IMPORTANTE**: resultados vacíos NO se cachean (evita envenenamiento de cache por fallos de yfinance)
- Filtrado server-side: `_apply_filters()` aplica sector, market_cap, P/E, dividend, price, change%, beta

### Frontend
```
pages/Screener.tsx  ← Página completa: filtros + tabla sorteable + simulador de portfolio
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
