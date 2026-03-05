Añade un nuevo universo (mercado/sector) al screener. El usuario especificará qué grupo de acciones quiere añadir.

Pasos:
1. Lee `backend/app/services/market_service.py` — las listas de tickers y el dict UNIVERSES
2. Crea una nueva lista de tickers (ej: `CRYPTO_TICKERS`, `REIT_TICKERS`, `LATAM_TICKERS`)
   - Usa tickers válidos de Yahoo Finance
   - 15-40 tickers es un buen rango (más = más tiempo de carga)
3. Añade la nueva lista al dict UNIVERSES con su clave (ej: "crypto", "reit", "latam")
4. Añade la nueva clave al set "all" del dict UNIVERSES (usa `set()` para deduplicar)
5. Actualiza la regex del schema: `backend/app/schemas/market.py` → ScreenerFilters.universe pattern
6. Actualiza el tipo en frontend: `frontend/src/types/index.ts` → ScreenerFilters.universe union type
7. Añade el botón en `frontend/src/pages/Screener.tsx` → array UNIVERSE_OPTIONS con key y label en español
8. Verifica con `npx tsc --noEmit` en el frontend
9. Reiniciar backend para que tome los cambios

Nota: El screener cachea los resultados por universo durante 5 min. La primera carga de un universo nuevo tarda más (fetcha info de cada ticker via yfinance).
