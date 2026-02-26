Añade un nuevo endpoint al backend. El usuario especificará el módulo (auth, market, indicators, demo, backtest, tutor) y la funcionalidad.

Pasos:
1. Lee el router correspondiente en `backend/app/routers/{módulo}.py`
2. Lee el service correspondiente en `backend/app/services/{módulo}_service.py`
3. Si necesita nuevos schemas, lee `backend/app/schemas/{módulo}.py`
4. Implementa el schema (si es necesario), el service y el endpoint del router
5. Verifica que la app compila importando `app.main`
6. Actualiza CLAUDE.md con la nueva ruta
