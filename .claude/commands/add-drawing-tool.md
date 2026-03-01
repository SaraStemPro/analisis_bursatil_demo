Añade una nueva herramienta de dibujo al gráfico. El usuario describirá qué herramienta quiere.

Pasos:
1. Lee `frontend/src/types/drawings.ts` — los tipos Drawing, DrawingToolType, requiredPoints
2. Añade el nuevo tipo al union DrawingToolType y crea su interfaz (extends BaseDrawing)
3. Actualiza requiredPoints() con el número de clicks necesarios
4. Crea el primitive en `frontend/src/lib/drawings/primitives/{NuevaTool}Primitive.ts`:
   - Implementa ISeriesPrimitive<Time> (attached, detached, updateAllViews, paneViews, hitTest)
   - Usa los helpers de `renderers.ts` (drawLine, drawArrow, drawText, drawCircle, etc.)
   - NO usar constructor parameter properties (erasableSyntaxOnly activo)
5. Registra el primitive en `frontend/src/lib/drawings/DrawingManager.ts` → _createPrimitive
6. Añade soporte de preview en `frontend/src/lib/drawings/primitives/PreviewPrimitive.ts`
7. Añade el botón en `frontend/src/components/charts/DrawingToolbar.tsx`
8. Añade el case en finalizeDrawing() de `frontend/src/pages/Charts.tsx`
9. Verifica que compila con `npx tsc --noEmit`
