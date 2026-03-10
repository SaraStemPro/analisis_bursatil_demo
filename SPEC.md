# Plataforma de Análisis Bursátil Educativa — Especificación (SDD)

> Versión: 2.0
> Fecha: 2026-03-09
> Autor: Spec Driven Development
> Estado: **Fases 1-8 COMPLETADAS — Fase 9 (Pulido) en progreso**

---

## 1. Visión del Producto

Plataforma web educativa para estudiantes de Máster (~23 años) que permite practicar análisis técnico bursátil fuera del horario de clase. Combina gráficos interactivos con datos reales, un modo demo para práctica sin riesgo y un tutor IA 24/7 basado en los apuntes del profesor (PDFs).

---

## 2. Usuarios

| Rol | Descripción |
|-----|-------------|
| **Estudiante** | Alumno de Máster. Consulta gráficos, practica análisis técnico, hace preguntas al tutor IA. |
| **Profesor** | Sube PDFs con apuntes. Configura ejercicios y contenido del curso. |
| **Admin** | Gestiona usuarios y configuración general de la plataforma. |

---

## 3. Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React)                  │
│  - Vite + TypeScript                                │
│  - TailwindCSS                                      │
│  - Recharts / Lightweight Charts (TradingView)      │
│  - React Query (data fetching)                      │
│  - React Router                                     │
└──────────────────────┬──────────────────────────────┘
                       │ REST API (JSON)
