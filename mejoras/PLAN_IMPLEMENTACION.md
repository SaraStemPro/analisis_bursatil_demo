# Análisis de correlación en el Screener — Plan de implementación

## Por qué esta feature

Tu plataforma ya tiene un **diversity score (Shannon entropy + penalizaciones por nº posiciones, sectores y concentración)**. Es una buena métrica, pero tiene un agujero pedagógico: **cuenta variedad de etiquetas, no comportamiento real**.

Una cartera con 5 acciones tech del S&P 500 puede tener un Shannon "aceptable" pero correlación interna de 0,85. El alumno cree que está diversificado y no lo está.

Añadir **análisis de correlación basado en retornos reales de Yahoo Finance** captura exactamente esa parte que falta. Conecta directamente con todo lo que enseñas en el bloque 3 de Diversificación y Gestión Monetaria.

## Métricas que añadimos

| Métrica | Qué mide | Cuándo se enciende la alarma |
|---|---|---|
| **Correlación media** | Promedio de los pares off-diagonal de la matriz | > 0,75 → diversificación falsa |
| **Diversification Ratio** | σ(media ponderada) / σ(cartera) | < 1,1 → casi nula |
| **Volatilidad de cartera anualizada** | σ real con la fórmula completa σ²ₚ = w' Σ w | comparar con weighted_avg |
| **Par más correlacionado** | Tickers con ρ máximo | > 0,9 → uno sobra |
| **Par menos correlacionado** | Tickers con ρ mínimo | la "joya" diversificadora |
| **Riesgo evitado %** | (σ_avg − σ_p) / σ_avg | < 5 % → no estás ganando nada |

## Stack — sigue tu CLAUDE.md exactamente

- **Backend**: FastAPI + Pydantic 2 + numpy/pandas (sin pandas-ta) + yfinance batch download
- **Cache**: TTL 1h por (sorted_tickers, period). Coherente con tu patrón `_QUOTE_TTL`/`_HISTORY_TTL`
- **Frontend**: React 18 + TS strict + TailwindCSS + TanStack Query (mutation, no auto-fetch)
- **Sin libs nuevas**: heatmap es un `<table>` con celdas coloreadas por gradient

---

## Archivos a crear/modificar

### Backend

```
backend/app/schemas/market.py              [MODIFICAR — añadir 3 schemas]
backend/app/schemas/__init__.py            [MODIFICAR — re-exportar]
backend/app/services/market_service.py     [MODIFICAR — añadir función + cache]
backend/app/routers/market.py              [MODIFICAR — añadir endpoint POST]
backend/tests/test_correlation.py          [NUEVO]
```

### Frontend

```
frontend/src/hooks/useCorrelation.ts                          [NUEVO]
frontend/src/lib/correlationInterpretation.ts                  [NUEVO]
frontend/src/components/screener/CorrelationHeatmap.tsx        [NUEVO]
frontend/src/components/screener/CorrelationPanel.tsx          [NUEVO]
frontend/src/pages/Screener.tsx                                [MODIFICAR]
```

---

## Pasos de implementación (en orden)

### 1. Backend — añadir schemas

Copia el contenido de `schemas/market_correlation.py` al final de tu `backend/app/schemas/market.py`.

Re-exporta en `schemas/__init__.py`:

```python
from .market import (
    # ... lo que ya tienes ...
    CorrelationRequest,
    CorrelationResponse,
    CorrelationPair,
)
```

### 2. Backend — añadir service

Copia el contenido de `services/correlation_service.py` al final de tu `backend/app/services/market_service.py`.

Asegúrate de que estos imports estén al principio del archivo (probablemente ya estén):

```python
import numpy as np
import pandas as pd
import yfinance as yf
import threading
import time
```

### 3. Backend — añadir endpoint

Copia el endpoint de `routers/market_correlation_route.py` a tu `backend/app/routers/market.py`, dentro del router existente.

### 4. Backend — tests

Copia `test_correlation.py` a `backend/tests/`. Los tests asumen que tienes el fixture `authenticated_client` (cliente httpx con JWT válido). Si tu fixture se llama distinto, ajusta los nombres.

```bash
pytest backend/tests/test_correlation.py -v
```

### 5. Frontend — copiar archivos

```
frontend/src/hooks/useCorrelation.ts
frontend/src/lib/correlationInterpretation.ts
frontend/src/components/screener/CorrelationHeatmap.tsx
frontend/src/components/screener/CorrelationPanel.tsx
```

### 6. Frontend — integrar en Screener.tsx

En `pages/Screener.tsx`, justo debajo del simulador de portfolio actual (donde calculas el diversity score), añade:

```tsx
import { CorrelationPanel } from "@/components/screener/CorrelationPanel";

// Dentro del componente Screener, donde tienes el simulador:
{simulatedTickers.length >= 2 && (
  <CorrelationPanel
    tickers={simulatedTickers}                // string[]
    weights={simulatedQuantities}             // number[] opcional (cantidades o pesos)
  />
)}
```

