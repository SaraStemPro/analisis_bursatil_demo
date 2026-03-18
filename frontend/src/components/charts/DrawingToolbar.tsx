import { TrendingUp, ArrowUp, ArrowDown, Type, GitBranch, Activity, Minus, Trash2, X } from 'lucide-react'
import { useDrawingStore } from '../../context/drawing-store'
import type { DrawingToolType } from '../../types/drawings'

/** Custom vertical line icon — a simple | bar */
function VLineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="3" x2="12" y2="21" />
    </svg>
  )
}

type IconComponent = typeof TrendingUp | typeof VLineIcon

const TOOLS: { type: DrawingToolType; icon: IconComponent; label: string }[] = [
  { type: 'trendline', icon: TrendingUp, label: 'Tendencia' },
  { type: 'hline', icon: Minus, label: 'Línea horizontal' },
  { type: 'vline', icon: VLineIcon, label: 'Línea vertical' },
  { type: 'arrow', icon: ArrowUp, label: 'Flecha' },
  { type: 'text', icon: Type, label: 'Texto' },
  { type: 'fibonacci', icon: GitBranch, label: 'Fibonacci' },
  { type: 'elliott', icon: Activity, label: 'Elliott' },
]

const GUIDANCE: Record<DrawingToolType, string> = {
  trendline: 'Click 2 puntos para trazar la línea',
  hline: 'Click un punto para línea horizontal',
  vline: 'Click un punto para línea vertical',
  arrow: 'Click un punto para colocar la flecha',
  text: 'Click un punto para añadir texto',
  fibonacci: 'Click 2 puntos (máximo y mínimo)',
  elliott: 'Click puntos, doble-click para terminar',
}

const COLOR_PALETTE = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff']

export default function DrawingToolbar() {
  const {
    activeTool, selectTool, pendingPoints, selectedId,
    removeDrawing, clearAll, drawings, resetInteraction,
    elliottWaveType, setElliottWaveType,
    arrowDirection, setArrowDirection,
    updateDrawingColor,
  } = useDrawingStore()

  return (
    <div className="flex flex-col gap-1 bg-white rounded-lg border border-gray-300 p-1.5">
      {TOOLS.map(({ type, icon: Icon, label }) => {
        const isActive = activeTool === type
        return (
          <button
            key={type}
            onClick={() => selectTool(isActive ? null : type)}
            title={label}
            className={`p-2 rounded transition-colors ${
              isActive ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Icon size={18} />
          </button>
        )
      })}

      {/* Arrow direction toggle */}
      {activeTool === 'arrow' && (
        <div className="flex flex-col gap-0.5 border-t border-gray-300 pt-1 mt-1">
          <button
            onClick={() => setArrowDirection('up')}
            title="Flecha arriba"
            className={`p-1.5 rounded transition-colors ${
              arrowDirection === 'up' ? 'bg-emerald-900 text-emerald-400' : 'text-gray-400 hover:bg-gray-100'
            }`}
          >
            <ArrowUp size={14} />
          </button>
          <button
            onClick={() => setArrowDirection('down')}
            title="Flecha abajo"
            className={`p-1.5 rounded transition-colors ${
              arrowDirection === 'down' ? 'bg-red-900 text-red-400' : 'text-gray-400 hover:bg-gray-100'
            }`}
          >
            <ArrowDown size={14} />
          </button>
        </div>
      )}

      {/* Elliott wave type toggle */}
      {activeTool === 'elliott' && (
        <div className="flex flex-col gap-0.5 border-t border-gray-300 pt-1 mt-1">
          <button
            onClick={() => setElliottWaveType('impulse')}
            className={`px-1 py-0.5 text-[10px] rounded ${elliottWaveType === 'impulse' ? 'bg-emerald-900 text-emerald-300' : 'text-gray-400'}`}
          >
            1-5
          </button>
          <button
            onClick={() => setElliottWaveType('corrective')}
            className={`px-1 py-0.5 text-[10px] rounded ${elliottWaveType === 'corrective' ? 'bg-emerald-900 text-emerald-300' : 'text-gray-400'}`}
          >
            ABC
          </button>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-gray-300 my-1" />

      {/* Color picker for selected drawing */}
      {selectedId && (
        <div className="flex flex-col gap-1 border-t border-gray-300 pt-1 mt-1">
          <div className="flex flex-wrap gap-1 px-0.5 justify-center">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => updateDrawingColor(selectedId, c)}
                className="w-4 h-4 rounded-full border border-gray-300 hover:scale-125 transition-transform"
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
          <label className="flex items-center justify-center cursor-pointer" title="Color personalizado">
            <input
              type="color"
              value={drawings.find((d) => d.id === selectedId)?.color ?? '#ffffff'}
              onChange={(e) => updateDrawingColor(selectedId, e.target.value)}
              className="w-6 h-6 cursor-pointer bg-transparent border-0"
            />
          </label>
        </div>
      )}

      {/* Delete selected — with confirmation */}
      {selectedId && (
        <button
          onClick={() => {
            if (window.confirm('¿Eliminar este dibujo?')) removeDrawing(selectedId)
          }}
          title="Borrar seleccionado"
          className="p-2 rounded text-red-400 hover:bg-red-900/30"
        >
          <Trash2 size={18} />
        </button>
      )}

      {/* Clear all — with confirmation */}
      {drawings.length > 0 && (
        <button
          onClick={() => {
            if (window.confirm('¿Eliminar todos los dibujos?')) clearAll()
          }}
          title="Borrar todo"
          className="p-2 rounded text-gray-400 hover:text-red-400 hover:bg-gray-100"
        >
          <X size={18} />
        </button>
      )}

      {/* Cancel current */}
      {activeTool && pendingPoints.length > 0 && (
        <button
          onClick={resetInteraction}
          title="Cancelar"
          className="p-2 rounded text-yellow-400 hover:bg-gray-100 text-[10px] font-bold"
        >
          ESC
        </button>
      )}

      {/* Guidance text */}
      {activeTool && (
        <div className="mt-1 px-1">
          <p className="text-[9px] text-gray-400 leading-tight text-center">
            {GUIDANCE[activeTool]}
          </p>
          {activeTool === 'elliott' && pendingPoints.length > 0 && (
            <p className="text-[9px] text-emerald-400 text-center mt-0.5">
              {pendingPoints.length} pts
            </p>
          )}
        </div>
      )}
    </div>
  )
}
