# Plataforma de Analisis Bursatil

Plataforma web educativa para estudiantes de Master que permite practicar analisis tecnico bursatil con datos reales.

**URL**: [plataforma-trading.sarastem.com](https://plataforma-trading.sarastem.com)

## Funcionalidades

### Graficos interactivos
- Graficos de velas con datos reales de Yahoo Finance
- 10 indicadores tecnicos: SMA, EMA, MACD, RSI, Estocastico, Bandas de Bollinger, ATR, OBV, VWAP, Fractales
- 7 herramientas de dibujo: linea de tendencia, flecha, texto, Fibonacci, ondas de Elliott, linea horizontal, linea vertical
- Deteccion automatica de 6 patrones de velas: Envolvente (EA/EB), Vela 20/20 (V20A/V20B), Martillo (MaA/MaB)
- Soporte intradiario (1m, 5m, 15m, 1h) con hora de Madrid

### Paper Trading (simulador)
- Operaciones Long y Short con dinero virtual (100.000 inicial)
- Posiciones simultaneas long/short en el mismo ticker
- Sistema de carteras nombradas con diversity score
- Diario de Trading para justificar cada operacion
- Ranking de estudiantes por rendimiento

### Backtesting
- 6 plantillas predefinidas (Cruce Dorado, RSI, MACD, etc.)
- Constructor visual de estrategias personalizadas
- Soporte para long, short y modo combinado (both)
- Patrones de velas como condiciones de entrada/salida
- Stop loss fijo y fractal, take profit configurable
- Multiples timeframes (1m a semanal)

### Stock Screener
- 11 universos: S&P 500, IBEX 35, Tech, Healthcare, Finance, Energy, Industrials, Consumer, Indices, Divisas, Materias Primas
- 9 filtros: Precio, Cambio%, Sector, Market Cap, P/E, Dividendo%, Beta, ROE, Volatilidad
- Simulador de portfolio con diversity score
- Compra directa de carteras simuladas

### Tutor IA
- Chat basado en los apuntes del profesor (RAG con FAISS)
- Cita automatica de fuentes (documento y pagina)
- Historial de conversaciones
- Subida de PDFs por el profesor
- LLM local con Ollama (sin coste)

## Stack

### Backend
- Python 3.12, FastAPI, SQLAlchemy 2.0
- PostgreSQL (Supabase) / SQLite (desarrollo)
- JWT auth, yfinance, FAISS + sentence-transformers

### Frontend
- React 18, TypeScript strict, Vite 5
- TailwindCSS, Lightweight Charts (TradingView)
- TanStack Query, React Router, Zustand

## Estructura del proyecto

```
backend/
  app/
    routers/        # Endpoints FastAPI (auth, market, indicators, demo, backtest, tutor)
    services/       # Logica de negocio
    models/         # Modelos SQLAlchemy
    schemas/        # Schemas Pydantic (validacion)
    utils/          # Procesamiento PDF

frontend/
  src/
    pages/          # Paginas principales (Charts, Demo, Backtest, Screener, Tutor, Dashboard)
    components/     # Componentes reutilizables
    lib/            # Utilidades (dibujos, patrones, chart utils)
    api/            # Cliente HTTP
    types/          # Tipos TypeScript

deploy/
  setup.sh          # Script de despliegue automatizado
  DEPLOY.md         # Guia de despliegue
```

## Patrones de velas

| Codigo | Nombre | Descripcion |
|--------|--------|-------------|
| EA | Envolvente Alcista | La vela alcista envuelve el cuerpo de la bajista anterior |
| EB | Envolvente Bajista | La vela bajista envuelve el cuerpo de la alcista anterior |
| V20A | Vela 20/20 Alcista | Vela alcista con cuerpo grande (marubozu + long line) |
| V20B | Vela 20/20 Bajista | Vela bajista con cuerpo grande (marubozu + long line) |
| MaA | Martillo Alcista | Cuerpo pequeno arriba, sombra inferior larga |
| MaB | Martillo Bajista | Cuerpo pequeno abajo, sombra superior larga |

## Desarrollo local

```bash
# Backend
cd backend && pip install -e ".[dev]"
uvicorn app.main:app --reload

# Frontend
cd frontend && npm install
npm run dev
```

## Despliegue

Ver [deploy/DEPLOY.md](deploy/DEPLOY.md) para la guia completa de despliegue en VPS.

## Usuarios demo

| Rol | Email | Password |
|-----|-------|----------|
| Profesor | profesor@demo.com | Demo1234 |
| Alumna | sara@demo.com | Demo1234 |

Codigo de invitacion: `AB_2026`
