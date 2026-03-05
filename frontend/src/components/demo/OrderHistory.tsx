import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { demo } from '../../api'

function typeLabel(type: string, side: string | null): { text: string; color: string } {
  if (type === 'buy') return { text: 'Compra (Long)', color: 'text-emerald-400' }
  if (type === 'sell') return { text: 'Venta (Short)', color: 'text-red-400' }
  if (type === 'close') {
    const sideLabel = side === 'short' ? 'Short' : 'Long'
    return { text: `Cierre ${sideLabel}`, color: 'text-amber-400' }
  }
  return { text: type, color: 'text-slate-400' }
}

export default function OrderHistory() {
  const navigate = useNavigate()
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: demo.orders })

  if (!orders || orders.length === 0) return null

  return (
    <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
      <h2 className="font-semibold mb-3">Historial de ordenes</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-left border-b border-slate-700">
              <th className="pb-2">Fecha</th>
              <th className="pb-2">Ticker</th>
              <th className="pb-2">Tipo</th>
              <th className="pb-2">Cantidad</th>
              <th className="pb-2">Precio</th>
              <th className="pb-2">P&L</th>
              <th className="pb-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {orders.slice(0, 30).map((o) => {
              const t = typeLabel(o.type, o.side)
              return (
                <tr key={o.id} className="border-b border-slate-800">
                  <td className="py-2">{new Date(o.created_at).toLocaleDateString('es-ES')}</td>
                  <td className="py-2">
                    <button
                      onClick={() => navigate(`/charts?ticker=${o.ticker}`)}
                      className="font-medium text-white hover:text-emerald-400"
                    >
                      {o.ticker}
                    </button>
                  </td>
                  <td className={`py-2 ${t.color}`}>{t.text}</td>
                  <td className="py-2">{o.quantity}</td>
                  <td className="py-2">{Number(o.price).toFixed(2)}</td>
                  <td className={o.pnl != null && Number(o.pnl) >= 0 ? 'text-emerald-400 py-2' : 'text-red-400 py-2'}>
                    {o.pnl != null ? `${Number(o.pnl).toFixed(2)}€` : '-'}
                  </td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      o.status === 'open' ? 'bg-blue-900 text-blue-300' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {o.status === 'open' ? 'Abierta' : 'Cerrada'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
