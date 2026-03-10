Añade una nueva funcionalidad al módulo de backtesting. El usuario describirá qué quiere.

Archivos clave:
- `backend/app/schemas/common.py` — Enums: CandlePattern, StopLossType, StrategySide, Comparator, ConditionOperandType
- `backend/app/schemas/backtest.py` — ConditionOperand, Condition (con offset), StrategyRules (con side), RiskManagement, BacktestRunRequest (con interval)
- `backend/app/services/backtest_service.py` — TEMPLATES, motor de simulación (_simulate), detección de patrones (_detect_candle_patterns), evaluación de condiciones, cálculo de métricas
- `frontend/src/types/index.ts` — Tipos TypeScript mirror de los schemas
- `frontend/src/components/backtest/StrategyBuilder.tsx` — Constructor visual: INDICATORS, CANDLE_PATTERNS, BBANDS_BANDS, OperandEditor, ConditionEditor, risk management
- `frontend/src/pages/Backtest.tsx` — Página principal: OperandDisplay, inline editor, resultados, curva equity, tabla trades
- `frontend/src/api/index.ts` — backtest.run(), backtest.createStrategy(), etc.

Conceptos:
- **Operandos**: indicator (con params + band para BBANDS), price, volume, value, candle_pattern
- **Offset**: cada condición puede evaluarse N velas atrás
- **Side**: long o short (afecta PnL, stops, fractal direction)
- **Timeframe**: interval en BacktestRunRequest (1m, 5m, 15m, 1h, 4h, 1d, 1wk)
- **Warmup**: descarga datos extra antes del start_date para calentar indicadores
- **Fractal stop**: Long → fractal_down (soporte), Short → fractal_up (resistencia)
- **Risk sizing**: max_risk_pct limita pérdida por trade como % del capital

Pasos:
1. Lee los archivos relevantes según la funcionalidad pedida
2. Implementa backend (schemas + service) si aplica
3. Actualiza tipos TypeScript
4. Actualiza StrategyBuilder.tsx y/o Backtest.tsx
5. Verifica con `npx tsc --noEmit` y `npx vite build`
