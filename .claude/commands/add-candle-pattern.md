Añade un nuevo patrón de velas japonesas al detector. El usuario especificará qué patrón quiere detectar.

Pasos:
1. Lee `frontend/src/lib/patterns.ts` — las funciones detect* existentes y el tipo PatternMatch
2. Añade el nuevo tipo al union type de PatternMatch
3. Implementa la función de detección siguiendo el patrón existente (detectEngulfing, detectMarubozu, detectLongLine)
4. Usa etiquetas cortas (2-3 letras) para el label del patrón (ej: EA, EB, MA, MB, LLA, LLB)
5. Bullish → color '#10b981', position 'belowBar'. Bearish → color '#ef4444', position 'aboveBar'
6. Añade la nueva función al array de `detectPatterns()`
7. Actualiza el texto descriptivo en el botón de patrones en `frontend/src/pages/Charts.tsx`
8. Verifica que compila con `npx tsc --noEmit`
