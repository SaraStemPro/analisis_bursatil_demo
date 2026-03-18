# Skills del Proyecto — Guías de Implementación

Estas guías documentan la arquitectura del proyecto y los patrones para extender cada módulo.
Son usadas por Claude Code (via `.claude/commands/`) como contexto para implementar cambios.

## Índice

| Skill | Descripción | Módulo |
|-------|-------------|--------|
| [add-chart-feature](add-chart-feature.md) | Añadir funcionalidad a la página de gráficos | Charts |
| [add-drawing-tool](add-drawing-tool.md) | Añadir herramienta de dibujo al gráfico | Charts |
| [add-candle-pattern](add-candle-pattern.md) | Añadir patrón de velas japonesas | Charts |
| [add-indicator](add-indicator.md) | Añadir indicador técnico al catálogo | Indicadores |
| [add-demo-feature](add-demo-feature.md) | Añadir funcionalidad al Paper Trading | Demo |
| [add-screener-filter](add-screener-filter.md) | Añadir filtro al screener | Screener |
| [add-screener-universe](add-screener-universe.md) | Añadir universo de activos al screener | Screener |
| [add-backtest-feature](add-backtest-feature.md) | Añadir funcionalidad al backtesting | Backtest |
| [add-strategy-template](add-strategy-template.md) | Añadir estrategia predefinida | Backtest |
| [add-endpoint](add-endpoint.md) | Añadir endpoint al backend | Backend |
| [fix-ui](fix-ui.md) | Corregir problema visual/UX | Frontend |
| [make-responsive](make-responsive.md) | Adaptar para móvil/tablet | Frontend |
| [setup-supabase](setup-supabase.md) | Conectar con Supabase | Infra |
| [test-backend](test-backend.md) | Ejecutar tests del backend | Testing |
| [status](status.md) | Ver estado completo del proyecto | General |

## Arquitectura General

```
backend/
  app/
    routers/     ← Endpoints FastAPI (auth, market, indicators, demo, backtest, tutor)
    services/    ← Lógica de negocio
    schemas/     ← Validación Pydantic (fuente de verdad)
    models/      ← SQLAlchemy ORM (12 tablas + 7 vistas SQL)
    utils/       ← Auth (JWT), helpers
    config.py    ← Settings desde .env

frontend/
  src/
    pages/       ← 8 páginas (Dashboard, Charts, Demo, Screener, Backtest, Tutor, Admin, Profile)
    components/  ← Componentes reutilizables por módulo
    api/         ← Cliente HTTP (TanStack Query)
    types/       ← TypeScript strict
    lib/         ← Utilidades (drawings, patterns, chart utils, CFD utils)
    context/     ← Zustand stores
```

## Stack
- Backend: Python 3.12+ / FastAPI / SQLAlchemy 2.0 / yfinance / Supabase (PostgreSQL)
- Frontend: React 18 / TypeScript strict / Vite / TailwindCSS v4 / Lightweight Charts v5 / Recharts
- Auth: JWT (python-jose + bcrypt)
- Datos: Yahoo Finance (15min delay, con cache multinivel + request coalescing)