┌──────────────────────▼──────────────────────────────┐
│                 Backend (Python)                     │
│  - FastAPI                                          │
│  - yfinance (datos bursátiles)                      │
│  - pandas / ta-lib (cálculo de indicadores)         │
│  - LangChain + FAISS (RAG sobre PDFs del profesor)  │
│  - SQLAlchemy + SQLite (desarrollo) / PostgreSQL    │
└─────────────────────────────────────────────────────┘
```

---

## 4. Módulos Funcionales

### 4.1 Gráficos Bursátiles Interactivos

**Objetivo**: Visualizar datos reales de mercado con indicadores técnicos configurables.

**Requisitos**:
- Buscar acciones por ticker o nombre (ej: AAPL, IBEX 35, BBVA.MC)
- Gráfico de velas japonesas (candlestick) como vista principal
- Gráfico de línea como vista alternativa
- Selector de rango temporal: 1D, 5D, 1M, 3M, 6M, 1A, 5A, Máx
- Zoom y pan interactivo en el gráfico
- Volumen mostrado como barras debajo del gráfico principal

**Fuente de datos**: Yahoo Finance vía `yfinance`

**Endpoints**:
```
GET /api/market/search?q={query}         → buscar tickers
GET /api/market/quote/{ticker}           → precio actual + info básica
GET /api/market/history/{ticker}?period={period}&interval={interval} → datos OHLCV
```

### 4.2 Indicadores Técnicos Personalizables

**Objetivo**: El estudiante elige qué indicadores superponer al gráfico desde un catálogo.

**Catálogo de indicadores**:

| Categoría | Indicador | Parámetros configurables |
|-----------|-----------|--------------------------|
| Tendencia | SMA (Media Móvil Simple) | Período (10, 20, 50, 200) |
| Tendencia | EMA (Media Móvil Exponencial) | Período |
| Tendencia | MACD | Fast, Slow, Signal |
| Momentum | RSI (Índice de Fuerza Relativa) | Período (14 por defecto) |
| Momentum | Estocástico | %K, %D períodos |
| Volatilidad | Bandas de Bollinger | Período, Desviación estándar |
| Volatilidad | ATR (Average True Range) | Período |
| Volumen | OBV (On Balance Volume) | — |
| Volumen | VWAP | — |
| Soporte/Resistencia | Retrocesos de Fibonacci | Rango seleccionable |

**Comportamiento**:
- Panel lateral con catálogo de indicadores agrupados por categoría
- Cada indicador se activa/desactiva con un toggle
- Parámetros editables al expandir cada indicador
- Indicadores de tendencia y Bollinger se superponen al gráfico principal
- RSI, MACD, Estocástico, ATR se muestran en paneles separados debajo
- Máximo 5 indicadores activos simultáneamente (para rendimiento y claridad)
- Presets guardables: el alumno puede guardar combinaciones favoritas

**Endpoints**:
```
GET  /api/indicators/catalog              → lista completa de indicadores disponibles
POST /api/indicators/calculate            → body: {ticker, period, indicators: [{name, params}]}
GET  /api/indicators/presets              → presets guardados del usuario
POST /api/indicators/presets              → guardar preset
```

### 4.3 Modo Demo (Paper Trading)

**Objetivo**: Practicar compra/venta con dinero ficticio usando datos reales. Incluye posiciones individuales y carteras agrupadas.

**Requisitos**:
- Saldo inicial configurable (por defecto: 100.000 €)
- Operaciones: Buy (abrir LONG), Sell (abrir SHORT), Close (cerrar total/parcial)
- Un mismo ticker puede tener posición LONG y SHORT simultáneamente
- Portfolio virtual con posiciones abiertas y cerradas
- Historial de operaciones con P&L (Profit & Loss)
- Métricas de rendimiento: rentabilidad total, ratio Sharpe, max drawdown, win rate
- Carteras nombradas (portfolio_group): agrupan posiciones, muestran diversity score
- Diversity score penalizado: Shannon entropy + penalizaciones (min 5 posiciones, min 3 sectores, concentración >40%)
- Cerrar cartera completa o posiciones individuales para rebalanceo
- Formato inteligente de precios: 5 decimales para forex (<10), 2 para acciones (>=100)
- Ranking opcional entre estudiantes del mismo curso (gamificación)

**Endpoints**:
```
GET    /api/demo/portfolio                → portfolio actual del usuario (posiciones + balance)
POST   /api/demo/order                    → crear orden {ticker, type, quantity, price?, stop_loss?, take_profit?, portfolio_group?}
POST   /api/demo/close-position           → cerrar posición {ticker, quantity, side}
POST   /api/demo/close-all                → cerrar todas las posiciones abiertas
GET    /api/demo/orders                   → historial de órdenes
GET    /api/demo/performance              → métricas de rendimiento
GET    /api/demo/portfolio/summary        → resumen con sectores y diversity score
GET    /api/demo/carteras                 → carteras agrupadas con P&L y diversity score
POST   /api/demo/close-cartera/{name}     → cerrar todas las posiciones de una cartera
POST   /api/demo/reset                    → resetear portfolio a valores iniciales
```

### 4.4 Tutor IA 24/7 (RAG sobre PDFs)

**Objetivo**: Chatbot que responde preguntas basándose en los apuntes del profesor.

**Arquitectura RAG**:
1. Profesor sube PDFs → se extraen textos con `PyPDF2`/`pdfplumber`
2. Texto se divide en chunks (~500 tokens)
3. Chunks se embeben con modelo de embeddings (OpenAI o sentence-transformers)
4. Se almacenan en FAISS (vector store)
5. Al preguntar: se buscan chunks relevantes → se pasan como contexto al LLM → respuesta

**Requisitos**:
- Chat conversacional con historial de mensajes
- Respuestas citan la fuente (nombre del PDF + página)
- Si no encuentra respuesta en los apuntes, lo indica claramente
- Preguntas predefinidas sugeridas según el tema del gráfico activo
- Profesor puede ver las preguntas más frecuentes de los alumnos

**Endpoints**:
```
POST /api/tutor/chat                     → {message, conversation_id?} → respuesta + fuentes
GET  /api/tutor/conversations            → historial de conversaciones del usuario
GET  /api/tutor/conversations/{id}/messages → mensajes de una conversación
DELETE /api/tutor/conversations/{id}      → eliminar conversación
POST /api/tutor/documents                → subir PDF (solo profesor)
GET  /api/tutor/documents                → listar PDFs subidos
GET  /api/tutor/documents/{id}/download  → descargar PDF
DELETE /api/tutor/documents/{id}         → eliminar PDF (solo profesor)
GET  /api/tutor/faq                      → preguntas frecuentes (solo profesor)
```

### 4.5 Autenticación y Usuarios

**Requisitos**:
- Login con email + contraseña
- Roles: estudiante, profesor, admin
- JWT para sesiones
- El profesor crea invitaciones o códigos de acceso para sus alumnos

**Endpoints**:
```
POST /api/auth/register                  → registro con código de invitación
POST /api/auth/login                     → → JWT token
GET  /api/auth/me                        → perfil del usuario actual
POST /api/auth/invite                    → crear código de invitación (solo profesor)
```

### 4.6 Backtesting de Estrategias

**Objetivo**: Permitir al estudiante definir estrategias de trading basadas en indicadores técnicos, probarlas contra datos históricos y evaluar su rendimiento. El módulo sigue un enfoque pedagógico progresivo: explorar → construir → evaluar.

#### 4.6.1 Estrategias Predefinidas (Explorar)

El alumno dispone de un catálogo de estrategias clásicas listas para ejecutar. Sirven como punto de partida para entender qué es un backtest y cómo funcionan las reglas de entrada/salida.

| Estrategia | Entrada | Salida |
|-----------|---------|--------|
| **Cruce Dorado** | SMA 50 cruza por encima de SMA 200 | SMA 50 cruza por debajo de SMA 200 |
| **Cruce de Muerte** (inversa) | SMA 50 cruza por debajo de SMA 200 | SMA 50 cruza por encima de SMA 200 |
| **RSI Reversión a la Media** | RSI(14) < 30 | RSI(14) > 70 |
| **MACD Signal** | Línea MACD cruza por encima de Signal | Línea MACD cruza por debajo de Signal |
| **Bollinger Bounce** | Precio toca banda inferior de Bollinger | Precio toca banda superior de Bollinger |
| **EMA Momentum** | Precio cruza por encima de EMA 20 Y RSI(14) > 50 | Precio cruza por debajo de EMA 20 |

Cada estrategia predefinida incluye:
- Descripción en lenguaje natural de la lógica
- Referencia al material teórico (enlace a sección relevante de los PDFs del profesor si existe)
- Parámetros editables (el alumno puede modificar períodos, umbrales, etc. antes de ejecutar)

#### 4.6.2 Constructor Visual de Estrategias (Construir)

Interfaz visual donde el alumno define su propia estrategia sin escribir código, combinando indicadores del catálogo (módulo 4.2) con condiciones lógicas, patrones de velas y gestión de riesgo avanzada.

**Estructura de una estrategia**:
```
Estrategia
├── Nombre y descripción
├── Tipo de posición: Long (comprar) o Short (vender en corto)
├── Condiciones de ENTRADA
│   ├── Condición 1: [Operando] [Comparador] [Operando]  (offset: N velas atrás)
│   ├── Condición 2: ...
│   └── Operador lógico entre condiciones: AND / OR
├── Condiciones de SALIDA
│   ├── Condición 1: [Operando] [Comparador] [Operando]  (offset: N velas atrás)
│   └── Operador lógico entre condiciones: AND / OR
└── Gestión de riesgo
    ├── Stop-Loss: Fijo (%) o Dinámico (fractal soporte/resistencia)
    ├── Take-Profit: % objetivo
    ├── Capital por operación: % del cash disponible
    └── Riesgo máximo por trade: % del capital total