`simulatedTickers` debe ser el array de tickers que el alumno ha añadido al simulador. Si las cantidades son nº de acciones, pásalas tal cual: el backend las normaliza (no hace falta convertir a porcentajes en frontend).

---

## Comportamiento UX

1. El alumno selecciona activos en el simulador del screener (ya lo hace).
2. Aparece automáticamente el panel "Análisis de correlación" con un botón **"Calcular correlación"**.
3. Al hacer clic, llamada a `POST /api/market/correlation`.
4. Aparecen:
   - 4 KPIs grandes con colores semafóricos
   - 2 cajas de diagnóstico ("Excelente / Buena / Atención / Peligro") con texto explicativo
   - 2 tarjetas con el **par más** y **menos** correlacionado
   - **Heatmap NxN** clicable (click en celda → detalle del par)
   - Lista de **sugerencias accionables**
5. El alumno puede cambiar el **período** (3m, 6m, 1y, 2y, 5y) y recalcular para ver cómo cambian las correlaciones según la ventana temporal — esto enseña que **la correlación NO es estable**.

---

## Por qué este diseño es pedagógicamente sólido

El componente refleja exactamente lo que dice el material teórico:

| Concepto del temario | Cómo lo refleja el panel |
|---|---|
| "Correlación de −1 a +1" | Heatmap con gradiente verde→amarillo→rojo |
| "Diversificación falsa por factor" | KPI "Correlación media" alta + sugerencia explicando que tienen el mismo factor |
| "La correlación no es estable, cambia en estrés" | Selector de período (compara 6m con 5y) |
| "Más allá del nº de tickers, contribución al riesgo" | Diversification ratio + "Riesgo evitado %" |
| "Ratio σ_p < σ_avg = diversificación efectiva" | Comparación visual de las dos volatilidades |

---

## Conexión con la plantilla pedagógica (artefacto v2)

El reto **1B** del artefacto v2 (auditar la diversificación de la cartera simulada) ahora puede ser **mucho más concreto**:

> **Reto 1B (versión actualizada)**:
> 1. Añade tu cartera al simulador del Screener
> 2. Pulsa "Calcular correlación"
> 3. Anota: ¿cuál es tu correlación media? ¿Y tu diversification ratio?
> 4. ¿Tienes algún par con ρ > 0,85? Esos son "duplicados".
> 5. Cambia el período de 6m a 5y. ¿Qué pasa con la correlación media en cada uno? ¿Por qué?
> 6. Reescribe tu cartera para conseguir un diversification ratio ≥ 1,3 manteniendo al menos 5 activos.

---

## Mejoras opcionales para más adelante

### Comparador de períodos (futuro v2 de la feature)

Llamar al endpoint con varios períodos a la vez y mostrar cómo evoluciona la correlación media. Demuestra visualmente que **en crisis las correlaciones se acercan a 1**.

```
                  3m    6m    1y    2y    5y
Correlación media 0.62  0.71  0.74  0.83  0.79
                                    ↑
                           crisis 2022 incluida
```

### Sugerencias automáticas con candidatos

Cuando la correlación media > 0,7, llamar a un endpoint adicional que busque, dentro de los universos del screener, los 3 tickers que **más bajarían** la correlación si se añadieran. Algo así:

```
POST /api/market/correlation/suggest
{ tickers: [...], universe: "All" }
→ [
  { ticker: "GLD", new_avg_correlation: 0.45, reduction: -0.22 },
  { ticker: "TLT", new_avg_correlation: 0.48, reduction: -0.19 },
  ...
]
```

Es una iteración natural y enseña diversificación de forma muy táctil.

### Modo "estrés"

Calcular la correlación SOLO durante el peor drawdown del S&P 500 reciente (p.ej. 2022 H1). Demuestra el principio del temario: **"en periodos de estrés muchas correlaciones suben y los activos se mueven en bloque"**.

---

## Qué NO hacer

- No añadir esta info al `diversity_score` actual mezclando todo en un único número. Mejor mantener las **dos métricas separadas**: Shannon (variedad) y correlación (comportamiento). Son complementarias.
- No bloquear la compra de cartera si la correlación es alta. Es un *aviso pedagógico*, no una restricción. Los alumnos deben aprender a interpretar y decidir.
- No cachear resultados con pesos: solo la matriz base. El cálculo dependiente de pesos es trivial y debe ser fresco siempre.

---

## Coste y rendimiento

- **1 sola llamada** a `yf.download()` batch para los N tickers. Yahoo lo gestiona en paralelo.
- Cache 1h en backend → si 5 alumnos calculan la misma cesta, solo el primero pega a Yahoo.
- Frontend: mutation manual (botón "Calcular"), no auto-fetch → el alumno controla cuándo se ejecuta.
- Tamaño de respuesta: matriz 30×30 = 900 floats ≈ 9 KB. Sin problema.
