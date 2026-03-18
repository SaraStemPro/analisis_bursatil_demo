Añade una nueva herramienta de dibujo al gráfico. El usuario describirá qué herramienta quiere.

Pasos:
1. Lee `frontend/src/types/drawings.ts` — los tipos Drawing, DrawingToolType, requiredPoints
2. Añade el nuevo tipo al union DrawingToolType y crea su interfaz (extends BaseDrawing con `chartId?: string`)
3. Actualiza requiredPoints() con el número de clicks necesarios (null = variable, termina con doble-click)
4. Crea el primitive en `frontend/src/lib/drawings/primitives/{NuevaTool}Primitive.ts`:
   - Implementa ISeriesPrimitive<Time> (attached, detached, updateAllViews, paneViews, hitTest)
   - Usa los helpers de `renderers.ts` (drawLine, drawArrow, drawText, drawCircle, drawFilledRect)
   - NO usar constructor parameter properties (erasableSyntaxOnly activo)
   - hitTest debe devolver el drawing.id para que la selección funcione
5. Registra el primitive en `frontend/src/lib/drawings/DrawingManager.ts` → _createPrimitive + AnyPrimitive type
   - IMPORTANTE: DrawingManager compara por referencia para detectar cambios de color/posición. Si `drawing` cambia, recrea la primitiva (detach + reattach). No necesitas manejar esto manualmente.
6. Añade soporte de preview en `frontend/src/lib/drawings/primitives/PreviewPrimitive.ts`
7. Añade el botón en `frontend/src/components/charts/DrawingToolbar.tsx` (array TOOLS + GUIDANCE)
8. Añade el case en finalizeDrawing() de `frontend/src/pages/Charts.tsx` Y de `frontend/src/components/charts/OscillatorChart.tsx`
   - Ambos archivos tienen su propio finalizeDrawing. Incluir `chartId` en el drawing creado.
   - Charts.tsx usa `chartId: 'main'`, OscillatorChart usa el prop `chartId`
   - Los callbacks de click usan refs estables (handleChartClickRef) para evitar recrear el chart
9. Si la herramienta necesita estado extra (como dirección de flecha), añádelo al Zustand store en `context/drawing-store.ts`
10. Verifica que compila con `npx tsc --noEmit`
