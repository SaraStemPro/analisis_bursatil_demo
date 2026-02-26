Añade un nuevo indicador técnico al catálogo de la aplicación. El usuario especificará el nombre del indicador.

Pasos:
1. Lee `backend/app/services/indicator_service.py` — la lista CATALOG y la función `_compute_indicator`
2. Añade la definición del indicador a CATALOG con sus parámetros
3. Añade el cálculo en `_compute_indicator` usando pandas-ta
4. Si el indicador es nuevo para el backtesting, verifica que funciona en `backtest_service.py` → `_compute_all_indicators`
5. Verifica que compila importando el módulo
6. Muestra el indicador añadido y sus parámetros configurables
