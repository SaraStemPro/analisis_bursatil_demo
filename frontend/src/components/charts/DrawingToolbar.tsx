import { TrendingUp, ArrowUp, ArrowDown, Type, GitBranch, Activity, Trash2, X, Move } from 'lucide-react'
import { useDrawingStore } from '../../context/drawing-store'
import type { DrawingToolType } from '../../types/drawings'

const TOOLS: { type: DrawingToolType; icon: typeof TrendingUp; label: string }[] = [
  { type: 'trendline', icon: TrendingUp, label: 'Tendencia' },
  { type: 'arrow', icon: ArrowUp, label: 'Flecha' },
  { type: 'text', icon: Type, label: 'Texto' },
  { type: 'fibonacci', icon: GitBranch, label: 'Fibonacci' },
  { type: 'elliott', icon: Activity, label: 'Elliott' },
]

const GUIDANCE: Record<DrawingToolType, string> = {
  trendline: 'Click 2 puntos para trazar la línea',
  arrow: 'Click un punto para colocar la flecha',
  text: 'Click un punto para añadir texto',
  fibonacci: 'Click 2 puntos (máximo y mínimo)',
  elliott: 'Click puntos, doble-click para terminar',
}

export default function DrawingToolbar() {
  const {
    activeTool, selectTool, pendingPoints, selectedId,
    removeDrawing, clearAll, drawings, resetInteraction,
    elliottWaveType, setElliottWaveType,
    arrowDirection, setArrowDirection,
    moveMode, setMoveMode,
  } = useDrawingStore()

  return (
    <div className="flex flex-col gap-1 bg-slate-900 rounded-lg border border-slate-700 p-1.5">
      {TOOLS.map(({ type, icon: Icon, label }) => {
        const isActive = activeTool === type
        return (
          <button
            key={type}
            onClick={() => selectTool(isActive ? null : type)}
            title={label}
            className={`p-2 rounded transition-colors ${
              isActive ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Icon size={18} />
          </button>
        )
      })}

      {/* Arrow direction toggle */}
      {activeTool === 'arrow' && (
        <div className="flex flex-col gap-0.5 border-t border-slate-700 pt-1 mt-1">
          <button
            onClick={() => setArrowDirection('up')}
            title="Flecha arriba"
            className={`p-1.5 rounded transition-colors ${
              arrowDirection === 'up' ? 'bg-emerald-900 text-emerald-400' : 'text-slate-500 hover:bg-slate-800'
            }`}
          >
            <ArrowUp size={14} />
          </button>
          <button
            onClick={() => setArrowDirection('down')}
            title="Flecha abajo"
            className={`p-1.5 rounded transition-colors ${
              arrowDirection === 'down' ? 'bg-red-900 text-red-400' : 'text-slate-500 hover:bg-slate-800'
            }`}
          >
            <ArrowDown size={14} />
          </button>
        </div>
      )}

      {/* Elliott wave type toggle */}
      {activeTool === 'elliott' && (
        <div className="flex flex-col gap-0.5 border-t border-slate-700 pt-1 mt-1">
          <button
            onClick={() => setElliottWaveType('impulse')}
            className={`px-1 py-0.5 text-[10px] rounded ${elliottWaveType === 'impulse' ? 'bg-emerald-900 text-emerald-300' : 'text-slate-500'}`}
          >
            1-5
          </button>
          <button
            onClick={() => setElliottWaveType('corrective')}
            className={`px-1 py-0.5 text-[10px] rounded ${elliottWaveType === 'corrective' ? 'bg-emerald-900 text-emerald-300' : 'text-slate-500'}`}
          >
            ABC
          </button>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-slate-700 my-1" />

      {/* Move selected drawing */}
      {selectedId && (
        <button
          onClick={() => setMoveMode(!moveMode)}
          title="Mover dibujo"
          className={`p-2 rounded transition-colors ${
            moveMode ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Move size={18} />
        </button>
      )}

      {/* Delete selected */}
      {selectedId && (
        <button
          onClick={() => removeDrawing(selectedId)}
          title="Borrar seleccionado"
          className="p-2 rounded text-red-400 hover:bg-red-900/30"
        >
          <Trash2 size={18} />
        </button>
      )}

      {/* Clear all */}
      {drawings.length > 0 && (
        <button
          onClick={clearAll}
          title="Borrar todo"
          className="p-2 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800"
        >
          <X size={18} />
        </button>
      )}

      {/* Cancel current */}
      {activeTool && pendingPoints.length > 0 && (
        <button
          onClick={resetInteraction}
          title="Cancelar"
          className="p-2 rounded text-yellow-400 hover:bg-slate-800 text-[10px] font-bold"
        >
          ESC
        </button>
      )}

      {/* Guidance text */}
      {activeTool && (
        <div className="mt-1 px-1">
          <p className="text-[9px] text-slate-500 leading-tight text-center">
            {GUIDANCE[activeTool]}
          </p>
          {activeTool === 'elliott' && pendingPoints.length > 0 && (
            <p className="text-[9px] text-emerald-400 text-center mt-0.5">
              {pendingPoints.length} pts
            </p>
          )}
        </div>
      )}
      {moveMode && (
        <div className="mt-1 px-1">
          <p className="text-[9px] text-blue-400 leading-tight text-center">
            Click para mover
          </p>
        </div>
      )}
    </div>
  )
}
