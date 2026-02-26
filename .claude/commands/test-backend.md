Arranca el servidor backend en modo test (SQLite local) y ejecuta una verificación completa:
1. Usa DATABASE_URL=sqlite:///./test.db
2. Arranca uvicorn en un puerto libre
3. Prueba GET /api/health
4. Prueba GET /api/market/search?q=AAPL
5. Prueba GET /api/indicators/catalog
6. Prueba GET /api/backtest/strategies/templates
7. Muestra un resumen de qué endpoints respondieron OK y cuáles fallaron
8. Para el servidor y elimina test.db
