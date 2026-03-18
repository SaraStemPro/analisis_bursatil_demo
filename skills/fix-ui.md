Corrige un problema visual o de UX en la interfaz. El usuario describirá qué se ve mal o qué quiere ajustar.

Páginas del frontend (7):
- `pages/Dashboard.tsx` — 4 tarjetas + Tutor IA bloque grande + stats portfolio
- `pages/Charts.tsx` — Gráficos con velas, indicadores, dibujos, patrones (~900 líneas)
- `pages/Screener.tsx` — Tabla sorteable + filtros + simulador portfolio (~700 líneas)
- `pages/Demo.tsx` — Paper Trading: posiciones individuales + carteras + órdenes
- `pages/Backtest.tsx` — Backtesting: templates, constructor, resultados
- `pages/Tutor.tsx` — Chat IA con historial de conversaciones
- `pages/Profile.tsx` — Perfil de usuario

Layout:
- `components/layout/Navbar.tsx` — Barra de navegación superior con 6 items + perfil
- `components/layout/Layout.tsx` — Wrapper con navbar + contenido + auth check

Estilos:
- TailwindCSS v4 (configuración en `frontend/src/index.css`)
- Tema oscuro: bg-slate-950, text-white, bordes slate-700/800
- Colores: emerald para positivo/long, red para negativo/short, cyan para carteras, amber para tutor/close
- Scrollbar custom: clase `scrollbar-top` para barra horizontal arriba (CSS rotateX trick)

Formato inteligente de precios:
- `fmtPrice()` en Charts.tsx y Demo.tsx: 5 decimales (<10), 4 (<100), 2 (>=100)
- `formatPrice()` en Screener.tsx: misma lógica

Pasos:
1. Lee el archivo de la página afectada
2. Identifica el componente/sección con el problema
3. Aplica el fix con las convenciones de estilo del proyecto
4. Verifica con `npx tsc --noEmit`
