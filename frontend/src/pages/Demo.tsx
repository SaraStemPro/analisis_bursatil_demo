import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { demo, market } from '../api'
import { ArrowDownCircle, ArrowUpCircle, RotateCcw } from 'lucide-react'

export default function Demo() {
  const qc = useQueryClient()
  const [ticker, setTicker] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [orderError, setOrderError] = useState('')

  const { data: portfolio } = useQuery({ queryKey: ['portfolio'], queryFn: demo.portfolio })
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: demo.orders })
  const { data: perf } = useQuery({ queryKey: ['performance'], queryFn: demo.performance })
  const { data: quote } = useQuery({
    queryKey: ['demoQuote', ticker],
    queryFn: () => market.quote(ticker),
    enabled: ticker.length > 0,
  })

  const orderMut = useMutation({
    mutationFn: (data: { ticker: string; type: string; quantity: number }) => demo.createOrder(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['portfolio'] }); qc.invalidateQueries({ queryKey: ['orders'] }); qc.invalidateQueries({ queryKey: ['performance'] }); setOrderError('') },
    onError: (e) => setOrderError(e instanceof Error ? e.message : 'Error'),
  })

  const resetMut = useMutation({
    mutationFn: () => demo.reset(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['portfolio'] }); qc.invalidateQueries({ queryKey: ['orders'] }); qc.invalidateQueries({ queryKey: ['performance'] }) },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Paper Trading</h1>

      {/* Portfolio */}
      {portfolio && (
        <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-lg">Portfolio</h2>
            <button onClick={() => resetMut.mutate()} className="flex items-center gap-1 text-sm text-slate-400 hover:text-red-400">
              <RotateCcw size={14} /> Resetear
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div><p className="text-sm text-slate-400">Valor total</p><p className="text-lg font-bold">{Number(portfolio.total_value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p></div>
            <div><p className="text-sm text-slate-400">Saldo</p><p className="text-lg font-bold">{Number(portfolio.balance).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p></div>
            <div><p className="text-sm text-slate-400">P&L</p><p className={`text-lg font-bold ${Number(portfolio.total_pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{Number(portfolio.total_pnl) >= 0 ? '+' : ''}{Number(portfolio.total_pnl).toFixed(2)}€</p></div>
            <div><p className="text-sm text-slate-400">Rendimiento</p><p className={`text-lg font-bold ${Number(portfolio.total_pnl_pct) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{Number(portfolio.total_pnl_pct) >= 0 ? '+' : ''}{Number(portfolio.total_pnl_pct).toFixed(2)}%</p></div>
          </div>
          {portfolio.positions.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-2">Posiciones abiertas</h3>
              <div className="space-y-2">
                {portfolio.positions.map((p) => (
                  <div key={p.ticker} className="flex items-center justify-between bg-slate-800 rounded px-3 py-2 text-sm">
                    <span className="font-medium">{p.ticker} x{p.quantity}</span>
                    <span className="text-slate-400">Avg: {Number(p.avg_price).toFixed(2)}</span>
                    <span className={Number(p.pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {Number(p.pnl) >= 0 ? '+' : ''}{Number(p.pnl).toFixed(2)}€ ({Number(p.pnl_pct).toFixed(2)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Order form */}
      <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
        <h2 className="font-semibold mb-3">Nueva orden</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-sm text-slate-400">Ticker</label>
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="AAPL" className="block mt-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white w-32 focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="text-sm text-slate-400">Cantidad</label>
            <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="block mt-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white w-24 focus:outline-none focus:border-emerald-500" />
          </div>
          {quote && <p className="text-sm text-slate-400 pb-2">Precio: {quote.price.toFixed(2)} {quote.currency}</p>}
          <button onClick={() => orderMut.mutate({ ticker, type: 'buy', quantity })} disabled={!ticker || orderMut.isPending} className="flex items-center gap-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded text-white font-medium">
            <ArrowUpCircle size={16} /> Comprar
          </button>
          <button onClick={() => orderMut.mutate({ ticker, type: 'sell', quantity })} disabled={!ticker || orderMut.isPending} className="flex items-center gap-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded text-white font-medium">
            <ArrowDownCircle size={16} /> Vender
          </button>
        </div>
        {orderError && <p className="text-red-400 text-sm mt-2">{orderError}</p>}
      </div>

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
      {orders && orders.length > 0 && (
        <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
          <h2 className="font-semibold mb-3">Historial de órdenes</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-slate-400 text-left border-b border-slate-700">
                <th className="pb-2">Fecha</th><th className="pb-2">Ticker</th><th className="pb-2">Tipo</th><th className="pb-2">Cantidad</th><th className="pb-2">Precio</th><th className="pb-2">P&L</th><th className="pb-2">Estado</th>
              </tr></thead>
              <tbody>
                {orders.slice(0, 20).map((o) => (
                  <tr key={o.id} className="border-b border-slate-800">
                    <td className="py-2">{new Date(o.created_at).toLocaleDateString('es-ES')}</td>
                    <td className="font-medium">{o.ticker}</td>
                    <td className={o.type === 'buy' ? 'text-emerald-400' : 'text-red-400'}>{o.type === 'buy' ? 'Compra' : 'Venta'}</td>
                    <td>{o.quantity}</td>
                    <td>{Number(o.price).toFixed(2)}</td>
                    <td className={o.pnl && Number(o.pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}>{o.pnl ? `${Number(o.pnl).toFixed(2)}€` : '-'}</td>
                    <td><span className={`px-2 py-0.5 rounded text-xs ${o.status === 'open' ? 'bg-blue-900 text-blue-300' : 'bg-slate-800 text-slate-400'}`}>{o.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
