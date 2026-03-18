import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { demo } from '../../api'
import type { Position } from '../../types'
import { X } from 'lucide-react'

interface Props {
  position: Position
  onClose: () => void
}

export default function ClosePositionDialog({ position, onClose }: Props) {
  const qc = useQueryClient()
  const [quantity, setQuantity] = useState(position.quantity)
  const [error, setError] = useState('')

  const closeMut = useMutation({
    mutationFn: () => demo.closePosition({ ticker: position.ticker, quantity, side: position.side }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['performance'] })
      qc.invalidateQueries({ queryKey: ['portfolioSummary'] })
      onClose()
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error al cerrar posicion'),
  })

  const estimatedPnl = position.side === 'long'
    ? (position.current_price - position.avg_price) * quantity
    : (position.avg_price - position.current_price) * quantity

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-white border border-gray-300 rounded-xl p-6 w-96 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg">Cerrar posicion</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900"><X size={18} /></button>
        </div>

        <div className="mb-4 text-sm">
          <p className="text-gray-700">
            <span className="font-bold text-gray-900">{position.ticker}</span>
            <span className={`ml-2 text-xs px-2 py-0.5 rounded ${position.side === 'long' ? 'bg-emerald-900 text-emerald-400' : 'bg-red-900 text-red-400'}`}>
              {position.side.toUpperCase()}
            </span>
          </p>
          <p className="text-gray-500 mt-1">Posicion: {position.quantity} acciones a {Number(position.avg_price).toFixed(2)}</p>
        </div>

        <div className="mb-4">
          <label className="text-sm text-gray-500">Cantidad a cerrar</label>
          <div className="flex items-center gap-3 mt-1">
            <input
              type="range"
              min={1}
              max={position.quantity}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="flex-1 accent-emerald-500"
            />
            <input
              type="number"
              min={1}
              max={position.quantity}
              value={quantity}
              onChange={(e) => setQuantity(Math.min(position.quantity, Math.max(1, Number(e.target.value))))}
              className="w-20 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm text-center"
            />
          </div>
        </div>

        <div className="mb-4 p-3 bg-gray-100 rounded text-sm">
          <p className="text-gray-500">P&L estimado</p>
          <p className={`text-lg font-bold ${estimatedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {estimatedPnl >= 0 ? '+' : ''}{estimatedPnl.toFixed(2)}€
          </p>
        </div>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <div className="flex gap-2">
          {position.quantity > 1 && quantity < position.quantity && (
            <button
              onClick={() => closeMut.mutate()}
              disabled={closeMut.isPending}
              className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded text-gray-900 font-medium text-sm"
            >
              Cerrar {quantity} de {position.quantity}
            </button>
          )}
          <button
            onClick={() => { setQuantity(position.quantity); closeMut.mutate() }}
            disabled={closeMut.isPending}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded text-white font-medium text-sm"
          >
            Cerrar todo
          </button>
        </div>
      </div>
    </div>
  )
}
