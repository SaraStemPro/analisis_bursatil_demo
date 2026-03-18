Añade una nueva estrategia predefinida (template) al catálogo de backtesting. El usuario describirá la estrategia en lenguaje natural.

Pasos:
1. Lee `backend/app/services/backtest_service.py` — la lista TEMPLATES
2. Traduce la descripción del usuario a condiciones JSON:
   - Comparadores: greater_than, less_than, crosses_above, crosses_below, between, outside
   - Operandos: indicator (SMA, EMA, RSI, MACD, BBANDS, STOCH, ATR, OBV, FRACTALS), price, volume, value, candle_pattern
   - BBANDS: incluir `"band": "lower|mid|upper"` en params
   - Patrones de vela: bullish_engulfing, bearish_engulfing, bullish_hammer, bearish_hammer, bullish_marubozu, bearish_marubozu, bullish_long_line, bearish_long_line
   - Offset: `"offset": N` para evaluar N velas atrás
3. Define el side: `"side": "long"` o `"side": "short"`
4. Configura risk_management: stop_loss_pct, stop_loss_type (fixed|fractal), take_profit_pct, position_size_pct, max_risk_pct
5. Añade la estrategia a TEMPLATES con name, description y rules
6. Verifica que compila con `python3 -c "import ast; ast.parse(...)"`
7. Muestra la estrategia en formato legible
