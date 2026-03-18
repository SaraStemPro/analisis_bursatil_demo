Añade un nuevo endpoint al backend. El usuario especificará el módulo (auth, market, indicators, demo, backtest, tutor) y la funcionalidad.

Actualmente hay 44 rutas implementadas. Ver lista completa en CLAUDE.md sección "API".

Pasos:
1. Lee el router correspondiente en `backend/app/routers/{módulo}.py`
2. Lee el service correspondiente en `backend/app/services/{módulo}_service.py`
3. Si necesita nuevos schemas, lee `backend/app/schemas/{módulo}.py`
4. Implementa el schema (si es necesario), el service y el endpoint del router
5. Para endpoints restringidos por rol, usar `require_role("professor", "admin")` de `utils/auth.py`
6. Verifica que la app compila importando `app.main`
7. Actualiza CLAUDE.md con la nueva ruta (actualizar contador y lista)