```

**Tipos de operandos**:
- **Indicador**: SMA, EMA, RSI, MACD, BBANDS (con selector de banda: inferior/media/superior), STOCH, ATR, OBV, FRACTALS
- **Precio**: apertura, cierre, máximo, mínimo
- **Volumen**: volumen de la barra
- **Valor numérico**: constante (ej: 30, 70)
- **Patrón de vela**: envolvente alcista/bajista, martillo alcista/bajista, marubozu alcista/bajista, long line alcista/bajista

**Offset (velas atrás)**: cada condición puede evaluarse N velas atrás (0 = vela actual, 4 = hace 4 velas). Permite combinar condiciones en diferentes momentos temporales.

**Tipos de comparadores disponibles**:

| Comparador | Ejemplo |
|-----------|---------|
| `mayor_que` | RSI(14) > 70 |
| `menor_que` | RSI(14) < 30 |
| `cruza_por_encima` | Precio cruza por encima de EMA(20) |
| `cruza_por_debajo` | SMA(50) cruza por debajo de SMA(200) |
| `entre` | RSI(14) entre 40 y 60 |
| `fuera_de` | Precio fuera de Bandas de Bollinger |

**Formato JSON de una estrategia** (cómo se almacena):
```json
{
  "entry": {
    "operator": "AND",
    "conditions": [
      {
        "left": {"type": "candle_pattern", "pattern": "bullish_hammer"},
        "comparator": "greater_than",
        "right": {"type": "value", "value": 0},
        "offset": 0
      },
      {
        "left": {"type": "price", "field": "low"},
        "comparator": "less_than",
        "right": {"type": "indicator", "name": "BBANDS", "params": {"length": 20, "std": 2, "band": "lower"}},
        "offset": 0
      }
    ]
  },
  "exit": {
    "operator": "OR",
    "conditions": [
      {
        "left": {"type": "indicator", "name": "RSI", "params": {"length": 14}},
        "comparator": "greater_than",
        "right": {"type": "value", "value": 70},
        "offset": 0
      }
    ]
  },
  "risk_management": {
    "stop_loss_pct": 5.0,
    "stop_loss_type": "fractal",
    "take_profit_pct": 15.0,
    "position_size_pct": 100,
    "max_risk_pct": 2.0
  },
  "side": "long"
}
```

#### 4.6.3 Ejecución y Resultados (Evaluar)

Al ejecutar un backtest, el sistema procesa la estrategia contra los datos históricos del ticker seleccionado y genera un informe completo.

**Parámetros de ejecución**:
- Ticker (o lista de tickers para probar en varios activos)
- Rango de fechas (inicio y fin)
- Timeframe/Intervalo: 1m, 5m, 15m, 1h, 4h, 1d (diario), 1wk (semanal)
- Capital inicial (por defecto: 100.000 €, coherente con el modo demo)
- Comisión por operación (configurable, por defecto: 0.1%)
- Warmup automático: el motor descarga datos extra antes del start_date para calentar indicadores (SMA 200 necesita 200+ barras)

**Métricas de rendimiento** (mostradas en el informe):

| Métrica | Descripción |
|---------|-------------|
| Rentabilidad total (%) | Ganancia/pérdida neta sobre capital inicial |
| Rentabilidad anualizada (%) | Rentabilidad ajustada a base anual |
| Ratio de Sharpe | Rentabilidad ajustada al riesgo |
| Máximo Drawdown (%) | Mayor caída desde un pico al siguiente valle |
| Win Rate (%) | Porcentaje de operaciones ganadoras |
| Profit Factor | Ganancias brutas / Pérdidas brutas |
| Nº total de operaciones | Cantidad de trades ejecutados |
| Duración media de operación | Tiempo medio que se mantiene una posición |
| Mejor / Peor operación | P&L de la mejor y peor trade |
| Benchmark vs Buy & Hold | Comparación con simplemente comprar y mantener |

**Visualizaciones**:
- **Curva de equity**: Evolución del capital a lo largo del tiempo, superpuesta con Buy & Hold como referencia
- **Operaciones sobre gráfico**: Las señales de compra/venta marcadas directamente sobre el gráfico de velas del activo (reutiliza el gráfico del módulo 4.1)
- **Distribución de P&L**: Histograma con la distribución de ganancias/pérdidas por operación
- **Drawdown**: Gráfico del drawdown a lo largo del tiempo
- **Tabla de operaciones**: Lista detallada de cada trade con fecha entrada, fecha salida, precio entrada, precio salida, P&L, duración

**Comparación de estrategias**: El alumno puede seleccionar hasta 3 backtests ejecutados previamente y comparar sus métricas en una tabla lado a lado.

#### 4.6.4 Integración con el Tutor IA

El tutor IA (módulo 4.4) se integra con el backtesting:
- **Explicación de resultados**: Al finalizar un backtest, el alumno puede pedir al tutor que interprete los resultados ("¿Por qué mi drawdown es tan alto?", "¿Cómo puedo mejorar el ratio de Sharpe?")
- **Sugerencias contextuales**: El tutor sugiere preguntas relevantes basándose en los resultados del backtest (ej: si el win rate es bajo, sugiere "¿Qué técnicas existen para filtrar señales falsas?")
- **Referencia teórica**: Las métricas del informe enlazan con las explicaciones del tutor basadas en los PDFs del profesor

#### 4.6.5 Endpoints

```
# Estrategias
GET    /api/backtest/strategies/templates     → catálogo de estrategias predefinidas
GET    /api/backtest/strategies               → estrategias propias del usuario
POST   /api/backtest/strategies               → crear estrategia {name, description, rules}
GET    /api/backtest/strategies/{id}          → detalle de una estrategia
PUT    /api/backtest/strategies/{id}          → actualizar estrategia
DELETE /api/backtest/strategies/{id}          → eliminar estrategia

