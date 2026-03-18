Adapta una página o componente para que funcione bien en móvil y tablet. El usuario indicará qué página o sección quiere hacer responsive.

Páginas del frontend (ordenadas por complejidad responsive):
1. `pages/Charts.tsx` — La más compleja: toolbar lateral, gráfico, osciladores, panel indicadores
2. `pages/Screener.tsx` — Tabla ancha con muchas columnas, filtros, simulador
3. `pages/Demo.tsx` — Tablas de posiciones, carteras, formulario de orden
4. `pages/Backtest.tsx` — Constructor de estrategias, resultados con métricas
5. `pages/Tutor.tsx` — Chat (relativamente simple)
6. `pages/Dashboard.tsx` — Grid de tarjetas (ya parcialmente responsive con md:grid-cols)
7. `pages/Profile.tsx` — Formulario simple

Breakpoints TailwindCSS:
- `sm:` → 640px (móvil grande)
- `md:` → 768px (tablet)
- `lg:` → 1024px (desktop)
- `xl:` → 1280px (desktop grande)

Patrones responsive a usar:
- Grids: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`
- Tablas anchas: `overflow-x-auto` con scroll horizontal
- Toolbar lateral → toolbar horizontal colapsable en móvil
- Paneles side-by-side → stacked en móvil
- Font sizes: `text-xs sm:text-sm` para tablas densas
- Ocultar columnas no esenciales en móvil: `hidden md:table-cell`
- Navbar: considerar hamburger menu para móvil

Pasos:
1. Lee la página/componente objetivo
2. Identifica qué se rompe en pantallas pequeñas (layouts fijos, tablas anchas, overlaps)
3. Aplica clases responsive de TailwindCSS
4. Prioriza: contenido principal visible > funcionalidad completa > estética perfecta
5. Verifica con las DevTools del navegador (Chrome: Ctrl+Shift+M)
6. Verifica con `npx tsc --noEmit`
