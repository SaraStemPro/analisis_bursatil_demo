Añade un nuevo filtro al screener. El usuario especificará qué métrica quiere filtrar.

Pasos:
1. Verifica que el dato está disponible en yfinance: `yf.Ticker("AAPL").info` — busca la clave correspondiente
2. Si el dato NO está en DetailedQuoteResponse, añádelo:
   - `backend/app/schemas/market.py` → DetailedQuoteResponse (campo optional float | None)
   - `backend/app/services/market_service.py` → `_info_to_detailed_quote()` — mapea la clave de yfinance
   - `frontend/src/types/index.ts` → DetailedQuote interface
3. Añade el filtro al schema backend: `backend/app/schemas/market.py` → ScreenerFilters (campo_min/campo_max)
4. Añade la lógica de filtrado: `backend/app/services/market_service.py` → `_apply_filters()`
   - Para porcentajes que vienen de yfinance como decimales (0.03 = 3%), dividir el input del usuario entre 100
5. Añade el filtro al tipo frontend: `frontend/src/types/index.ts` → ScreenerFilters
6. Añade el state + inputs UI en `frontend/src/pages/Screener.tsx`:
   - useState para min/max
   - Inputs en el panel de filtros (entre los existentes, orden lógico)
   - Añadir al useMemo de `filters`
   - Añadir al array de dependencias del useMemo
   - Añadir al reset de "Limpiar filtros"
7. Opcionalmente, añade la columna a la tabla del screener (SortHeader + td)
8. Verifica con `npx tsc --noEmit`