# Ejecución
POST   /api/backtest/run                      → ejecutar backtest {strategy_id, ticker, start_date, end_date, interval?, initial_capital, commission_pct}
GET    /api/backtest/runs                     → historial de backtests del usuario
GET    /api/backtest/runs/{id}               → resultado completo de un backtest (métricas + trades)
GET    /api/backtest/runs/{id}/trades        → lista de operaciones del backtest
DELETE /api/backtest/runs/{id}               → eliminar resultado de backtest

# Comparación
POST   /api/backtest/compare                  → comparar backtests {run_ids: [id1, id2, id3]} → métricas lado a lado
```

### 4.7 Stock Screener

**Objetivo**: Buscar, filtrar y comparar activos financieros por fundamentales y métricas de mercado. Incluye un simulador de portfolio para practicar asset allocation antes de comprar.

**Universos disponibles** (11):

| Universo | Tickers | Tipo |
|----------|---------|------|
| S&P 500 | ~130 | Equity |
| IBEX 35 | 35 | Equity |
| Tech | 42 | Equity |
| Healthcare | 28 | Equity |
| Finance | 28 | Equity |
| Energy | 20 | Equity |
| Industrials | 23 | Equity |
| Consumer | 22 | Equity |
| Índices | 12 | Non-equity |
| Divisas | 10 | Non-equity |
| Materias Primas | 12 | Non-equity |

**Filtros** (9): Precio, Cambio%, Sector, Market Cap, P/E, Dividendo%, Beta, ROE, Volatilidad

**Simulador de portfolio**:
- Seleccionar activos con cantidades individuales
- Ver distribución sectorial y diversity score (Shannon entropy penalizada)
- Tips de diversificación según el estado del portfolio
- Comprar toda la cartera → ejecución secuencial → auto-navegación a Paper Trading

**Comportamiento UI**:
- Tabla sorteable con scroll horizontal (barra arriba)
- Columnas adaptativas: oculta Market Cap, Sector, P/E, Div%, ROE para universos non-equity
- Búsqueda por texto sobre ticker y nombre
- Etiqueta "productos" en vez de "acciones"

**Endpoints**:
```
POST /api/market/screener                → filtrar activos {universe, filtros...} → lista de DetailedQuote
GET  /api/market/screener/sectors/{u}    → sectores disponibles para un universo
```

---

## 5. Modelo de Datos

```
User
├── id: UUID
├── email: string (unique)
├── password_hash: string
├── name: string
├── role: enum(student, professor, admin)
├── created_at: datetime
└── course_id: FK → Course

