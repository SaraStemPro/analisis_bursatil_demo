import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { demo } from '../api'
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

export default function Admin() {
  const { data: students, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-positions'],
    queryFn: () => demo.adminPositions(),
    refetchInterval: 60_000,
  })

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (email: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return next
    })
  }

  const fmtMoney = (v: number) => v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  const fmtPct = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
  const pnlColor = (v: number) => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-gray-500'
  const fmtPrice = (v: number) => {
    if (v < 10) return v.toFixed(5)
    if (v < 100) return v.toFixed(4)
    return v.toFixed(2)
  }

  if (isLoading) return <div className="text-gray-500 text-center py-12">Cargando posiciones...</div>

  const totalStudents = students?.length ?? 0
  const studentsWithPositions = students?.filter(s => s.positions.length > 0).length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Panel del profesor</h1>
          <p className="text-gray-500 text-sm mt-1">
            {totalStudents} estudiantes registrados, {studentsWithPositions} con posiciones abiertas
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm disabled:opacity-50"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(() => {
          const totalPnl = students?.reduce((a, s) => a + s.total_pnl, 0) ?? 0
          const avgPnlPct = totalStudents > 0 ? (students?.reduce((a, s) => a + s.total_pnl_pct, 0) ?? 0) / totalStudents : 0
          const totalInvested = students?.reduce((a, s) => a + s.invested, 0) ?? 0
          const totalPositions = students?.reduce((a, s) => a + s.positions.length, 0) ?? 0
          return (
            <>
              <div className="bg-gray-100 rounded-lg p-4">
                <div className="text-xs text-gray-500">P&L total clase</div>
                <div className={`text-lg font-bold ${pnlColor(totalPnl)}`}>{fmtMoney(totalPnl)}</div>
              </div>
              <div className="bg-gray-100 rounded-lg p-4">
                <div className="text-xs text-gray-500">P&L medio</div>
                <div className={`text-lg font-bold ${pnlColor(avgPnlPct)}`}>{fmtPct(avgPnlPct)}</div>
              </div>
              <div className="bg-gray-100 rounded-lg p-4">
                <div className="text-xs text-gray-500">Total invertido</div>
                <div className="text-lg font-bold text-gray-900">{fmtMoney(totalInvested)}</div>
              </div>
              <div className="bg-gray-100 rounded-lg p-4">
                <div className="text-xs text-gray-500">Posiciones abiertas</div>
                <div className="text-lg font-bold text-gray-900">{totalPositions}</div>
              </div>
            </>
          )
        })()}
      </div>

      {/* Students list */}
      <div className="space-y-2">
        {students?.map(s => (
          <div key={s.email} className="bg-gray-100 rounded-lg overflow-hidden">
            {/* Student header */}
            <button
              onClick={() => toggle(s.email)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-750 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                {expanded.has(s.email) ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
                <div>
                  <span className="font-medium text-gray-900">{s.username}</span>
                  <span className="text-gray-400 text-xs ml-2">{s.email}</span>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-right">
                  <div className="text-gray-500 text-xs">Valor total</div>
                  <div className="text-gray-900 font-medium">{fmtMoney(s.total_value)}</div>
                </div>
                <div className="text-right">
                  <div className="text-gray-500 text-xs">P&L</div>
                  <div className={`font-medium ${pnlColor(s.total_pnl)}`}>
                    {fmtMoney(s.total_pnl)} ({fmtPct(s.total_pnl_pct)})
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-gray-500 text-xs">Posiciones</div>
                  <div className="text-gray-900">{s.positions.length}</div>
                </div>
                <div className="text-right">
                  <div className="text-gray-500 text-xs">Disponible</div>
                  <div className="text-gray-900">{fmtMoney(s.balance)}</div>
                </div>
              </div>
            </button>

            {/* Expanded positions */}
            {expanded.has(s.email) && s.positions.length > 0 && (
              <div className="border-t border-gray-300 px-4 py-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs">
                      <th className="text-left py-1">Ticker</th>
                      <th className="text-left py-1">Lado</th>
                      <th className="text-right py-1">Cant.</th>
                      <th className="text-right py-1">P. entrada</th>
                      <th className="text-right py-1">P. actual</th>
                      <th className="text-right py-1">P&L</th>
                      <th className="text-right py-1">P&L %</th>
                      <th className="text-right py-1">Riesgo FX</th>
                      <th className="text-left py-1 pl-3">Cartera</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.positions.map((p, i) => (
                      <tr key={`${p.ticker}-${p.side}-${i}`} className="border-t border-gray-300/50">
                        <td className="py-1.5 font-medium text-cyan-400">{p.ticker}</td>
                        <td className={`py-1.5 ${p.side === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {p.side === 'long' ? 'Long' : 'Short'}
                        </td>
                        <td className="py-1.5 text-right text-gray-900">{p.quantity}</td>
                        <td className="py-1.5 text-right text-gray-700">{fmtPrice(p.avg_price)}</td>
                        <td className="py-1.5 text-right text-gray-700">{fmtPrice(p.current_price)}</td>
                        <td className={`py-1.5 text-right font-medium ${pnlColor(p.pnl)}`}>{fmtMoney(p.pnl)}</td>
                        <td className={`py-1.5 text-right ${pnlColor(p.pnl_pct)}`}>{fmtPct(p.pnl_pct)}</td>
                        <td className="py-1.5 text-right">
                          {p.fx_pnl != null ? (
                            <span className={`text-xs ${Number(p.fx_pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {Number(p.fx_pnl) >= 0 ? '+' : ''}{Number(p.fx_pnl).toFixed(2)}€
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-1.5 pl-3 text-gray-400 text-xs">{p.portfolio_group || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {expanded.has(s.email) && s.positions.length === 0 && (
              <div className="border-t border-gray-300 px-4 py-3 text-gray-400 text-sm">
                Sin posiciones abiertas
              </div>
            )}
          </div>
        ))}
      </div>

      {totalStudents === 0 && (
        <div className="text-center text-gray-400 py-12">
          No hay estudiantes registrados todavia
        </div>
      )}
    </div>
  )
}
