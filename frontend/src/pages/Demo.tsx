import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { demo } from '../api'
import type { Position } from '../types'
import { RotateCcw, X, ExternalLink, XCircle, Briefcase, Pencil } from 'lucide-react'
import type { Cartera } from '../types'
import OrderForm from '../components/demo/OrderForm'
import ClosePositionDialog from '../components/demo/ClosePositionDialog'
import PortfolioSummaryPanel from '../components/demo/PortfolioSummaryPanel'
import OrderHistory from '../components/demo/OrderHistory'

// Smart price formatting: 5 decimals for small prices (forex), 2 for normal stocks
function fmtPrice(val: number): string {
  const n = Number(val)
  if (n < 10) return n.toFixed(5)
  if (n < 100) return n.toFixed(4)
  return n.toFixed(2)
}

function fmtPnl(val: number): string {
  const n = Number(val)
  const abs = Math.abs(n)
  if (abs < 0.01) return n.toFixed(5)
  return n.toFixed(2)
}

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
  const { data: carteras } = useQuery({ queryKey: ['carteras'], queryFn: demo.carteras })

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['portfolio'] })
    qc.invalidateQueries({ queryKey: ['orders'] })
    qc.invalidateQueries({ queryKey: ['performance'] })
    qc.invalidateQueries({ queryKey: ['portfolioSummary'] })
    qc.invalidateQueries({ queryKey: ['carteras'] })
  }

  const resetMut = useMutation({
    mutationFn: () => demo.reset(),
    onSuccess: invalidateAll,
  })

  const [editingSL, setEditingSL] = useState<{ ticker: string; side: string } | null>(null)
  const [editingSLValue, setEditingSLValue] = useState('')

  const updateSLMut = useMutation({
    mutationFn: (data: { ticker: string; side: string; stop_loss: number | null }) => demo.updateStopLoss(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['portfolio'] }); setEditingSL(null) },
  })

  const closeAllMut = useMutation({
    mutationFn: () => demo.closeAll(),
    onSuccess: invalidateAll,
  })

  const closeCarteraMut = useMutation({
    mutationFn: (name: string) => demo.closeCartera(name),
    onSuccess: invalidateAll,
  })

  // Separate cartera positions from individual positions
  const individualPositions = portfolio?.positions.filter((p) => !p.portfolio_group) || []
  const hasPositions = individualPositions.length > 0

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
              <h3 className="text-sm font-medium text-slate-400 mb-2">Posiciones individuales ({individualPositions.length})</h3>
              <div className="border border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-left border-b border-slate-700 bg-slate-800/50">
                      <th className="px-3 py-2">Ticker</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2 text-right">Cantidad</th>
                      <th className="px-3 py-2 text-right">P. entrada</th>
                      <th className="px-3 py-2 text-right">P. cierre</th>
                      <th className="px-3 py-2 text-right">P&L</th>
                      <th className="px-3 py-2 text-right">%</th>
                      <th className="px-3 py-2 text-right">Invertido</th>
                      <th className="px-3 py-2 text-right">% cap.</th>
                      <th className="px-3 py-2 text-right">Stop Loss</th>
                      <th className="px-3 py-2 text-right">Riesgo</th>
                      <th className="px-3 py-2 text-right">Riesgo FX</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {individualPositions.map((p) => {
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
                          <td className="px-3 py-2 text-right text-slate-300" title={isLong ? 'Ask (con spread)' : 'Bid (sin spread)'}>{fmtPrice(p.entry_price)}</td>
                          <td className="px-3 py-2 text-right text-white" title={isLong ? 'Bid (sin spread)' : 'Ask (con spread)'}>{fmtPrice(p.current_price)} <span className="text-[10px] text-slate-500">{isLong ? 'bid' : 'ask'}</span></td>
                          <td className={`px-3 py-2 text-right font-medium ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isProfit ? '+' : ''}{fmtPnl(p.pnl)}€
                          </td>
                          <td className={`px-3 py-2 text-right ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isProfit ? '+' : ''}{Number(p.pnl_pct).toFixed(2)}%
                          </td>
                          <td className="px-3 py-2 text-right text-slate-300">
                            {p.invested_value != null ? `${Number(p.invested_value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-400">
                            {p.invested_value != null && portfolio ? `${(Number(p.invested_value) / Number(portfolio.total_value) * 100).toFixed(1)}%` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {editingSL?.ticker === p.ticker && editingSL?.side === p.side ? (
                              <input
                                autoFocus
                                type="number"
                                step="any"
                                value={editingSLValue}
                                onChange={(e) => setEditingSLValue(e.target.value)}
                                onBlur={() => { updateSLMut.mutate({ ticker: p.ticker, side: p.side, stop_loss: editingSLValue ? Number(editingSLValue) : null }); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') { updateSLMut.mutate({ ticker: p.ticker, side: p.side, stop_loss: editingSLValue ? Number(editingSLValue) : null }); } if (e.key === 'Escape') setEditingSL(null) }}
                                className="w-20 px-1 py-0.5 bg-slate-800 border border-amber-500 rounded text-amber-400 text-xs text-right focus:outline-none"
                              />
                            ) : (
                              <button
                                onClick={() => { setEditingSL({ ticker: p.ticker, side: p.side }); setEditingSLValue(p.stop_loss ? String(p.stop_loss) : '') }}
                                className="inline-flex items-center gap-1 hover:text-amber-300 transition-colors"
                                title="Editar stop loss"
                              >
                                {p.stop_loss ? (
                                  <span className="text-amber-400">{fmtPrice(p.stop_loss)}</span>
                                ) : <span className="text-slate-600">—</span>}
                                <Pencil size={10} className="text-slate-600" />
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {p.stop_loss && p.invested_value ? (() => {
                              const sl = Number(p.stop_loss)
                              const entry = Number(p.entry_price)
                              const qty = p.quantity
                              const riskEur = isLong ? (entry - sl) * qty : (sl - entry) * qty
                              const riskPct = Number(p.invested_value) > 0 ? (riskEur / Number(portfolio?.total_value || 1) * 100) : 0
                              return (
                                <span className="text-red-400">
                                  {riskEur.toFixed(0)}€ <span className="text-[10px]">({riskPct.toFixed(1)}%)</span>
                                </span>
                              )
                            })() : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {p.fx_pnl != null ? (
                              <span
                                className={`text-xs ${p.fx_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                                title={`TC entrada: ${Number(p.fx_rate_entry).toFixed(4)} | TC actual: ${Number(p.fx_rate_current).toFixed(4)}`}
                              >
                                {Number(p.fx_pnl) >= 0 ? '+' : ''}{Number(p.fx_pnl).toFixed(2)}€
                                <span className="text-[10px] text-slate-500 ml-1">USD</span>
                              </span>
                            ) : (
                              <span className="text-slate-600 text-xs">—</span>
                            )}
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

      {/* Carteras */}
      {carteras && carteras.length > 0 && carteras.map((c: Cartera) => (
        <div key={c.name} className="bg-slate-900 rounded-lg p-5 border border-cyan-700/50">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Briefcase size={18} className="text-cyan-400" />
              {c.name}
            </h2>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-400">{c.positions.length} posiciones &middot; {c.sectors} sectores</span>
              <span className={`font-medium ${c.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {c.total_pnl >= 0 ? '+' : ''}{c.total_pnl.toFixed(2)}€ ({c.total_pnl_pct >= 0 ? '+' : ''}{c.total_pnl_pct.toFixed(2)}%)
              </span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                c.diversity_score >= 70 ? 'bg-emerald-900/60 text-emerald-400' :
                c.diversity_score >= 40 ? 'bg-amber-900/60 text-amber-400' : 'bg-red-900/60 text-red-400'
              }`}>
                {c.diversity_score >= 70 ? 'Diversificado' : c.diversity_score >= 40 ? 'Moderado' : 'Concentrado'} {c.diversity_score}%
              </span>
              <button
                onClick={() => { if (confirm(`¿Cerrar TODA la cartera "${c.name}"?`)) closeCarteraMut.mutate(c.name) }}
                disabled={closeCarteraMut.isPending}
                className="flex items-center gap-1 text-slate-400 hover:text-amber-400 disabled:opacity-50"
              >
                <XCircle size={14} /> Cerrar cartera
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
            <div><p className="text-slate-400 text-xs">Invertido</p><p className="font-medium">${c.total_invested.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p></div>
            <div><p className="text-slate-400 text-xs">Valor actual</p><p className="font-medium">${c.total_current.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p></div>
          </div>
          <div className="border border-slate-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-left border-b border-slate-700 bg-slate-800/50">
                  <th className="px-3 py-1.5">Ticker</th>
                  <th className="px-3 py-1.5 text-right">Cant.</th>
                  <th className="px-3 py-1.5 text-right">P. entrada</th>
                  <th className="px-3 py-1.5 text-right">P. cierre</th>
                  <th className="px-3 py-1.5 text-right">P&L</th>
                  <th className="px-3 py-1.5 text-right">%</th>
                  <th className="px-3 py-1.5 text-right">Riesgo FX</th>
                  <th className="px-3 py-1.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {c.positions.map((p) => {
                  const isProfit = p.pnl >= 0
                  return (
                    <tr key={`${p.ticker}-${p.side}`} className="border-b border-slate-800 hover:bg-slate-800/50">
                      <td className="px-3 py-1.5">
                        <button onClick={() => navigate(`/charts?ticker=${p.ticker}`)} className="font-medium text-white hover:text-cyan-400 inline-flex items-center gap-1">
                          {p.ticker} <ExternalLink size={10} className="opacity-40" />
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-right text-white">{p.quantity}</td>
                      <td className="px-3 py-1.5 text-right text-slate-300">{fmtPrice(p.entry_price)}</td>
                      <td className="px-3 py-1.5 text-right text-white">{fmtPrice(p.current_price)} <span className="text-[10px] text-slate-500">{p.side === 'long' ? 'bid' : 'ask'}</span></td>
                      <td className={`px-3 py-1.5 text-right font-medium ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isProfit ? '+' : ''}{fmtPnl(p.pnl)}€
                      </td>
                      <td className={`px-3 py-1.5 text-right ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isProfit ? '+' : ''}{p.pnl_pct.toFixed(2)}%
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {p.fx_pnl != null ? (
                          <span className={`text-xs ${Number(p.fx_pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {Number(p.fx_pnl) >= 0 ? '+' : ''}{Number(p.fx_pnl).toFixed(2)}€
                          </span>
                        ) : (
                          <span className="text-slate-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          onClick={() => setClosingPosition({ order_id: p.order_id, ticker: p.ticker, quantity: p.quantity, entry_price: p.entry_price, current_price: p.current_price, pnl: p.pnl, pnl_pct: p.pnl_pct, side: p.side as 'long' | 'short', portfolio_group: c.name, currency: (p.currency || 'EUR') as 'EUR' | 'USD', fx_rate_entry: null, fx_rate_current: null, fx_pnl: p.fx_pnl, stop_loss: p.stop_loss ?? null, take_profit: p.take_profit ?? null, invested_value: p.invested_value ?? null, notes: p.notes ?? null, created_at: p.created_at ?? null })}
                          className="text-slate-500 hover:text-red-400 transition-colors"
                          title="Cerrar posicion (total o parcial)"
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
      ))}

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