Course
├── id: UUID
├── name: string
├── professor_id: FK → User
└── invite_code: string (unique)

Portfolio (Modo Demo)
├── id: UUID
├── user_id: FK → User
├── balance: decimal
├── initial_balance: decimal
└── created_at: datetime

Order
├── id: UUID
├── portfolio_id: FK → Portfolio
├── ticker: string
├── type: enum(buy, sell, close)
├── quantity: integer
├── price: decimal(14,5)          ← 5 decimales para forex
├── stop_loss: decimal(14,5)?
├── take_profit: decimal(14,5)?
├── status: enum(open, closed, cancelled)
├── side: enum(long, short)?      ← dirección de la posición
├── pnl: decimal(14,5)?
├── portfolio_group: string(100)? ← nombre de cartera (agrupación)
├── created_at: datetime
└── closed_at: datetime?

Document (PDFs del profesor)
├── id: UUID
├── course_id: FK → Course
├── filename: string
├── file_path: string
├── uploaded_by: FK → User
├── processed: boolean
└── uploaded_at: datetime

Conversation
├── id: UUID
├── user_id: FK → User
└── created_at: datetime

Message
├── id: UUID
├── conversation_id: FK → Conversation
├── role: enum(user, assistant)
├── content: text
├── sources: JSON?  (referencias a chunks de PDFs)
└── created_at: datetime

IndicatorPreset
├── id: UUID
├── user_id: FK → User
├── name: string
├── indicators: JSON  ([{name, params}])
└── created_at: datetime

Strategy (Backtesting)
├── id: UUID
├── user_id: FK → User
├── name: string
├── description: string?
├── is_template: boolean              ← true para estrategias predefinidas
├── rules: JSON                       ← {entry, exit, risk_management}
├── created_at: datetime
└── updated_at: datetime

