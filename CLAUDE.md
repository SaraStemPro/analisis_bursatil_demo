# Plataforma de Análisis Bursátil Educativa

Plataforma web educativa para estudiantes de Máster (~23 años): gráficos interactivos con datos reales, paper trading con CFD, backtesting, screener con correlaciones, tutor IA (RAG sobre PDFs del profesor) y una lección interactiva con auto-save.

## Documentación

- **`CLAUDE.md`** (este fichero): fuente de verdad operativa. Léelo antes de tocar nada.
- **`SPEC.md`**: especificación funcional original. **Parcialmente desactualizada** (no recoge `/clase`, `lesson_responses`, `/admin/clase`, screener de correlación, ni el monitor de stop-loss; menciona `ta-lib` que no se usa). Útil como contexto histórico, no como referencia técnica.
- **`MEMORY.md`** (en memoria del proyecto): notas operativas mías entre sesiones.

## Stack

### Backend (`backend/`)
- **Python 3.12+**, FastAPI 0.115+
- **ORM**: SQLAlchemy 2.0+ con SQLite (dev) / PostgreSQL Supabase (prod)
- **Validación**: Pydantic 2.0+ (schemas en `backend/app/schemas/`)
- **Auth**: JWT con python-jose, passwords con bcrypt directo (sin passlib)
- **Datos bursátiles**: yfinance
- **Indicadores técnicos**: pandas + numpy nativo (sin pandas-ta ni TA-Lib)
- **RAG (Tutor IA)**: LangChain + FAISS + sentence-transformers + pdfplumber
- **Tests**: pytest + httpx (suite mínima en `backend/tests/`, ver sección Testing)

### Frontend (`frontend/`)
- **React 18+**, **Vite 7+**
- **TypeScript strict** — *excepción*: `pages/Clase.jsx` es JSX puro (lección autocontenida)
- **Estilos**: TailwindCSS **v4** (`@tailwindcss/vite`)
- **Gráficos**: Lightweight Charts (TradingView) v5 (Primitives API para dibujos) + Recharts (lección)
- **Data fetching**: TanStack Query 5+
- **Routing**: React Router 6+
- **Estado global**: Zustand
- **Formularios**: React Hook Form

## Cosas que NO debes asumir

Lecciones aprendidas a base de bugs. Antes de "limpiar" cualquiera de estas cosas, lee el motivo.

- **No promediar precios** en posiciones del mismo ticker. Cada orden es una posición independiente. Cerrar es por `order_id`, nunca por `(ticker, side)`.
- **El cache de yfinance no debe envenenarse con vacíos**: si el screener falla, NO cachear `[]`. Si lo cacheas, te quedas 5 min con resultados rotos.
- **Stale fallback en info/screener**: si Yahoo rate-limita y `.info` falla para todos los tickers, devolver cache expirada antes que pantalla vacía. Aplicado en `_get_cached_info` y `get_screener`. Mejor datos de hace 30 min que un "0 de 0" en clase.
- **1 solo worker de uvicorn**, no 4. 4 workers crean 4 caches independientes y multiplican x4 las llamadas a Yahoo (rate limit).
- **`get_screener` NO llama a `yf.Ticker(t).info` en vivo** (eso saturaba Yahoo y causaba el bug "11 productos de 258"). Solo lee de `_info_cache`. Cubrimos el flanco con tres mecanismos coordinados, **NO QUITES NI UNO**:
  1. **Seed estático en `backend/app/data/screener_info_seed.json`** (~258 tickers con sector / market cap / PE / nombre / etc, generado off-line desde una IP residencial). Lo carga `_load_info_seed()` al arrancar; puebla `_info_cache` con timestamp 0 (caducado, pero `get_screener` lo usa como fallback al leer aunque esté caducado). Garantiza que el screener salga completo aunque Yahoo bloquee al VPS al 100%.
  2. **`_info_prewarmer_loop`** (thread daemon) que refresca `.info` desde Yahoo a paso lento (1 ticker / 3 s) con backoff exponencial al ver `YFRateLimitError` (60→120→240 s). Pasa cada 30 min; los datos frescos sobrescriben los del seed. **No bajes este throttle** — con 0.5 s saturábamos Yahoo desde el VPS de IONOS y nos respondía 429/401 a todo en cascada.
  3. **`get_screener` muestra el ticker aun si `metrics` (batch download) falla**, usando el precio del seed/cache. Sin esto, cuando Yahoo rate-limita el batch tampoco salen los 258 — solo los pocos que cuelan.
  Para regenerar el seed (rara vez, solo si hay cambios grandes en universos): ejecuta el script local desde tu Mac (NO desde el VPS, donde está rate-limited): ver memoria `bugs_resolved.md` con el comando exacto.
