Añade un nuevo indicador técnico al catálogo de la aplicación. El usuario especificará el nombre del indicador.

Pasos:
1. Lee `backend/app/services/indicator_service.py` — la lista CATALOG y la función `_compute_indicator`
2. Añade la definición del indicador a CATALOG con sus parámetros (IndicatorDefinition + IndicatorParam)
   - `overlay=True` para indicadores que se dibujan sobre las velas (SMA, EMA, BBANDS, FRACTALS)
   - `overlay=False` para osciladores que van en ventana separada (RSI, MACD, STOCH, ATR, OBV)
3. Implementa la función de cálculo `_nombre()` usando pandas/numpy (NO usamos pandas-ta, los cálculos son nativos)
4. Añade el case en `_compute_indicator` llamando a la nueva función y usando `_series_to_list()` para convertir
5. Si el indicador es para el backtesting, verifica que funciona en `backtest_service.py` → `_compute_all_indicators`
6. Verifica que compila importando el módulo

Renderizado en frontend:
- Overlay (overlay=True): se renderizan automáticamente como LineSeries en el chart principal
- Oscilador (overlay=False): se renderizan automáticamente en OscillatorChart separado
- EXCEPCIÓN: Si el indicador overlay tiene datos dispersos (muchos None, como FRACTALS), debe renderizarse como marcadores en vez de líneas. En ese caso, añadir lógica especial en Charts.tsx:
  1. Excluir de la renderización overlay normal: `if (ind.name === 'NUEVO') return`
  2. Añadir al bloque de marcadores (junto a patterns y fractals) usando `createSeriesMarkers`
  3. Los marcadores van en el array `allMarkers` que se ordena por tiempo y se añade al final

7. Muestra el indicador añadido y sus parámetros configurables
