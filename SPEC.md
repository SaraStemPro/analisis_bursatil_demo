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
│   │   │   └── indicator_preset.py
│   │   ├── schemas/                 ← Pydantic schemas (request/response)
│   │   ├── routers/                 ← endpoints por módulo
│   │   │   ├── auth.py
│   │   │   ├── market.py
│   │   │   ├── indicators.py
│   │   │   ├── demo.py
│   │   │   └── tutor.py
│   │   ├── services/                ← lógica de negocio
│   │   │   ├── market_service.py
│   │   │   ├── indicator_service.py
│   │   │   ├── demo_service.py
│   │   │   └── tutor_service.py
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
│   │   │   └── layout/              ← navbar, sidebar, footer
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Charts.tsx
│   │   │   ├── Demo.tsx
│   │   │   ├── Tutor.tsx
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
| 5 | Tutor IA | RAG sobre PDFs, chat funcional |
| 6 | Pulido | UI/UX, ranking, preguntas frecuentes, deploy |

---

## 10. Criterios de Aceptación Globales

- [ ] Un estudiante puede buscar una acción, ver su gráfico de velas y activar indicadores
- [ ] Un estudiante puede practicar compra/venta con dinero ficticio y ver su rendimiento
- [ ] Un estudiante puede hacer preguntas y recibir respuestas basadas en los PDFs del profesor
- [ ] Un profesor puede subir PDFs y ver las preguntas frecuentes de sus alumnos
- [ ] La aplicación funciona en móvil y escritorio (responsive)
- [ ] Los datos bursátiles son reales y actualizados (Yahoo Finance)
