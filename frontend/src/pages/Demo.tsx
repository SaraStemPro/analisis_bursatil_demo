import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { demo } from '../api'
import type { Position } from '../types'
import { RotateCcw, X, ExternalLink, XCircle } from 'lucide-react'
import OrderForm from '../components/demo/OrderForm'
import ClosePositionDialog from '../components/demo/ClosePositionDialog'
import PortfolioSummaryPanel from '../components/demo/PortfolioSummaryPanel'
import OrderHistory from '../components/demo/OrderHistory'

export default function Demo() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [closingPosition, setClosingPosition] = useState<Position | null>(null)
  const [initialTicker, setInitialTicker] = useState('')

  useEffect(() => {
    const buy = searchParams.get('buy')
    if (buy) {
      setInitialTicker(buy.toUpperCase())
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: portfolio } = useQuery({ queryKey: ['portfolio'], queryFn: demo.portfolio })
  const { data: perf } = useQuery({ queryKey: ['performance'], queryFn: demo.performance })

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['portfolio'] })
    qc.invalidateQueries({ queryKey: ['orders'] })
    qc.invalidateQueries({ queryKey: ['performance'] })
    qc.invalidateQueries({ queryKey: ['portfolioSummary'] })
  }

  const resetMut = useMutation({
    mutationFn: () => demo.reset(),
    onSuccess: invalidateAll,
  })

  const closeAllMut = useMutation({
    mutationFn: () => demo.closeAll(),
    onSuccess: invalidateAll,
  })

  const hasPositions = portfolio && portfolio.positions.length > 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Paper Trading</h1>

      {/* Portfolio overview */}
      {portfolio && (
        <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-lg">Portfolio</h2>
            <div className="flex items-center gap-2">
              {hasPositions && (
                <button
                  onClick={() => { if (confirm('¿Cerrar TODAS las posiciones al precio actual?')) closeAllMut.mutate() }}
                  disabled={closeAllMut.isPending}
                  className="flex items-center gap-1 text-sm text-slate-400 hover:text-amber-400 disabled:opacity-50"
                >
                  <XCircle size={14} /> {closeAllMut.isPending ? 'Cerrando...' : 'Cerrar todo'}
                </button>
              )}
              <button onClick={() => resetMut.mutate()} className="flex items-center gap-1 text-sm text-slate-400 hover:text-red-400">
                <RotateCcw size={14} /> Resetear
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-sm text-slate-400">Valor total</p>
              <p className="text-lg font-bold">{Number(portfolio.total_value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Saldo</p>
              <p className="text-lg font-bold">{Number(portfolio.balance).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">P&L</p>
              <p className={`text-lg font-bold ${Number(portfolio.total_pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {Number(portfolio.total_pnl) >= 0 ? '+' : ''}{Number(portfolio.total_pnl).toFixed(2)}€
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Rendimiento</p>
              <p className={`text-lg font-bold ${Number(portfolio.total_pnl_pct) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {Number(portfolio.total_pnl_pct) >= 0 ? '+' : ''}{Number(portfolio.total_pnl_pct).toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Open positions — list format */}
          {hasPositions && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-2">Posiciones abiertas ({portfolio.positions.length})</h3>
              <div className="border border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-left border-b border-slate-700 bg-slate-800/50">
                      <th className="px-3 py-2">Ticker</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2 text-right">Cantidad</th>
                      <th className="px-3 py-2 text-right">P. medio</th>
                      <th className="px-3 py-2 text-right">P. actual</th>
                      <th className="px-3 py-2 text-right">P&L</th>
                      <th className="px-3 py-2 text-right">%</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.positions.map((p) => {
                      const isLong = p.side === 'long'
                      const isProfit = Number(p.pnl) >= 0
                      return (
                        <tr key={`${p.ticker}-${p.side}`} className="border-b border-slate-800 hover:bg-slate-800/50">
                          <td className="px-3 py-2">
                            <button
                              onClick={() => navigate(`/charts?ticker=${p.ticker}`)}
                              className="font-medium text-white hover:text-emerald-400 inline-flex items-center gap-1"
                            >
                              {p.ticker}
                              <ExternalLink size={11} className="opacity-40" />
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              isLong ? 'bg-emerald-900/60 text-emerald-400' : 'bg-red-900/60 text-red-400'
                            }`}>
                              {isLong ? 'LONG' : 'SHORT'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-white">{p.quantity}</td>
                          <td className="px-3 py-2 text-right text-slate-300">{Number(p.avg_price).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-white">{Number(p.current_price).toFixed(2)}</td>
                          <td className={`px-3 py-2 text-right font-medium ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isProfit ? '+' : ''}{Number(p.pnl).toFixed(2)}€
                          </td>
                          <td className={`px-3 py-2 text-right ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isProfit ? '+' : ''}{Number(p.pnl_pct).toFixed(2)}%
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => setClosingPosition(p)}
                              className="text-slate-500 hover:text-red-400 transition-colors"
                              title="Cerrar posicion"
                            >
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Order form */}
      <OrderForm initialTicker={initialTicker} />

      {/* Portfolio summary */}
      <PortfolioSummaryPanel />

      {/* Performance */}
      {perf && perf.total_trades > 0 && (
        <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
          <h2 className="font-semibold mb-3">Rendimiento</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><p className="text-slate-400">Rentabilidad</p><p className="font-medium">{perf.total_return_pct.toFixed(2)}%</p></div>
            <div><p className="text-slate-400">Win rate</p><p className="font-medium">{perf.win_rate.toFixed(1)}%</p></div>
            <div><p className="text-slate-400">Max drawdown</p><p className="font-medium text-red-400">{perf.max_drawdown_pct.toFixed(2)}%</p></div>
            <div><p className="text-slate-400">Trades</p><p className="font-medium">{perf.total_trades} ({perf.profitable_trades}W / {perf.losing_trades}L)</p></div>
          </div>
        </div>
      )}

      {/* Order history */}
      <OrderHistory />

      {/* Close position dialog */}
      {closingPosition && (
        <ClosePositionDialog
          position={closingPosition}
          onClose={() => setClosingPosition(null)}
        />
      )}
    </div>
  )
}
