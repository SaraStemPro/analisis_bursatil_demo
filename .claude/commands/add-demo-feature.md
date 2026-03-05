Añade una nueva funcionalidad al Paper Trading (Demo). El usuario describirá qué quiere.

Arquitectura de Demo — archivos clave:
- `pages/Demo.tsx` — Página principal: portfolio overview, tabla posiciones, botón cerrar-todo, OrderForm
- `components/demo/OrderForm.tsx` — Formulario con buscador de tickers (TickerSearchInput) + botones Long/Short
- `components/demo/TickerSearchInput.tsx` — Autocompletado con market.search() + debounce 300ms
- `components/demo/ClosePositionDialog.tsx` — Modal cierre parcial/total con slider de cantidad
- `components/demo/PortfolioSummaryPanel.tsx` — Resumen: invertido, posiciones, diversity score, sectores
- `components/demo/OrderHistory.tsx` — Historial color-coded (buy=verde, sell=rojo, close=amber)

Backend:
- `backend/app/services/demo_service.py` — Lógica de órdenes (buy=LONG, sell=SHORT, close), portfolio, performance
- `backend/app/routers/demo.py` — Endpoints (portfolio, order, close-position, close-all, orders, performance, portfolio/summary, reset)
- `backend/app/schemas/demo.py` — Schemas Pydantic (OrderCreateRequest, ClosePositionRequest, PortfolioResponse, etc.)
- `backend/app/models/order.py` — Modelo SQLAlchemy con campo `side` (long/short)

Conceptos importantes:
- Un ticker puede tener LONG y SHORT simultáneamente (posiciones independientes)
- `_long_quantity()` / `_short_quantity()` calculan posiciones netas
- Short selling deduce margen 100% del balance (simplificación educativa)
- Diversity score = Shannon entropy normalizada (0-100)
- Sector de cada ticker viene de `yf.Ticker().info["sector"]` con cache en `_sector_cache`

Navegación cruzada:
- Charts → Demo: `navigate('/demo?buy=TICKER')`, Demo lee `?buy=` con useSearchParams
- Screener → Demo: mismo mecanismo via `?buy=`
- Demo → Charts: click en ticker de posición → `navigate('/charts?ticker=TICKER')`

Pasos generales:
1. Lee los archivos relevantes para entender el estado actual
2. Implementa backend primero si necesita nuevo endpoint (schema → service → router)
3. Actualiza frontend (tipos → API client → componente)
4. Verifica con `npx tsc --noEmit` y `npx vite build`
