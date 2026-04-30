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
├── demo.py          ← Portfolio, Orders, Performance, ClosePosition, PortfolioSummary, Carteras
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
- **Supabase** (PostgreSQL gestionado) — BD + Storage para PDFs del tutor
- Connection string en `.env` como `DATABASE_URL` (Session Pooler, IPv4 compatible)
- SQLAlchemy apunta a Supabase PostgreSQL
- Para desarrollo local se puede usar SQLite cambiando `DATABASE_URL`
- Precisión numérica: `Numeric(14, 5)` para precios (forex necesita 5 decimales)
- **7 vistas SQL** para el profesor: `v_orders`, `v_backtest_runs`, `v_conversations`, `v_messages`, `v_documents`, `v_strategies`, `v_portfolios` — todas incluyen `username` y `user_email`

## Fases de implementación
1. ✅ Schemas Pydantic
2. ✅ Estructura + Auth (FastAPI, config, database, JWT, modelos SQLAlchemy)
3. ✅ Gráficos (yfinance: search, quote, history OHLCV)
4. ✅ Indicadores (catálogo 10 indicadores, cálculo, presets)
5. ✅ Modo Demo (paper trading: portfolio, órdenes, rendimiento, reset, short selling, close-all, carteras)
6. ✅ Backtesting (motor completo, 6 templates, constructor visual, long/short, timeframes, offset, patrones de velas, fractales, Bollinger bands seleccionables)
7. ✅ Tutor IA (RAG: PDF upload, chunking, FAISS/keyword search, chat con LLM, FAQ)
8. ✅ Frontend completo (React 18 + TS strict + Vite + TailwindCSS v4 + lightweight-charts v5)
   - Herramientas de dibujo (trendline, arrow, text, Fibonacci, Elliott, hline, vline, rect, circle) con Primitives API
   - Edición de dibujos: seleccionar + mover (botón Move) + copiar/pegar (botón Copy + click destino, o Ctrl+C/V) + cambiar color (color picker en toolbar)
   - Dibujo en margen derecho: 30 barras de espacio vacío para proyecciones futuras (rightOffset + timeToX extrapolation)
   - Preview en vivo mientras se dibuja (PreviewPrimitive + subscribeCrosshairMove)
   - Detección de patrones de velas: envolvente, vela 20/20, martillo (EA/EB, V20A/V20B, MaA/MaB)
   - Selector de patrones por checkbox (activar/desactivar individualmente)
   - Indicadores overlay + oscilador con editor de parámetros y colores personalizables
   - Osciladores en ventanas separadas (OscillatorChart) con scroll sincronizado al main chart
   - Fractales de Williams renderizados como marcadores sobre las velas
   - Historial de 5 tickers recientes con botón X para eliminar
   - Toggle tipo gráfico: velas japonesas / línea de cierres (CandlestickChart/LineChart icons)
   - Etiquetas "Horizonte temporal" y "Timeframe" sobre los selectores de período/intervalo
   - Botón "Hoy" (scroll to realtime), escala logarítmica (toggle LOG), botón "Ajustar" (reset escala horizontal + vertical)
   - Fibonacci con extensiones: 0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%, 161.8%, 261.8%, 423.6%
   - Enlace a Yahoo Finance por ticker, info de exchange y market state
   - Precio ask con spread y margen CFD visibles junto al precio
   - Botón refrescar precio + gráfico (invalida cache backend, fuerza dato fresco de Yahoo)
   - Líneas de tendencia, horizontal y vertical: color naranja por defecto
   - Confirmación al eliminar dibujos (botón X, Delete key, borrar todo)
   - Soporte intradiario (1m, 5m, 15m, 1h) con timestamps Unix + validación período/intervalo
   - Preservación de escala al añadir/quitar indicadores
   - Dibujo en gráficos de osciladores (cada chart tiene DrawingManager propio, activeChartId en store)
   - VWAP oculto del catálogo (aún disponible en backend)
   - Botón "Comprar" en Charts → navega a Paper Trading con ticker pre-rellenado
   - Formato inteligente de precios: 5 decimales para <10 (forex), 4 para <100, 2 para >=100
   - Eje X intradiario en hora de Madrid (CET/CEST automático)
   - Paper Trading mejorado:
     - **Posiciones independientes**: cada orden = una posición separada (NO se promedian precios)
     - Cerrar por `order_id`, no por ticker+side (evita bugs de precio medio)
     - Buy = abrir LONG, Sell = abrir SHORT (posiciones simultáneas long/short permitidas)
     - Cerrar posición (total o parcial) con modal de confirmación
     - Botón "Cerrar todo" para liquidar todas las posiciones
     - Posiciones en formato tabla/lista (no tarjetas)
     - Resumen portfolio con diversificación (Shannon entropy penalizada) y distribución sectorial
     - Buscador de tickers con autocompletado en formulario de orden
     - Diario de operaciones obligatorio: campo `notes` (500 chars) para justificar cada orden
     - Formulario se resetea tras ejecutar orden (ticker, cantidad, notas)
     - Spread 0.01% en todas las compras (ask side: buy long + close short)
     - CFD/Futures: indices, materias primas, divisas operan con margen 5%. Forex (<10) ×10000
     - Columnas "P. entrada" / "P. cierre" con etiquetas bid/ask
     - **Stop loss / Take profit automático**: hilo background cada 2 min comprueba todas las posiciones
     - Sistema de carteras nombradas (portfolio_group):
       - Compra desde el simulador del Screener → crea cartera con nombre
       - Ejecución secuencial (evita race conditions en balance)
       - Carteras se muestran en recuadro independiente con borde cyan
       - Diversity score penalizado (min 5 posiciones, min 3 sectores, concentración >40%)
       - Cerrar cartera completa o posiciones individuales para rebalanceo
       - Botón "Añadir posición" dentro de cada cartera (OrderForm inline con portfolio_group)
       - Auto-navegación a Paper Trading tras compra de cartera
   - Stock Screener (página independiente `/screener`):
     - 11 universos: S&P 500 (~130), IBEX 35 (35), Tech (42), Healthcare (28), Finance (28), Energy (20), Industrials (23), Consumer (22), Indices (12), Divisas (10), Materias Primas (12), All
     - 9 filtros: Precio, Cambio%, Sector, Market Cap, P/E, Dividendo%, Beta, ROE, Volatilidad
     - Tabla sorteable con scroll horizontal (barra arriba) + búsqueda por texto
     - Columnas adaptativas: oculta Market Cap, Sector, P/E, Div%, ROE para universos no-equity
     - Simulador de portfolio: cantidades por activo, costes con margen CFD, diversity score penalizado
     - Info de spread y margen CFD visible en simulador
     - Comprar cartera → ejecución secuencial → navega a Paper Trading
     - Diario de trading obligatorio en compra de carteras
     - Navegación: ticker → Charts, carrito → Paper Trading con ticker pre-rellenado
   - Dashboard:
     - 4 tarjetas principales (Gráficos, Paper Trading, Backtesting, Screener)
     - Tutor IA como bloque grande independiente debajo
     - Stats del portfolio si hay posiciones abiertas
     - Ranking de usuarios por valor de portfolio (excluye demo users, debajo del Tutor IA)
   - Backtesting:
     - Buscador de tickers con autocompletado (reutiliza TickerSearchInput)
     - Ejecución de plantillas sin crear estrategias temporales (rules inline)
     - Tabla de operaciones muestra columna "Lado" (Long/Short) y "Cierre" (Señal/Stop/TP)
     - Modo "Long + Short" (both): señal entrada → Long, señal salida → Short, independientes
