Arranca el servidor backend en modo test (SQLite local) y ejecuta una verificación completa:
1. Usa DATABASE_URL=sqlite:///./test.db
2. Arranca uvicorn en un puerto libre
3. Prueba GET /api/health
4. Prueba GET /api/market/search?q=AAPL
5. Prueba GET /api/market/detailed-quote/AAPL
6. Prueba POST /api/market/screener con {"universe":"sp500"}
7. Prueba GET /api/market/screener/sectors/sp500
8. Prueba GET /api/indicators/catalog
9. Prueba GET /api/backtest/strategies/templates
10. Muestra un resumen de qué endpoints respondieron OK y cuáles fallaron
11. Para el servidor y elimina test.db