BacktestRun
├── id: UUID
├── user_id: FK → User
├── strategy_id: FK → Strategy
├── ticker: string
├── start_date: date
├── end_date: date
├── initial_capital: decimal
├── commission_pct: decimal
├── metrics: JSON                     ← {total_return, sharpe, max_drawdown, win_rate, profit_factor, ...}
├── equity_curve: JSON                ← [{date, equity}]
├── status: enum(running, completed, failed)
├── error_message: string?
├── created_at: datetime
└── completed_at: datetime?

BacktestTrade
├── id: UUID
├── run_id: FK → BacktestRun
├── type: enum(buy, sell)
├── entry_date: datetime
├── entry_price: decimal
├── exit_date: datetime?
├── exit_price: decimal?
├── quantity: decimal
├── pnl: decimal?
├── pnl_pct: decimal?
├── exit_reason: enum(signal, stop_loss, take_profit)
└── duration_days: integer?
```

---

## 6. Estructura de Directorios

```
analisis_bursatil_demo/
├── SPEC.md                          ← este documento
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py                  ← FastAPI app, CORS, routers
│   │   ├── config.py                ← settings (env vars)
│   │   ├── database.py              ← SQLAlchemy engine + session
│   │   ├── models/                  ← modelos SQLAlchemy
│   │   │   ├── user.py
│   │   │   ├── course.py
│   │   │   ├── portfolio.py
│   │   │   ├── order.py
│   │   │   ├── document.py
│   │   │   ├── conversation.py
│   │   │   ├── indicator_preset.py
│   │   │   ├── strategy.py
│   │   │   ├── backtest_run.py
│   │   │   └── backtest_trade.py
│   │   ├── schemas/                 ← Pydantic schemas (request/response)
│   │   ├── routers/                 ← endpoints por módulo
│   │   │   ├── auth.py
│   │   │   ├── market.py
│   │   │   ├── indicators.py
│   │   │   ├── demo.py
│   │   │   ├── tutor.py
│   │   │   └── backtest.py
│   │   ├── services/                ← lógica de negocio
│   │   │   ├── market_service.py
│   │   │   ├── indicator_service.py
│   │   │   ├── demo_service.py
│   │   │   ├── tutor_service.py
│   │   │   └── backtest_service.py  ← motor de backtesting
│   │   └── utils/
│   │       ├── auth.py              ← JWT, hashing
│   │       └── pdf_processor.py     ← extracción + chunking de PDFs
│   ├── tests/
│   └── uploads/                     ← PDFs subidos
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/                     ← funciones fetch al backend
│   │   ├── components/
│   │   │   ├── charts/              ← gráfico principal, indicadores
│   │   │   ├── indicators/          ← panel de selección de indicadores
│   │   │   ├── demo/                ← portfolio, órdenes
│   │   │   ├── tutor/               ← chat IA
│   │   │   ├── backtest/            ← constructor de estrategias, resultados
│   │   │   │   ├── StrategyBuilder.tsx    ← constructor visual de reglas
│   │   │   │   ├── ConditionRow.tsx       ← fila de condición (indicador + comparador + valor)
│   │   │   │   ├── BacktestResults.tsx    ← informe de resultados
│   │   │   │   ├── EquityCurve.tsx        ← gráfico de curva de equity
│   │   │   │   ├── TradesTable.tsx        ← tabla de operaciones
│   │   │   │   ├── MetricsCard.tsx        ← tarjeta de métricas
│   │   │   │   └── StrategyComparison.tsx ← comparación lado a lado
│   │   │   └── layout/              ← navbar, sidebar, footer
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Charts.tsx
│   │   │   ├── Demo.tsx
│   │   │   ├── Tutor.tsx
│   │   │   ├── Backtest.tsx          ← página principal de backtesting
│   │   │   ├── Login.tsx
│   │   │   └── Profile.tsx
│   │   ├── hooks/
│   │   ├── context/
│   │   ├── types/
│   │   └── utils/
│   └── public/
└── docker-compose.yml               ← desarrollo local
```

---

## 7. Stack Tecnológico Detallado

### Backend
| Componente | Tecnología | Versión |
|-----------|-----------|---------|
| Framework | FastAPI | 0.115+ |
| Datos bursátiles | yfinance | 0.2+ |
| Indicadores técnicos | pandas + numpy (nativo) | — |
| ORM | SQLAlchemy | 2.0+ |
| BD desarrollo | SQLite | — |
| BD producción | PostgreSQL | 16+ |
| Auth | python-jose (JWT) | — |
| RAG - Embeddings | sentence-transformers | — |
| RAG - Vector store | FAISS | — |
| RAG - LLM | LangChain + OpenAI / Anthropic | — |
| PDF parsing | pdfplumber | — |
| Validación | Pydantic | 2.0+ |

### Frontend
| Componente | Tecnología | Versión |
|-----------|-----------|---------|
| Framework | React | 18+ |
| Build tool | Vite | 5+ |
| Lenguaje | TypeScript | 5+ |
| Estilos | TailwindCSS | 3+ |
| Gráficos | Lightweight Charts (TradingView) | 4+ |
| Data fetching | TanStack Query (React Query) | 5+ |
| Routing | React Router | 6+ |
| Formularios | React Hook Form | — |
| Estado global | Zustand | — |

---

## 8. Reglas de Desarrollo

1. **Backend primero**: cada módulo se implementa backend → tests → frontend
2. **Cada endpoint tiene test**: mínimo un test por endpoint con `pytest` + `httpx`
3. **Tipado estricto**: TypeScript strict en frontend, type hints en backend
4. **Variables de entorno**: toda config sensible va en `.env` (nunca en código)
5. **Commits convencionales**: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`
6. **Sin datos falsos**: siempre datos reales de Yahoo Finance (o error explícito si no hay conexión)

