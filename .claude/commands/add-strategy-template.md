Añade una nueva estrategia predefinida (template) al catálogo de backtesting. El usuario describirá la estrategia en lenguaje natural.

Pasos:
1. Lee `backend/app/services/backtest_service.py` — la lista TEMPLATES
2. Traduce la descripción del usuario a condiciones JSON usando los comparadores disponibles (greater_than, less_than, crosses_above, crosses_below, between, outside) y los indicadores del catálogo
3. Añade la estrategia a TEMPLATES con name, description y rules (entry, exit, risk_management)
4. Verifica que compila
5. Muestra la estrategia en formato legible