- **Compra de cartera secuencial** (`for...of await`), no paralela: si paralela, se pisan al deducir del balance.
- **Spread asimétrico**: 0.01% solo al ask (`buy` y `close short`). NUNCA al bid.
- **Forex se multiplica ×10000 cuando precio < 10** (para que EURUSD a 1.16 se opere como 11600). Si lo "corriges" rompes el cálculo de margen.
- **Pesos del `CorrelationPanel`**: enviar `weights={totalCost(symbol, price, qty)}`, NO `weights={qty}`. Mandar cantidades en vez de € invertidos hace que `σ²_p = w' Σ w` se calcule con pesos equivocados (5 AAPL + 3 NVDA se trataría como 62%/37% en lugar de ~20%/80%), y rompe la idea pedagógica del simulador.
- **Clase.jsx es JSX, no TS** — no añadas `<Tipo>`, no esperes intellisense.
- **No hay CI ni pre-commit hooks**: los tests sólo corren si los lanzas tú.
- **`SPEC.md` está obsoleto** (ver sección Documentación arriba). No es fuente de verdad.
- **Auto-creación de tablas en producción**: el `Base.metadata.create_all()` de `main.py` crea tablas nuevas la primera vez que arranca el backend. Para alterar columnas existentes hay migraciones manuales en el mismo `main.py` (ALTER TABLE if not exists).

## Desarrollo local

```bash
# Backend
cd backend && pip install -e ".[dev]"
uvicorn app.main:app --reload   # arranca en :8000
pytest                          # corre tests (ver Testing)

# Frontend
cd frontend && npm install
npm run dev                     # :5173, proxy /api → :8000
npm run build                   # vite + tsc, debe quedar verde
```

**Si el `.env` local no autentica contra Supabase** (`password authentication failed for user "postgres"`), exporta `DATABASE_URL=sqlite:///./dev.db` y arranca: `Base.metadata.create_all` crea las tablas la primera vez. El seed (`profesor@demo.com`, `sara@demo.com`, ambos con `Demo1234`) se hace solo.

## Testing

Suite mínima en `backend/tests/`. Filosofía: cubrir lo no-obvio (lógica financiera, motor de backtest, contratos de API), no buscar 100% de cobertura.

```
backend/tests/
├── conftest.py              ← TestClient + DB en memoria + JWT helpers
├── test_routes.py           ← smoke / contract test de cada endpoint
├── test_demo_service.py     ← CFD, spread, SL/TP, cierre por order_id
└── test_backtest_service.py ← motor con dataset sintético determinista
```

`pytest.ini` fuerza `DATABASE_URL=sqlite:///:memory:` para que la suite no toque Supabase.

**Frontend**: no tiene tests unitarios. La verificación es `npm run build` + smoke manual. Si en el futuro hace falta E2E, Playwright sobre los flujos críticos (login → comprar → ver portfolio · /clase auto-save · /admin/clase visualización) tiene más ROI que unit tests sobre 4400 líneas de JSX.

## Convenciones

