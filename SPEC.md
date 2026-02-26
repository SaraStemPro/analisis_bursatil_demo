# Plataforma de Análisis Bursátil Educativa — Especificación (SDD)

> Versión: 1.0
> Fecha: 2026-02-26
> Autor: Spec Driven Development
> Estado: **BORRADOR — pendiente de aprobación**

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

**Objetivo**: Practicar compra/venta con dinero ficticio usando datos reales.

**Requisitos**:
- Saldo inicial configurable (por defecto: 100.000 €)
- Operaciones: Comprar, Vender, Stop-Loss, Take-Profit
- Portfolio virtual con posiciones abiertas y cerradas
- Historial de operaciones con P&L (Profit & Loss)
- Métricas de rendimiento: rentabilidad total, ratio Sharpe, max drawdown
- Ranking opcional entre estudiantes del mismo curso (gamificación)

**Endpoints**:
```
GET    /api/demo/portfolio                → portfolio actual del usuario
POST   /api/demo/order                    → crear orden {ticker, type, quantity, price?, stop_loss?, take_profit?}
GET    /api/demo/orders                   → historial de órdenes
GET    /api/demo/performance              → métricas de rendimiento
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
POST /api/tutor/documents                → subir PDF (solo profesor)
GET  /api/tutor/documents                → listar PDFs subidos
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

Interfaz visual donde el alumno define su propia estrategia sin escribir código, combinando indicadores del catálogo (módulo 4.2) con condiciones lógicas.

**Estructura de una estrategia**:
```
Estrategia
├── Nombre y descripción
├── Condiciones de ENTRADA (cuándo comprar)
│   ├── Condición 1: [Indicador] [Comparador] [Valor o Indicador]
│   ├── Condición 2: ...
│   └── Operador lógico entre condiciones: AND / OR
├── Condiciones de SALIDA (cuándo vender)
│   ├── Condición 1: [Indicador] [Comparador] [Valor o Indicador]
│   ├── Condición 2: ...
│   └── Operador lógico entre condiciones: AND / OR
└── Gestión de riesgo
    ├── Stop-Loss: % máximo de pérdida por operación
    ├── Take-Profit: % objetivo de ganancia por operación
    └── Tamaño de posición: % del capital por operación
```

**Tipos de comparadores disponibles**:

| Comparador | Ejemplo |
|-----------|---------|
| `mayor_que` | RSI(14) > 70 |
| `menor_que` | RSI(14) < 30 |
| `cruza_por_encima` | Precio cruza por encima de EMA(20) |
| `cruza_por_debajo` | SMA(50) cruza por debajo de SMA(200) |
| `entre` | RSI(14) entre 40 y 60 |
| `fuera_de` | Precio fuera de Bandas de Bollinger |

**Elementos referenciables en condiciones**:
- Cualquier indicador del catálogo (4.2) con sus parámetros
- Precio: apertura, cierre, máximo, mínimo
- Volumen

**Formato JSON de una estrategia** (cómo se almacena):
```json
{
  "entry": {
    "operator": "AND",
    "conditions": [
      {
        "left": {"type": "indicator", "name": "RSI", "params": {"period": 14}},
        "comparator": "less_than",
        "right": {"type": "value", "value": 30}
      },
      {
        "left": {"type": "price", "field": "close"},
        "comparator": "crosses_above",
        "right": {"type": "indicator", "name": "EMA", "params": {"period": 20}}
      }
    ]
  },
  "exit": {
    "operator": "OR",
    "conditions": [
      {
        "left": {"type": "indicator", "name": "RSI", "params": {"period": 14}},
        "comparator": "greater_than",
        "right": {"type": "value", "value": 70}
      }
    ]
  },
  "risk_management": {
    "stop_loss_pct": 5.0,
    "take_profit_pct": 10.0,
    "position_size_pct": 10.0
  }
}
```

#### 4.6.3 Ejecución y Resultados (Evaluar)

Al ejecutar un backtest, el sistema procesa la estrategia contra los datos históricos del ticker seleccionado y genera un informe completo.

**Parámetros de ejecución**:
- Ticker (o lista de tickers para probar en varios activos)
- Rango de fechas (inicio y fin)
- Capital inicial (por defecto: 100.000 €, coherente con el modo demo)
- Comisión por operación (configurable, por defecto: 0.1%)

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
POST   /api/backtest/run                      → ejecutar backtest {strategy_id, ticker, start_date, end_date, initial_capital, commission_pct}
GET    /api/backtest/runs                     → historial de backtests del usuario
GET    /api/backtest/runs/{id}               → resultado completo de un backtest (métricas + trades)
GET    /api/backtest/runs/{id}/trades        → lista de operaciones del backtest
DELETE /api/backtest/runs/{id}               → eliminar resultado de backtest

# Comparación
POST   /api/backtest/compare                  → comparar backtests {run_ids: [id1, id2, id3]} → métricas lado a lado
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
├── type: enum(buy, sell)
├── quantity: integer
├── price: decimal
├── stop_loss: decimal?
├── take_profit: decimal?
├── status: enum(open, closed, cancelled)
├── pnl: decimal?
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
| Indicadores técnicos | pandas-ta | 0.3+ |
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

| Fase | Módulo | Entregable |
|------|--------|------------|
| 1 | Estructura + Auth | Proyecto base, login/registro, JWT |
| 2 | Gráficos | Candlestick interactivo con datos de yfinance |
| 3 | Indicadores | Catálogo completo con panel configurable |
| 4 | Modo Demo | Paper trading con portfolio virtual |
| 5 | Backtesting | Motor de backtesting, constructor visual, estrategias predefinidas |
| 6 | Tutor IA | RAG sobre PDFs, chat funcional, integración con backtesting |
| 7 | Pulido | UI/UX, ranking, preguntas frecuentes, deploy |

---

## 10. Criterios de Aceptación Globales

- [ ] Un estudiante puede buscar una acción, ver su gráfico de velas y activar indicadores
- [ ] Un estudiante puede practicar compra/venta con dinero ficticio y ver su rendimiento
- [ ] Un estudiante puede hacer preguntas y recibir respuestas basadas en los PDFs del profesor
- [ ] Un estudiante puede ejecutar una estrategia predefinida sobre un ticker y ver el informe de resultados
- [ ] Un estudiante puede construir su propia estrategia combinando indicadores y condiciones sin escribir código
- [ ] Un estudiante puede comparar los resultados de distintas estrategias lado a lado
- [ ] Un estudiante puede pedir al tutor IA que interprete los resultados de su backtest
- [ ] Un profesor puede subir PDFs y ver las preguntas frecuentes de sus alumnos
- [ ] La aplicación funciona en móvil y escritorio (responsive)
- [ ] Los datos bursátiles son reales y actualizados (Yahoo Finance)
