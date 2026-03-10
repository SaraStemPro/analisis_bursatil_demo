Añade una nueva funcionalidad a la página de gráficos (Charts). El usuario describirá qué quiere.

Arquitectura de Charts — archivos clave:
- `pages/Charts.tsx` — Página principal: chart de velas, state global, indicadores, patrones, marcadores
- `components/charts/OscillatorChart.tsx` — Un chart independiente por cada oscilador (RSI, MACD, etc.)
- `components/charts/DrawingToolbar.tsx` — Toolbar lateral de herramientas de dibujo + color picker
- `context/drawing-store.ts` — Zustand store: dibujos, herramientas, selección, activeChartId
- `lib/chartUtils.ts` — CHART_THEME, toChartTime() (con hora Madrid), INDICATOR_COLORS, getMadridOffsetSec()
- `lib/patterns.ts` — Detección de patrones de velas (client-side)
- `lib/recentTickers.ts` — localStorage para 5 tickers recientes

Formato inteligente de precios (ya implementado en Charts.tsx):
- `fmtPrice(val)`: 5 decimales si <10 (forex), 4 si <100, 2 si >=100
- `fmtChange(val, refPrice)`: misma lógica, basada en precio de referencia
- `getPriceFormat(price)`: devuelve `{precision, minMove}` para configurar ejes del chart
- Se aplica en: eje Y del candlestick, cabecera de quote, valores de indicadores

Zona horaria:
- Eje X intradiario ajustado a hora de Madrid (Europe/Madrid) via `getMadridOffsetSec()`
- Charts diarios+ no se ven afectados (solo muestran fecha)

Patrones importantes a respetar:
1. **Sync de osciladores**: Usa LogicalRange + shared `isSyncingRef` + `oscChartsRef` (Map de chart instances). Cada oscilador tiene una serie spacer invisible que alinea los índices lógicos. NUNCA usar React state para sincronizar rangos (causa loops infinitos).
2. **Dibujos**: `activeChartId` determina qué chart recibe clics. Tanto Charts.tsx como OscillatorChart.tsx tienen su propio `finalizeDrawing` y `DrawingManager`. Las primitivas se recrean al detectar cambio por referencia.
3. **Event handlers del chart**: Usar refs estables (`handleChartClickRef`) para evitar recrear el chart cuando cambia el state. Los callbacks reales se actualizan vía useEffect.
4. **Preservación de escala**: `savedRangeRef` + `isFirstLoadRef` guardan el zoom del usuario al cambiar indicadores. Solo se hace `fitContent()` en la primera carga o al cambiar ticker/periodo/intervalo.
5. **Marcadores**: Patrones + fractales van en un array `allMarkers` unificado, ordenado por tiempo, con un solo `createSeriesMarkers`.

Pasos generales:
1. Lee Charts.tsx y los archivos relevantes para entender el estado actual
2. Identifica si el cambio afecta al main chart, osciladores, o ambos
3. Si añades state, considera si debe ser React state (UI) o ref (sync/chart API)
4. Si tocas el useEffect del chart, NO añadir dependencias innecesarias (causa recreación)
5. Verifica con `npx tsc --noEmit` y `npx vite build`