---

## 9. Fases de Implementación

| Fase | Módulo | Estado | Entregable |
|------|--------|--------|------------|
| 1 | Schemas Pydantic | ✅ | Todos los schemas de request/response |
| 2 | Estructura + Auth | ✅ | Proyecto base, login/registro, JWT |
| 3 | Gráficos | ✅ | Candlestick interactivo, dibujos, patrones, intradiario, hora Madrid |
| 4 | Indicadores | ✅ | Catálogo 10 indicadores, panel configurable, osciladores sync |
| 5 | Modo Demo | ✅ | Paper trading: long/short, carteras, diversificación, multi-asset |
| 6 | Backtesting | ✅ | Motor completo, 6 templates, constructor visual, comparación |
| 7 | Tutor IA | ✅ | RAG con Ollama local, PDF upload, FAISS+keyword, historial |
| 8 | Frontend completo | ✅ | React 18, TW v4, LC v5, 7 páginas, screener 11 universos |
| 9 | Pulido | 🔄 | UI/UX, responsive, ranking, deploy |

---

## 10. Criterios de Aceptación Globales

- [x] Un estudiante puede buscar una acción, ver su gráfico de velas y activar indicadores
- [x] Un estudiante puede dibujar sobre el gráfico (trendlines, Fibonacci, Elliott, flechas, texto)
- [x] Un estudiante puede detectar patrones de velas (envolvente, marubozu, martillo, long line)
- [x] Un estudiante puede ver gráficos intradiarios con hora de Madrid
- [x] Un estudiante puede practicar compra/venta (long/short) con dinero ficticio y ver su rendimiento
- [x] Un estudiante puede crear carteras diversificadas desde el screener y gestionarlas en Paper Trading
- [x] Un estudiante puede filtrar activos por 11 universos (acciones, índices, divisas, materias primas) y 9 filtros
- [x] Un estudiante puede hacer preguntas y recibir respuestas basadas en los PDFs del profesor
- [x] Un estudiante puede ejecutar una estrategia predefinida sobre un ticker y ver el informe de resultados
- [x] Un estudiante puede construir su propia estrategia combinando indicadores, patrones de velas y condiciones sin escribir código
- [x] Un estudiante puede operar en largo (long) y en corto (short) en backtesting
- [x] Un estudiante puede seleccionar el timeframe (diario, horario, minutos, semanal) para backtesting
- [x] Un estudiante puede usar condiciones con offset temporal (evaluar N velas atrás)
- [x] Un estudiante puede usar stops dinámicos en fractales y gestión de riesgo por trade
- [x] Un estudiante puede seleccionar la banda de Bollinger (inferior/media/superior) en condiciones
- [x] Un estudiante puede comparar los resultados de distintas estrategias lado a lado
- [x] Un profesor puede subir PDFs y ver las preguntas frecuentes de sus alumnos
- [x] Los datos bursátiles son reales y actualizados (Yahoo Finance)
- [x] Precios forex/divisas se muestran con 5 decimales (no se truncan)
- [ ] La aplicación funciona correctamente en móvil (responsive)
- [ ] Ranking de estudiantes por rendimiento (gamificación)
- [ ] Deploy a producción
