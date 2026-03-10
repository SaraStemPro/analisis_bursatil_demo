Muestra el estado completo del proyecto:
1. Lee CLAUDE.md y SPEC.md
2. Lista todas las fases y su estado (completada / en progreso / pendiente)
3. Cuenta los endpoints implementados vs los definidos en SPEC.md (actualmente 42 rutas)
4. Lista los indicadores en el catálogo backend (indicator_service.py CATALOG)
5. Lista los patrones de velas en el catálogo frontend (patterns.ts PATTERN_CATALOG)
6. Lista las herramientas de dibujo disponibles (drawings.ts DrawingToolType)
7. Lista los universos del screener (market_service.py UNIVERSES) con número de tickers (11 universos)
8. Lista los filtros del screener (schemas/market.py ScreenerFilters) — 9 filtros
9. Verifica las páginas del frontend (App.tsx routes + Navbar.tsx NAV_ITEMS) — 7 rutas
10. Verifica si hay cambios sin commitear (git status)
11. Comprueba que el frontend compila (npx tsc --noEmit)
12. Resume qué falta por hacer en la Fase 9 (Pulido):
    - Responsive (móvil/tablet)
    - Ranking de estudiantes
    - Deploy a producción
13. Verifica que las skills (.claude/commands/) están actualizadas con el estado actual del código