9. 🔄 Pulido (UI/UX, deploy)

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
lib/drawings/primitives/*.ts              ← 9 primitivas + PreviewPrimitive + renderers (pointToPixel, timeToX, chartMeta)
lib/patterns.ts                           ← Detección de patrones de velas (client-side)
lib/recentTickers.ts                      ← localStorage para tickers recientes
lib/chartUtils.ts                         ← CHART_THEME, toChartTime() (Madrid TZ), INDICATOR_COLORS
```

### Formato inteligente de precios
- `fmtPrice(val)`: 5 decimales si <10 (forex), 4 si <100, 2 si >=100
- `fmtChange(val, refPrice)`: misma lógica, basada en precio de referencia
- `getPriceFormat(price)`: devuelve `{precision, minMove}` para configurar ejes del chart
- Se aplica en: eje Y del candlestick, cabecera de quote, valores de indicadores, tablas de posiciones

### Zona horaria
- Eje X intradiario (1m, 5m, 15m, 1h) ajustado a hora de Madrid (Europe/Madrid)
- `getMadridOffsetSec(date)` calcula offset CET/CEST automáticamente via `toLocaleString`
- Charts diarios y superiores no se ven afectados (solo muestran fecha YYYY-MM-DD)

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
- **`pointToPixel()` y `timeToX()`** en `renderers.ts`: conversión tiempo→píxel con fallback para margen derecho (fechas futuras)
- `chartMeta` (objeto compartido en renderers.ts): `dataLength`, `barIntervalSec`, `lastChartTime`, `isIntraday` — actualizado por Charts.tsx, leído por todas las primitivas
- Tiempo de dibujos: YYYY-MM-DD para daily, Unix seconds (string) para intraday — `parseTimeSec()` y `toTimeValue()` detectan formato automáticamente
- Copy/paste: `clipboard` + `pasteMode` en store, click para colocar copia
- Move: `moveMode` + `dragAnchor` + `finishDrag()` en store, botón Move en toolbar

## Usuarios demo (auto-seed al arrancar)
```
Profesor:   profesor@demo.com / Demo1234
Alumna:     sara@demo.com / Demo1234
Código de invitación: AB_2026
```

## API — 44 rutas implementadas
```
Auth:       POST register, login | GET me | POST invite
Market:     GET search, quote/{ticker}, history/{ticker}, detailed-quote/{ticker}
            POST screener | GET screener/sectors/{universe}
Indicators: GET catalog | POST calculate | GET/POST presets
Demo:       GET portfolio, orders, performance, portfolio/summary, carteras, ranking
            GET admin/positions (solo profesor)
            POST order, close-position, close-all, close-cartera/{name}, reset
Backtest:   GET templates, strategies, strategies/{id} | POST strategies
            PUT/DELETE strategies/{id}
            POST run | GET runs, runs/{id}, runs/{id}/trades | DELETE runs/{id}
            POST compare
Tutor:      POST chat | GET conversations, conversations/{id}/messages
            DELETE conversations/{id}
            POST/GET documents | GET documents/{id}/download | DELETE documents/{id}
            GET faq
Health:     GET /api/health
```

## Arquitectura de Paper Trading (Demo)

### Semántica de órdenes
- `buy` → abre posición LONG (deduce coste del balance)
- `sell` → abre posición SHORT (deduce margen 100% del balance)
- `close` → cierra posición por `order_id` (total o parcial)
- **Posiciones independientes**: cada orden es su propia posición, sin promediar precios
- Un mismo ticker puede tener múltiples posiciones LONG y SHORT independientes
- `_close_order_internal()`: lógica compartida para cerrar (manual, stop loss, take profit, close-all)

### Stop Loss / Take Profit automático
- **Background monitor**: hilo daemon `_stop_loss_monitor_loop()` cada 2 minutos
- Comprueba TODAS las órdenes con SL/TP, esté o no conectado el alumno
- Long: SL si precio ≤ stop_loss, TP si precio ≥ take_profit
- Short: SL si precio ≥ stop_loss, TP si precio ≤ take_profit
- Cierra la orden automáticamente con nota `[Auto] Stop loss (precio)` o `[Auto] Take profit (precio)`
- Se registra en `main.py` vía `start_stop_loss_monitor()` en el evento startup

### Sistema de carteras (portfolio_group)
- Las órdenes pueden llevar `portfolio_group` (string) para agruparse en una cartera nombrada
- `GET /demo/carteras` devuelve las carteras con posiciones, P&L, diversity score
- `POST /demo/close-cartera/{name}` cierra todas las posiciones de una cartera
- Botón "Añadir posición" dentro de cada cartera (OrderForm con `portfolioGroup` prop)
- Diversity score penalizado: Shannon entropy + penalizaciones (min 5 posiciones, min 3 sectores, concentración >40%)
- Compra secuencial (`for...of await`) para evitar race conditions en el balance
- Precio explícito: se pasa `price` del screener para evitar discrepancias con yfinance

### Panel del profesor (Admin)
- `GET /api/demo/admin/positions` — requiere rol `professor` o `admin`
- Devuelve todos los estudiantes con posiciones abiertas, P&L en tiempo real, balance, invertido
- Frontend: `/admin` — tabla expandible por alumno con detalle de posiciones
- Solo visible en navbar para profesores (icono Shield, color amber)
- Auto-refresh cada 60s + botón manual
- Tarjetas resumen: P&L total clase, P&L medio, total invertido, posiciones abiertas

### Archivos clave
```
pages/Demo.tsx                             ← Página principal, tabla posiciones individuales + carteras, botón cerrar-todo
pages/Admin.tsx                            ← Panel profesor: posiciones de todos los alumnos con P&L real
components/demo/OrderForm.tsx              ← Formulario con buscador de tickers, botones Long/Short
components/demo/TickerSearchInput.tsx       ← Autocompletado con market.search() + debounce
components/demo/ClosePositionDialog.tsx     ← Modal cierre parcial/total con slider
components/demo/PortfolioSummaryPanel.tsx   ← Sectores + diversity score (Shannon entropy penalizada)
components/demo/OrderHistory.tsx            ← Historial color-coded (buy verde, sell rojo, close amber)
```

### Spread y CFD/Futures
- Spread 0.01% aplicado solo al ask: `buy` (abrir long) y `close short` (cerrar short)
- No se aplica spread al bid: `sell` (abrir short) y `close long` (cerrar long)
- CFD: indices (^), materias primas (=F), divisas (=X) operan con margen 5%
- Forex: precios <10 se multiplican ×10000 (EURUSD 1.16 → 11600, margen 580€)
- `_is_cfd()`, `_notional_value()`, `_apply_spread()` en demo_service.py
- `_close_order_internal()`: cierra una orden (completa o parcial) y actualiza balance. Usado por close_position, close_all, stop_loss_monitor
- `_invested_value()`: margen fijo pagado (no cambia con precio). Para "Invertido"
- `_position_value()`: margen + PnL no realizado (cambia con precio). Para "Valor total"
- Frontend: `lib/cfdUtils.ts` replica la lógica CFD del backend
- Posiciones SHORT muestran precio ask (con spread) como "P. cierre"

### Modelo de datos (Order)
- Columna `side` (String(10), nullable): "long" | "short"
- Columna `portfolio_group` (String(100), nullable): nombre de cartera
- Columna `notes` (String(500), mandatory): diario de operaciones obligatorio
- Columna `stop_loss` y `take_profit` (Numeric(14,5), nullable)
- Columna `status`: "open" | "closed" (se marca closed al cerrar la orden)
- Precisión: `Numeric(14, 5)` en todos los campos de precio
- Migration automática en `main.py` (ALTER TABLE si columna no existe)
- Migration de estados: `_migrate_close_order_status()` marca órdenes antiguas como cerradas (FIFO)

### Schemas actualizados
- `ClosePositionRequest`: usa `order_id` (no ticker+side)
- `PositionResponse`: incluye `order_id`, `entry_price` (no avg_price), `take_profit`, `notes`, `created_at`

## Arquitectura de Screener

### Backend
- 11 universos en `market_service.py`: SP500, IBEX35, Tech, Healthcare, Finance, Energy, Industrials, Consumer, Indices, Currencies, Commodities
- Cache multinivel: `_info_cache` (30min TTL) para yf.Ticker().info, `_screener_cache` (5min TTL) por universo
- **IMPORTANTE**: resultados vacíos NO se cachean (evita envenenamiento de cache por fallos de yfinance)
- Filtrado server-side: `_apply_filters()` aplica sector, market_cap, P/E, dividend, price, change%, beta, ROE

### Frontend
```
pages/Screener.tsx  ← Página completa: filtros + tabla sorteable + simulador de portfolio
```
- Columnas adaptativas: `isEquity` oculta Market Cap, Sector, P/E, Div%, ROE para índices/divisas/materias primas
- Scroll horizontal con barra arriba (CSS `rotateX(180deg)` trick)
- Simulador con cantidades por activo, precios en tiempo real, diversity score penalizado, tips
- Compra secuencial → navega a Paper Trading automáticamente

## Arquitectura de Backtesting

### Enums y tipos (schemas/common.py)
```
ConditionOperandType: indicator, price, volume, value, candle_pattern
CandlePattern: bullish_engulfing, bearish_engulfing, bullish_hammer, bearish_hammer,
               bullish_2020, bearish_2020
StopLossType: fixed (%), fractal (soporte/resistencia dinámico)
StrategySide: long, short, both
Comparator: greater_than, less_than, crosses_above, crosses_below, between, outside
```

### Estructura de una estrategia (StrategyRules)
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

### Condition con offset
```json
{
  "left": {"type": "candle_pattern", "pattern": "bullish_hammer"},
  "comparator": "greater_than",
  "right": {"type": "value", "value": 0},
  "offset": 4
}
```
`offset: 4` → evalúa la condición 4 velas atrás

### BBANDS con selector de banda
```json
{"type": "indicator", "name": "BBANDS", "params": {"length": 20, "std": 2, "band": "lower|mid|upper"}}
```

### Motor de simulación (backtest_service.py)
- **Warmup**: descarga datos extra antes del start_date según el máximo período de indicador
- **Long/Short**: `side` en StrategyRules determina la dirección
  - Long: PnL = (exit - entry) × qty; stop si precio BAJA
  - Short: PnL = (entry - exit) × qty; stop si precio SUBE
- **Fractal stop**: Long usa fractal_down (soporte), Short usa fractal_up (resistencia)
- **Risk-based sizing**: `max_risk_pct` limita pérdida por trade como % del capital
- **Timeframes**: interval configurable (1m, 5m, 15m, 1h, 4h, 1d, 1wk)
- **Patrones de velas**: 6 patrones detectados con OHLC math nativo (sin pandas-ta)
- **Modo both**: señal entrada → Long, señal salida → Short, cada uno se cierra independientemente
- **Inline rules**: `BacktestRunRequest` acepta `rules` directamente (sin crear estrategia temporal)
- **Buscador de tickers**: autocompletado con `TickerSearchInput` reutilizado de Demo

### Archivos clave
```
components/backtest/StrategyBuilder.tsx  ← Constructor visual completo
pages/Backtest.tsx                       ← Página principal, inline editor, resultados
backend/app/services/backtest_service.py ← Motor: templates, simulación, métricas
backend/app/schemas/backtest.py          ← Schemas Pydantic para reglas y resultados
backend/app/schemas/common.py           ← Enums: CandlePattern, StopLossType, StrategySide
```

## Concurrencia y Rate Limiting (Yahoo Finance)
- Yahoo Finance API gratuita: ~15 minutos de retraso vs mercado real
- **Request coalescing** (single-flight): `_coalesced_call()` con `concurrent.futures.Future` deduplica requests
- **Cache backend**: quotes 5min (`_QUOTE_TTL`), history 10min (`_HISTORY_TTL`), screener 5min
- **Stale cache fallback**: si Yahoo falla, devuelve datos expirados en vez de error
- **Background cache warmer**: thread que pre-calienta tickers activos con `yf.download()` batch
- **1 worker** (no 4): evita 4 caches separados que multiplican llamadas a Yahoo
- **Botón refrescar**: `?force=true` invalida cache backend y pide dato fresco
- **Frontend**: auto-refresh cada 2min (quote), gráfico solo bajo demanda

## Supabase Storage (PDFs del Tutor)
- Bucket: `uploads` (privado)
- `backend/app/services/storage.py`: upload/download/delete via REST API (httpx)
- Upload: guarda en Supabase + copia local (necesaria para extracción de texto)
- Download: busca local primero, si no existe baja de Supabase y cachea
- `file_path` en BD: solo nombre de archivo (ej: `uuid.pdf`), no ruta absoluta
- Compatibilidad: resuelve rutas absolutas legacy extrayendo `p.name`
- Config: `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` en `.env`
- Sin estas keys: funciona solo con filesystem local (fallback)

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
