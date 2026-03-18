Añade un nuevo patrón de velas japonesas al detector. El usuario especificará qué patrón quiere detectar.

Pasos:
1. Lee `frontend/src/lib/patterns.ts` — las funciones detect* existentes, el tipo PatternMatch, y PATTERN_CATALOG
2. Añade el nuevo tipo al union type PatternType (ej: 'hammer_bull' | 'hammer_bear')
3. Implementa la función de detección siguiendo el patrón existente (detectEngulfing, detectMarubozu, detectLongLine, detectHammer)
4. Usa etiquetas cortas (2-3 letras) para el label del patrón (ej: EA, EB, MA, MB, LLA, LLB, MaA, MaB)
5. Bullish → color '#10b981', position 'belowBar'. Bearish → color '#ef4444', position 'aboveBar'
6. Añade la nueva función al array de `detectPatterns()`
7. Añade una entrada a `PATTERN_CATALOG` con type, label y description (se muestra como checkbox en el selector)
8. Verifica que compila con `npx tsc --noEmit`

Nota: Los patrones se renderizan como marcadores (createSeriesMarkers) en Charts.tsx. El selector de patrones es un panel de checkboxes controlado por `activePatterns: Set<PatternType>` — no necesitas tocar Charts.tsx si solo añades al catálogo.
