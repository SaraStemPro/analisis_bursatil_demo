import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { backtest } from '../api'
import type { Strategy, BacktestRun, BacktestRunSummary } from '../types'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { FlaskConical, Play, Trash2 } from 'lucide-react'

export default function Backtest() {
  const qc = useQueryClient()
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null)
  const [ticker, setTicker] = useState('AAPL')
  const [startDate, setStartDate] = useState('2024-01-01')
  const [endDate, setEndDate] = useState('2025-01-01')
  const [activeRun, setActiveRun] = useState<BacktestRun | null>(null)

  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: backtest.templates })
  const { data: strategies } = useQuery({ queryKey: ['strategies'], queryFn: backtest.strategies })
  const { data: runs } = useQuery({ queryKey: ['runs'], queryFn: backtest.runs })

  const runMut = useMutation({
    mutationFn: () => backtest.run({
      strategy_id: selectedStrategy!.id,
      ticker,
      start_date: startDate,
      end_date: endDate,
    }),
    onSuccess: (data) => {
      setActiveRun(data)
      qc.invalidateQueries({ queryKey: ['runs'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => backtest.deleteRun(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['runs'] }); setActiveRun(null) },
  })

  const viewRun = async (id: string) => {
    const data = await backtest.getRun(id)
    setActiveRun(data)
  }

  const allStrategies = [...(templates || []), ...(strategies || [])]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Backtesting</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Strategy selector */}
        <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
          <h2 className="font-semibold mb-3">Estrategias</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {allStrategies.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedStrategy(s)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  selectedStrategy?.id === s.id ? 'bg-emerald-900/50 border border-emerald-600' : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.name}</span>
                  {s.is_template && <span className="text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">plantilla</span>}
                </div>
                {s.description && <p className="text-xs text-slate-400 mt-1">{s.description}</p>}
              </button>
            ))}
          </div>
        </div>

        {/* Run config */}
        <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
          <h2 className="font-semibold mb-3">Configuración</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-slate-400">Ticker</label>
              <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} className="block mt-1 w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-sm text-slate-400">Fecha inicio</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="block mt-1 w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-sm text-slate-400">Fecha fin</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="block mt-1 w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-emerald-500" />
            </div>
            <button
              onClick={() => runMut.mutate()}
              disabled={!selectedStrategy || runMut.isPending}
              className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded text-white font-medium"
            >
              <Play size={16} /> {runMut.isPending ? 'Ejecutando...' : 'Ejecutar Backtest'}
            </button>
            {runMut.isError && <p className="text-red-400 text-sm">{runMut.error instanceof Error ? runMut.error.message : 'Error'}</p>}
          </div>
        </div>

        {/* Run history */}
        <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
          <h2 className="font-semibold mb-3">Historial</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {runs?.map((r: BacktestRunSummary) => (
              <div key={r.id} className="flex items-center justify-between bg-slate-800 rounded px-3 py-2 text-sm">
                <button onClick={() => viewRun(r.id)} className="text-left flex-1">
                  <span className="font-medium">{r.strategy_name}</span>
                  <span className="text-slate-400 ml-2">{r.ticker}</span>
                  {r.total_return_pct !== null && (
                    <span className={`ml-2 ${r.total_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.total_return_pct >= 0 ? '+' : ''}{r.total_return_pct.toFixed(2)}%
                    </span>
                  )}
                </button>
                <button onClick={() => deleteMut.mutate(r.id)} className="text-slate-500 hover:text-red-400 ml-2">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {(!runs || runs.length === 0) && <p className="text-sm text-slate-500">Sin backtests aún</p>}
          </div>
        </div>
      </div>

      {/* Results */}
      {activeRun && activeRun.status === 'completed' && activeRun.metrics && (
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <FlaskConical size={18} className="text-emerald-400" />
              Resultados — {activeRun.ticker} ({activeRun.start_date} → {activeRun.end_date})
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-sm">
              <div><p className="text-slate-400">Rentabilidad</p><p className={`font-bold ${activeRun.metrics.total_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{activeRun.metrics.total_return_pct >= 0 ? '+' : ''}{activeRun.metrics.total_return_pct.toFixed(2)}%</p></div>
              <div><p className="text-slate-400">Sharpe</p><p className="font-bold">{activeRun.metrics.sharpe_ratio?.toFixed(2) ?? 'N/A'}</p></div>
              <div><p className="text-slate-400">Max Drawdown</p><p className="font-bold text-red-400">{activeRun.metrics.max_drawdown_pct.toFixed(2)}%</p></div>
              <div><p className="text-slate-400">Win Rate</p><p className="font-bold">{activeRun.metrics.win_rate.toFixed(1)}%</p></div>
              <div><p className="text-slate-400">Profit Factor</p><p className="font-bold">{activeRun.metrics.profit_factor?.toFixed(2) ?? 'N/A'}</p></div>
              <div><p className="text-slate-400">Trades</p><p className="font-bold">{activeRun.metrics.total_trades}</p></div>
              <div><p className="text-slate-400">Buy & Hold</p><p className="font-bold">{activeRun.metrics.buy_and_hold_return_pct?.toFixed(2) ?? 'N/A'}%</p></div>
              <div><p className="text-slate-400">Mejor trade</p><p className="font-bold text-emerald-400">{activeRun.metrics.best_trade_pnl?.toFixed(2) ?? 'N/A'}€</p></div>
              <div><p className="text-slate-400">Peor trade</p><p className="font-bold text-red-400">{activeRun.metrics.worst_trade_pnl?.toFixed(2) ?? 'N/A'}€</p></div>
              <div><p className="text-slate-400">Duración media</p><p className="font-bold">{activeRun.metrics.avg_trade_duration_days?.toFixed(1) ?? 'N/A'} días</p></div>
            </div>
          </div>

          {/* Equity curve */}
          {activeRun.equity_curve && (
            <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
              <h3 className="font-semibold mb-3">Curva de Equity</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={activeRun.equity_curve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelStyle={{ color: '#94a3b8' }} />
                  <Line type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Trades table */}
          {activeRun.trades && activeRun.trades.length > 0 && (
            <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
              <h3 className="font-semibold mb-3">Operaciones ({activeRun.trades.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-slate-400 text-left border-b border-slate-700">
                    <th className="pb-2">Entrada</th><th className="pb-2">Salida</th><th className="pb-2">Precio In</th><th className="pb-2">Precio Out</th><th className="pb-2">P&L</th><th className="pb-2">%</th><th className="pb-2">Motivo</th><th className="pb-2">Días</th>
                  </tr></thead>
                  <tbody>
                    {activeRun.trades.map((t) => (
                      <tr key={t.id} className="border-b border-slate-800">
                        <td className="py-1.5">{t.entry_date?.split('T')[0]}</td>
                        <td>{t.exit_date?.split('T')[0] ?? '-'}</td>
                        <td>{Number(t.entry_price).toFixed(2)}</td>
                        <td>{t.exit_price ? Number(t.exit_price).toFixed(2) : '-'}</td>
                        <td className={t.pnl && Number(t.pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}>{t.pnl ? `${Number(t.pnl).toFixed(2)}€` : '-'}</td>
                        <td className={t.pnl_pct && Number(t.pnl_pct) >= 0 ? 'text-emerald-400' : 'text-red-400'}>{t.pnl_pct ? `${Number(t.pnl_pct).toFixed(2)}%` : '-'}</td>
                        <td><span className="text-xs">{t.exit_reason ?? '-'}</span></td>
                        <td>{t.duration_days ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeRun && activeRun.status === 'failed' && (
        <div className="bg-red-900/30 rounded-lg p-5 border border-red-700">
          <p className="text-red-400">Error: {activeRun.error_message}</p>
        </div>
      )}
    </div>
  )
}