- **Commits convencionales**: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`
- **Backend**: type hints en todo, docstrings solo donde la lógica no es obvia
- **Frontend** (excepto `Clase.jsx`): TypeScript strict, sin `any`
- **Sin datos falsos**: siempre Yahoo Finance real
- **Variables sensibles**: `.env`, nunca en código

### Patrones clave

- Schemas Pydantic son fuente de verdad para validación; usan `model_validator(mode="after")` para validaciones cruzadas
- Enums en `schemas/common.py`, nunca strings sueltos
- Imports centralizados vía `schemas/__init__.py`
- Responses con `model_config = {"from_attributes": True}`

## Estructura de Schemas

```
backend/app/schemas/
├── __init__.py      ← re-exports
├── common.py        ← enums (UserRole, OrderType, Comparator, etc.)
├── auth.py          ← Register, Login, Token, User, Invite
├── course.py        ← Course CRUD
├── market.py        ← Search, Quote, OHLCV, History, DetailedQuote, Screener, Correlation
├── indicators.py    ← Catalog, Calculate, Presets (max 5 indicadores)
├── demo.py          ← Portfolio, Orders, Performance, ClosePosition, Carteras
├── tutor.py         ← Chat, Conversations, Documents, FAQ
├── backtest.py      ← Strategy rules, BacktestRun, Trades, Compare
└── lesson.py        ← LessonResponse upsert/read + StudentLessonResponse (admin)
```

## Base de Datos (Supabase)

- **Supabase** (PostgreSQL gestionado) + Storage para PDFs del tutor
- Connection string en `.env` como `DATABASE_URL` (Session Pooler, IPv4)
- Para desarrollo local se puede usar SQLite cambiando `DATABASE_URL`
- Precisión: `Numeric(14, 5)` para precios (forex necesita 5 decimales)
- **12 tablas**: users, courses, portfolios, orders, documents, conversations, messages, indicator_presets, strategies, backtest_runs, backtest_trades, lesson_responses
- **7 vistas SQL** creadas a mano en Supabase para que el profesor consulte con SELECTs: `v_orders`, `v_backtest_runs`, `v_conversations`, `v_messages`, `v_documents`, `v_strategies`, `v_portfolios` — todas con `username`/`user_email`. (`lesson_responses` no tiene vista, se consulta vía `/api/lesson/{id}/responses/all`.)

## Páginas frontend (11)

| Ruta | Quién | Qué |
|------|-------|-----|
| `/` | todos | Dashboard con tarjetas + ranking |
| `/charts` | todos | Gráficos + indicadores + dibujos |
| `/screener` | todos | Filtros + simulador + correlación |
| `/demo` | todos | Paper Trading (posiciones + carteras) |
| `/backtest` | todos | Motor de backtesting |
| `/tutor` | todos | Chat con tutor IA (RAG) |
| `/clase` | todos | Lección interactiva con auto-save |
| `/profile` | todos | Perfil de usuario |
| `/login` | sin auth | Login + registro con invite code |
| `/admin` | profesor | Posiciones de todos los alumnos en vivo |
| `/admin/clase` | profesor | Respuestas de la lección por alumno |

## API

48+ rutas. Para conteo exacto: `grep -c '@router\.' backend/app/routers/*.py`.

```
Auth:       POST register, login | GET me | POST invite
Market:     GET search, quote/{ticker}, history/{ticker}, detailed-quote/{ticker}
            POST screener, correlation | GET screener/sectors/{universe}
Indicators: GET catalog | POST calculate | GET/POST presets
Demo:       GET portfolio, orders, performance, portfolio/summary, carteras, ranking
            GET admin/positions (solo profesor)
            POST order, close-position, close-all, close-cartera/{name}, reset
            PATCH stop-loss
Backtest:   GET templates, strategies, strategies/{id}, universes
            POST strategies, run, run-portfolio, signals, compare
            PUT/DELETE strategies/{id}
            GET runs, runs/{id}, runs/{id}/trades, portfolio-runs, portfolio-runs/{id}
            DELETE runs/{id}, runs (all), portfolio-runs/{id}
Tutor:      POST chat | GET conversations, conversations/{id}/messages, faq
            DELETE conversations/{id}
            POST/GET documents | GET documents/{id}/download | DELETE documents/{id}
Lesson:     GET lesson/{id}/responses (alumno)
            PUT lesson/{id}/responses (alumno upsert con debounce)
            GET lesson/{id}/responses/all (solo profesor)
Health:     GET /api/health
```

## Usuarios demo (auto-seed al arrancar)

```
Profesor:   profesor@demo.com / Demo1234
Alumna:     sara@demo.com    / Demo1234
Código de invitación: AB_2026
```

---

## Arquitectura por dominio

### Charts (`pages/Charts.tsx`)

**Archivos**:
```
pages/Charts.tsx                          ← chart de velas + lógica global
components/charts/OscillatorChart.tsx      ← un chart independiente por oscilador
components/charts/DrawingToolbar.tsx       ← toolbar lateral de dibujos
context/drawing-store.ts                  ← Zustand: dibujos, herramientas, selección
lib/drawings/DrawingManager.ts            ← gestiona primitivas en un chart
lib/drawings/primitives/*.ts              ← 9 primitivas + PreviewPrimitive + renderers
lib/patterns.ts                           ← detección de patrones de velas (client-side)
lib/recentTickers.ts                      ← localStorage de tickers recientes
lib/chartUtils.ts                         ← CHART_THEME, toChartTime() Madrid TZ, INDICATOR_COLORS
```

**Indicadores (10 en backend)**: SMA, EMA, MACD, RSI, STOCH, BBANDS, ATR, OBV, VWAP, FRACTALS. VWAP oculto en frontend.

**Patrones de velas (6)**: bullish/bearish engulfing, bullish/bearish hammer, bullish/bearish 2020.

**Herramientas de dibujo (9)**: trendline, arrow, text, Fibonacci (con extensiones 0–423.6%), Elliott, hline, vline, rect, circle. Tienen edición (mover, copiar/pegar Ctrl+C/V, color picker), preview en vivo, dibujo en margen derecho (30 barras vacías para proyecciones futuras), dibujo en gráficos de osciladores.

**Sincronización de osciladores** (no obvio):
- Cada `OscillatorChart` tiene una **serie spacer invisible** con todos los timestamps del main chart, para alinear `LogicalRange` entre charts con distinto número de datos.
- Sync usa `setVisibleLogicalRange` bidireccional con un **`isSyncingRef` compartido** para evitar loops.
- Charts de osciladores se registran en un `Map<string, IChartApi>` del padre vía callbacks.
- No se usa React state para el sync (evita re-render loops); todo por refs + API directa.

**Patrón de dibujo**:
- Primitivas implementan `ISeriesPrimitive<Time>` (Primitives API).
- `DrawingManager.syncDrawings`: compara por referencia → si cambió, destruye y recrea (actualización inmediata de color/posición).
- `PreviewPrimitive`: dibuja preview durante `subscribeCrosshairMove`.
- `activeChartId` en store: qué chart recibe clics (`'main' | 'osc-RSI' | ...`).
- `pointToPixel()` y `timeToX()` en `renderers.ts`: conversión tiempo→píxel con fallback para margen derecho (fechas futuras).
- `chartMeta` (objeto compartido en `renderers.ts`): `dataLength`, `barIntervalSec`, `lastChartTime`, `isIntraday`. Lo actualiza `Charts.tsx`, lo leen las primitivas.
- Tiempo de dibujos: `YYYY-MM-DD` para daily, Unix segundos (string) para intraday — `parseTimeSec()` y `toTimeValue()` detectan formato automáticamente.

**Formato inteligente de precios** (`lib/chartUtils.ts`):
- `fmtPrice(val)`: 5 decimales <10, 4 <100, 2 ≥100.
- `fmtChange(val, refPrice)`: misma lógica vs precio de referencia.
- `getPriceFormat(price)` → `{precision, minMove}` para configurar ejes.
- Aplica en: eje Y, cabecera, valores de indicadores, tablas de posiciones.

**Zona horaria intradiaria**: eje X 1m/5m/15m/1h en Europa/Madrid. `getMadridOffsetSec(date)` con `toLocaleString` (CET/CEST automático). Daily y superiores no se ven afectados.

### Paper Trading (`pages/Demo.tsx`)

**Semántica de órdenes**:
- `buy` → abre LONG (deduce coste del balance)
- `sell` → abre SHORT (deduce margen)
- `close` → cierra por `order_id` (total o parcial)
- Posiciones independientes: cada orden es su propia posición, sin promediar.
- Long y short del mismo ticker pueden coexistir.
- `_close_order_internal()`: lógica única para cerrar (manual, SL, TP, close-all, close-cartera).

**Cierres masivos resilientes** (`close_all_positions`, `close_cartera`):
- Bypassean `market_state` (son acciones explícitas con confirmación del alumno; el check de mercado solo aplica a cierres unitarios desde el dropdown).
- Tolerantes a fallos por ticker: si Yahoo rate-limita `_get_current_price`, usan `order.price` (entry) como fallback en vez de romper el bucle. Si `_close_order_internal` lanza, saltan a la siguiente.
- `close_cartera` ya NO pasa por `close_position` (era el origen del bug "te sale el pop-up pero no cierra nada"): hace su propio bucle directo sobre `_close_order_internal`.
- Frontend: `closeAllMut` y `closeCarteraMut` tienen `onError` con `alert()` → los fallos dejan de tragarse en silencio.

**Stop Loss / Take Profit automático**:
- Hilo daemon `_stop_loss_monitor_loop()` cada 2 minutos. Comprueba TODAS las órdenes abiertas con SL/TP, esté o no conectado el alumno.
- Long: SL si precio ≤ stop_loss, TP si precio ≥ take_profit.
- Short: SL si precio ≥ stop_loss, TP si precio ≤ take_profit.
- Cierra automáticamente con nota `[Auto] Stop loss (precio)` o `[Auto] Take profit (precio)`.
- Se arranca en `main.py` vía `start_stop_loss_monitor()`.

**Spread y CFD/Futures**:
- Spread 0.01% solo al ask: `buy` (abrir long) y `close short` (cerrar short). NO al bid.
- CFD con margen 5%: indices (`^`), materias primas (`=F`), divisas (`=X`).
- Forex (precio < 10) ×10000 (EURUSD 1.16 → 11600 → margen 580€).
- Helpers en `demo_service.py`: `_is_cfd()`, `_notional_value()`, `_apply_spread()`.
- `_invested_value()`: margen fijo pagado (no varía con precio). Para columna "Invertido".
- `_position_value()`: margen + PnL no realizado (varía con precio). Para "Valor total".
- Frontend: `lib/cfdUtils.ts` replica la lógica del backend.

**Sistema de carteras (`portfolio_group`)**:
- `portfolio_group` (string nullable) agrupa órdenes en una cartera nombrada.
- `GET /demo/carteras`: posiciones, P&L, diversity score por cartera.
- `POST /demo/close-cartera/{name}`: cierra todas las posiciones de la cartera.
- Botón "Añadir posición" inline (OrderForm con prop `portfolioGroup`).
- Diversity score penalizado: Shannon entropy + penalizaciones (mínimo 5 posiciones, mínimo 3 sectores, ninguna >40%).
- Compra secuencial (`for...of await`): evita race conditions en balance.
- Precio explícito desde el screener: evita discrepancia con yfinance entre que ves el precio y compras.

**Panel del profesor `/admin`**:
- `GET /api/demo/admin/positions` — `require_role("professor", "admin")`.
- Devuelve todos los estudiantes con posiciones abiertas, P&L en vivo, balance, invertido y **stats de trading** (win rate, loss rate, avg_win, avg_loss, R/R, E por operación) calculados sobre operaciones cerradas.
- Auto-refresh cada 60s + botón manual.
- Tarjetas: P&L total clase, P&L medio, total invertido, posiciones abiertas.
- Filas expandibles con la **esperanza matemática del alumno** (E = P_gan × G̅ − P_per × L̅) en cabecera, y la tabla de posiciones debajo.

**Trade stats compartidos**: `_calculate_trade_stats(pnls)` en `demo_service.py` devuelve win_rate, loss_rate, avg_win, avg_loss (positivo), expected_value, risk_reward_ratio. Lo usan tanto `get_performance` (vista alumno) como `get_admin_positions` (vista profesor) — siempre la misma fórmula. Pedagógicamente conectado con el simulador 2.2 de la lección.

**Modelo `Order`**:
- `side` (String(10), nullable): `"long" | "short"`
- `portfolio_group` (String(100), nullable)
- `notes` (String(500), obligatorio): diario de operaciones
- `stop_loss`, `take_profit` (Numeric(14,5), nullable)
- `status`: `"open" | "closed"`
- Migración automática en `main.py` (ALTER TABLE if not exists).
- `_migrate_close_order_status()`: marca FIFO como `closed` las órdenes antiguas que ya estaban cerradas vía `type="close"`.

**Schemas relevantes**:
- `ClosePositionRequest`: usa `order_id` (no `ticker+side`).
- `PositionResponse`: incluye `order_id`, `entry_price`, `take_profit`, `notes`, `created_at`.

**Distribución del capital (UI)**:
- Tabla de posiciones individuales y tabla de cada cartera tienen columna **"Peso"** = `invested_value / portfolio.total_value × 100` (tooltip aclara: capital total = saldo + posiciones).
- Pie chart **"Distribución del capital"** dentro del panel Portfolio (debajo de la tabla, antes de las carteras): agrupa por ticker TODAS las posiciones abiertas (individuales + carteras) y añade slice **"Liquidez"** (= `portfolio.balance`) para sumar 100% del capital. Recharts (`PieChart`+`Pie`+`Cell`); paleta `PIE_COLORS` + `CASH_COLOR` definidas en `Demo.tsx`.

**Archivos**:
```
pages/Demo.tsx                              ← tabla de posiciones + carteras + cerrar-todo
pages/Admin.tsx                             ← panel profesor con P&L en vivo
components/demo/OrderForm.tsx               ← buscador tickers + botones Long/Short + diario
components/demo/TickerSearchInput.tsx        ← autocompletado con debounce
components/demo/ClosePositionDialog.tsx      ← modal cierre parcial/total con slider
components/demo/PortfolioSummaryPanel.tsx    ← sectores + diversity score
components/demo/OrderHistory.tsx             ← historial color-coded (buy verde, sell rojo, close amber)
```

### Screener (`pages/Screener.tsx`)

**Backend** (`market_service.py`):
- 13 universos: SP500, IBEX35, Tech, Healthcare, Finance, Energy, Industrials, Consumer, Indices (spot), **Futures (índices, 24h — incluye candidatos europeos best-effort)**, **ETFs Europa (EWG, EWQ, EWU, FEZ, EWP, etc.)**, Currencies, Commodities, All.
- Cache multinivel: `_info_cache` (30 min) para `yf.Ticker().info`, `_screener_cache` (5 min) por universo.
- **Resultados vacíos NO se cachean** (envenenamiento).
- Filtrado server-side: `_apply_filters()` con sector, market_cap, P/E, dividend, price, change%, beta, ROE.

**Frontend**:
```
pages/Screener.tsx                              ← filtros + tabla sorteable + simulador + correlación
components/screener/CorrelationPanel.tsx         ← KPIs, diagnósticos, pares, heatmap, sugerencias
components/screener/CorrelationHeatmap.tsx       ← heatmap NxN interactivo
hooks/useCorrelation.ts                         ← mutation POST /api/market/correlation
lib/correlationInterpretation.ts                ← diagnósticos pedagógicos, colores, sugerencias
```

- Columnas adaptativas: `isEquity` oculta Market Cap/Sector/P/E/Div%/ROE para índices/divisas/materias primas.
- Columna **Rent. 1Y** sortable: rentabilidad histórica del último año + CAGR 3Y como subtítulo. Se calcula con `_calculate_returns_annualized()` (3y de histórico via `yf.download`, cache 30 min). NO es expected return ni predicción — el tooltip lo deja claro.
- Columna **MDD** (Max Drawdown 3Y) sortable, con color semafórico (verde <15%, amarillo 15-30%, ámbar 30-50%, rojo ≥50%). Calculado en la misma `_calculate_returns_annualized()` para evitar otra descarga.
- Filtros nuevos: `mdd_min`/`mdd_max` para filtrar por máximo drawdown (en %, ej. Max=20 → solo activos con caídas <20%).
- Scroll horizontal con barra arriba (truco CSS `rotateX(180deg)`).
- Simulador con cantidades por activo, costes con margen CFD, diversity score penalizado, tips.
- Compra secuencial → navega a Paper Trading automáticamente.
- **Precarga vía `?tickers=A,B,C`** (usado por las plantillas de `/clase`): `useEffect` lee el query param, `detailedQuote` de cada ticker, los añade al simulador con `qty=1`, abre el panel y limpia el query param. Banner azul mientras carga, ámbar si fallan algunos. **Auto-dispara el cálculo de correlación** al terminar (vía `autoCalcKey` en `CorrelationPanel`).

**Análisis de correlación** (aparece con ≥2 activos):
- `POST /api/market/correlation` con cache 1h por `(tickers_sorted, period)`.
- Matriz NxN + volatilidades anualizadas + diversification ratio.
- 4 KPIs: correlación media, diversification ratio, vol. cartera, riesgo evitado.
- Diagnóstico semafórico (excelente/buena/atención/peligro).
- Par más y menos correlacionado destacados.
- Heatmap interactivo: click en celda → detalle del par.
- Selector de período (3mo–5y) para demostrar inestabilidad.
- Sugerencias accionables según diagnóstico.
- Tooltips explicativos en cada KPI.
- Mutation manual (botón "Calcular") por defecto; auto-disparada vía `autoCalcKey` cuando se llega desde `?tickers=`.

### Backtesting

**Enums (`schemas/common.py`)**:
```
ConditionOperandType: indicator, price, volume, value, candle_pattern
CandlePattern:        bullish_engulfing, bearish_engulfing,
                      bullish_hammer, bearish_hammer,
                      bullish_2020, bearish_2020
StopLossType:         fixed (%), fractal (soporte/resistencia dinámico)
StrategySide:         long, short, both
Comparator:           greater_than, less_than, crosses_above,
                      crosses_below, between, outside
```

**Estructura de una estrategia (`StrategyRules`)**:
```json
{
  "entry": { "operator": "AND", "conditions": [...] },
  "exit": { "operator": "AND", "conditions": [...] },
  "risk_management": {
    "stop_loss_pct": 5, "stop_loss_type": "fixed|fractal",
    "take_profit_pct": 15, "position_size_pct": 100, "max_risk_pct": 2
  },
  "side": "long|short|both"
}
```

**Condition con offset**:
```json
{
  "left": {"type": "candle_pattern", "pattern": "bullish_hammer"},
  "comparator": "greater_than",
  "right": {"type": "value", "value": 0},
  "offset": 4
}
```
`offset: 4` → evalúa la condición 4 velas atrás.

**BBANDS con selector de banda**:
```json
{"type": "indicator", "name": "BBANDS", "params": {"length": 20, "std": 2, "band": "lower|mid|upper"}}
```

**Motor (`backtest_service.py`)**:
- **Warmup**: descarga datos extra antes de `start_date` según el máximo período de indicador.
- **Long/Short** (`side`):
  - Long: `PnL = (exit - entry) × qty`; stop si BAJA.
  - Short: `PnL = (entry - exit) × qty`; stop si SUBE.
- **Fractal stop**: long usa fractal_down (soporte); short usa fractal_up (resistencia).
- **BBANDS trailing stop** (`risk_management.bbands_trailing_stop`): tras la entrada, si el precio cierra por encima de la banda superior (long) o por debajo de la inferior (short), el stop se mueve dinámicamente a la banda media. Solo se mueve en dirección favorable (nunca amplía riesgo). Período/std configurables (`bbands_trailing_length`, `bbands_trailing_std`, defaults 20/2).
- **Risk-based sizing**: `max_risk_pct` limita pérdida por trade.
- **Timeframes**: 1m, 5m, 15m, 1h, 4h, 1d, 1wk.
- **Patrones de velas**: 6 patrones detectados con OHLC math nativo.
- **Modo `both`**: señal entrada → Long, señal salida → Short, independientes.
- **Inline rules**: `BacktestRunRequest` acepta `rules` directamente (sin crear estrategia temporal).
- **`offset` por operando** en `ConditionOperand`: además del offset por `Condition`, cada operando puede tener su propio offset (0-20 velas atrás). Permite expresar comparaciones entre barras distintas dentro de la misma condición (p.ej. `close[t-1] < close[t-2]`).

**Plantillas editables por el profesor**:
- Built-in templates en código (`TEMPLATES`): inmutables, mismas para todos.
- Plantillas BD (`SEEDED_DB_TEMPLATES` → seed en BD al arrancar como `Strategy(is_template=True, user_id=None)`): visibles para todos, editables por `role in (professor, admin)` vía `PUT/DELETE /backtest/strategies/{id}` normales. Sirven para sistemas didácticos que la profesora quiere ajustar (p.ej. "Sistema Sara · 20/20 + Bollinger").
- `get_templates(db?)` fusiona built-in + DB templates.
- Frontend (`Backtest.tsx`): los templates con UUID built-in (`00000000-0000-0000-0000-{12 hex}`) NO muestran botones de editar/borrar; los demás los muestran cuando `user.role === 'professor'`. Badge "plantilla · editable" en ámbar.

**Frontend**:
```
components/backtest/StrategyBuilder.tsx  ← constructor visual completo
pages/Backtest.tsx                       ← inline editor + resultados
backend/app/services/backtest_service.py ← motor + métricas
backend/app/schemas/backtest.py          ← schemas Pydantic
backend/app/schemas/common.py            ← enums
```

**Persistencia (localStorage)**: clave `backtest:state:v1`. Snapshot en cada cambio de mode/ticker/fechas/intervalo/estrategia/customRules/portfolioTickers/universe/alloc. La estrategia se persiste por `id` y se rehidrata cuando llegan templates+strategies (con un `skipNextRulesResetRef` para que el `customRules` editado no sea pisado por el effect que resetea reglas al cambiar `selectedStrategy`). Mismo patrón que Charts (`charts:state:v1`) y Screener (`screener:filters:v1` + `screener:simulator:v1`).

### Lección interactiva (`pages/Clase.jsx` + `pages/AdminClase.tsx`)

**Contenido**: lección de diversificación y gestión de carteras (Bloque 3, master). 5 secciones (Diversificación, Gestión Monetaria, Gestión de Carteras, Principios, Evaluación final). Índice navegable arriba con scroll suave + botón flotante "Volver al índice".

- **Sección 1 — Diversificación**: niveles, correlación con laboratorio interactivo (narrativa en vivo, tabla de referencia de volatilidades), 3 casos prácticos (incluye marzo 2020), diversificación por **factores** (7 factores: growth, value, size, quality, momentum, duration, sensibilidad a tipos), plantillas de cartera con botón "Probar en el Screener" → `/screener?tickers=...`.
- **Sección 2 — Gestión Monetaria**: tamaño de posición, esperanza matemática, drawdown, martingala vs antimartingala (todos con simuladores Recharts).
- **Sección 3 — Gestión de Carteras**: asset allocation, **simulador de pesos capital vs riesgo** (4 métodos), beta/alfa, **simulador de rebalanceo** (60/40 con 3 modos), métricas, **plan de eventos extremos** (5 escenarios con textarea persistente), **los 7 riesgos ocultos** (concentración, correlación, volatilidad, drawdown, liquidez, divisa, tail risk).
- **Sección 4 — Principios irrenunciables**: 4 principios + cuaderno personal.
- **Sección 5 — Evaluación final**: 60 preguntas en 3 pestañas (20 por bloque: 10 test + 10 abiertas). Componente `PreguntaAbierta` nuevo. Datos en `pages/clase/evaluacion-data.js`.

12 retos, ~38 quizzes, 8 checkpoints, 1 cuaderno persistente, 4 plantillas, 5 escenarios extremos, 7 riesgos auto-marcables, 30 preguntas abiertas. Simuladores con Recharts.

**Persistencia híbrida**:
- **localStorage** (prefijo `leccion3:`) para latencia cero en cada cambio.
- **Supabase** (tabla `lesson_responses`, JSON blob): único registro por `(user_id, lesson_id)`.
- 8 tipos de claves bajo `leccion3:`:
  - `reto:{id}` → string (respuesta de texto)
  - `reto-hecho:{id}` → bool
  - `quiz:{id}` → number | null (índice opción)
  - `check:{id}` → bool
  - `cuaderno:sesion3` → string libre
  - `riesgo-expuesto:{n}` → bool (auto-marcado en los 7 riesgos)
  - `plan-evento:{n}` → string (plan de eventos extremos)
  - `abierta:{id}` → string (preguntas abiertas de la evaluación final)

**Hook `useStudentLessonSync(lessonId)`**:
- Hidratación en mount: `GET /api/lesson/{id}/responses` → vuelca remoto a localStorage → render (loader breve). Si no hay token, modo offline (solo localStorage).
- Auto-save: cada `useStoredValue.save()` notifica un bus interno; PUT con **debounce 1500 ms** + **coalescing** (in-flight + pending) para evitar pisar requests.
- Badge fijo arriba-derecha con estado: `idle | loading | saving | saved | error | offline`.

**Plantillas → Screener**: cada plantilla tiene un botón "Probar en el Screener" que navega a `/screener?tickers=AAPL,MSFT,...`. El Screener precarga el simulador y dispara el cálculo de correlación automáticamente.

**Laboratorio de correlación**: bajo el gráfico, narrativa en vivo que cambia según ρ (concentrada / parcial / razonable / bien diversificada / cobertura) + acción condicional ("si bajaras a 0, ahorrarías X puntos"). Al lado de los sliders hay tabla de referencia de volatilidades reales (TLT 12%, SPY 16%, acción típica 22-28%, Tesla/Nvidia 40-50%, cripto 70%+).

**Estilo**: JSX autocontenido, fuentes Fraunces+Manrope, tema cálido académico. NO usa Tailwind.

**Panel profesor `/admin/clase`**:
- Lista alumnos con contadores (retos / quiz / checks / riesgos / plan / abiertas).
- Filas expandibles con secciones por bucket: Cuaderno, Retos, Quizzes, Checkpoints, Riesgos auto-identificados, Plan de eventos extremos, Preguntas abiertas, "Otros datos" (fallback robusto a claves futuras).
- Botón "Exportar CSV" con tipo discriminado por prefijo (reto_respuesta, reto_hecho, quiz, checkpoint, riesgo_expuesto, plan_evento, pregunta_abierta, cuaderno, otro).
- Auto-refresh 30s.
- Solo `role=professor` (`require_role`).
- Auto-creación de la tabla en Supabase la primera vez que arranca el backend.

### Tutor IA (RAG)

**Almacenamiento de PDFs** (Supabase Storage):
- Bucket privado `uploads`.
- `backend/app/services/storage.py`: upload/download/delete vía REST API (httpx).
- Upload: guarda en Supabase + copia local (necesaria para extracción de texto).
- Download: busca local primero; si no existe, baja de Supabase y cachea.
- `file_path` en BD: solo nombre de archivo (`uuid.pdf`), no ruta absoluta.
- Compatibilidad: rutas absolutas legacy se resuelven extrayendo `p.name`.
- Config: `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` en `.env`. Sin estas keys: filesystem local como fallback.

## Concurrencia y rate limiting (Yahoo Finance)

- Yahoo Finance API gratuita: ~15 minutos de retraso vs mercado.
- **Request coalescing single-flight**: `_coalesced_call()` con `concurrent.futures.Future` deduplica requests concurrentes al mismo recurso.
- **Caches**: quotes 5 min (`_QUOTE_TTL`), history 10 min (`_HISTORY_TTL`), screener 5 min, info 30 min.
- **Stale cache fallback**: si Yahoo falla, devuelve datos expirados antes que error.
- **Cache warmer en background**: thread que pre-calienta tickers activos con `yf.download()` batch.
- **1 worker uvicorn** (no 4): comparten cache.
- **Botón "refrescar" en Charts**: `?force=true` invalida cache y pide dato fresco.
- **Frontend**: auto-refresh cada 2 min (quote), gráfico solo bajo demanda.

## Despliegue (VPS IONOS)

```bash
ssh root@212.227.134.30 "cd /opt/analisis-bursatil && git pull origin main && cd frontend && npm run build && systemctl restart analisis-bursatil"
```

- Ubuntu 24.04, IP `212.227.134.30`, dominio `plataforma-trading.sarastem.com`.
- Servicio systemd: `analisis-bursatil` (1 worker uvicorn).
- Nginx: `/api/` → uvicorn :8000, SPA fallback para frontend.
- HTTPS: Let's Encrypt con certbot.
- Logs: `journalctl -u analisis-bursatil -f`.
