import { useState } from 'react'
import type { CorrelationResponse } from '../../hooks/useCorrelation'
import { correlationToColor, correlationTextColor } from '../../lib/correlationInterpretation'

interface Props {
  data: CorrelationResponse
}

export function CorrelationHeatmap({ data }: Props) {
  const [selected, setSelected] = useState<{ i: number; j: number } | null>(null)

  const n = data.tickers.length
  const cellSize = n <= 5 ? 64 : n <= 10 ? 52 : n <= 20 ? 40 : 32
  const fontSize = n <= 10 ? 12 : n <= 20 ? 10 : 9

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Matriz de correlación</h3>
        <CorrelationLegend />
      </div>

      <div className="overflow-auto rounded-md border border-slate-700">
        <table className="border-collapse">
          <thead>
            <tr>
              <th
                className="sticky left-0 top-0 z-20 bg-slate-800 border-b border-r border-slate-700"
                style={{ width: cellSize, height: cellSize }}
              />
              {data.tickers.map((t) => (
                <th
                  key={t}
                  className="sticky top-0 z-10 bg-slate-800 border-b border-slate-700 px-1 text-center font-mono text-slate-400"
                  style={{ height: cellSize, fontSize }}
                  title={t}
                >
                  {t.length > 5 ? t.slice(0, 5) + '...' : t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.tickers.map((tA, i) => (
              <tr key={tA}>
                <th
                  className="sticky left-0 z-10 bg-slate-800 border-r border-slate-700 px-1 text-center font-mono text-slate-400"
                  style={{ width: cellSize, fontSize }}
                  title={tA}
                >
                  {tA.length > 5 ? tA.slice(0, 5) + '...' : tA}
                </th>
                {data.tickers.map((tB, j) => {
                  const rho = data.matrix[i][j]
                  const isDiag = i === j
                  const isSel = selected !== null && ((selected.i === i && selected.j === j) || (selected.i === j && selected.j === i))
                  return (
                    <td
                      key={tB}
                      onClick={() => !isDiag && setSelected({ i, j })}
                      style={{
                        width: cellSize, height: cellSize,
                        backgroundColor: correlationToColor(rho),
                        color: correlationTextColor(rho),
                        fontSize,
                        cursor: isDiag ? 'default' : 'pointer',
                        outline: isSel ? '2px solid #10b981' : 'none',
                        outlineOffset: -2,
                      }}
                      className="text-center font-mono font-medium select-none"
                      title={`${tA} ↔ ${tB}: ρ = ${rho.toFixed(3)}`}
                    >
                      {isDiag ? '—' : rho.toFixed(2)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && selected.i !== selected.j && (
        <CorrelationDetail
          tickerA={data.tickers[selected.i]}
          tickerB={data.tickers[selected.j]}
          rho={data.matrix[selected.i][selected.j]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function CorrelationLegend() {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-mono text-slate-500">-1</span>
      <div
        className="h-3 w-32 rounded-sm"
        style={{ background: 'linear-gradient(to right, rgb(4,120,87), rgb(110,231,183), rgb(254,243,199), rgb(251,146,60), rgb(185,28,28))' }}
      />
      <span className="font-mono text-slate-500">+1</span>
    </div>
  )
}

function CorrelationDetail({ tickerA, tickerB, rho, onClose }: { tickerA: string; tickerB: string; rho: number; onClose: () => void }) {
  let interpretation: string
  let color: string
  if (rho >= 0.85) {
    interpretation = `Casi gemelos. Tener ${tickerA} y ${tickerB} es como tener uno duplicado. Considera eliminar uno.`
    color = 'border-red-700 bg-red-900/30'
  } else if (rho >= 0.6) {
    interpretation = 'Se mueven mucho juntos. Diversificación limitada entre estos dos.'
    color = 'border-amber-700 bg-amber-900/30'
  } else if (rho >= 0.3) {
    interpretation = 'Cierta relación pero con margen. Combinarlos aporta diversificación moderada.'
    color = 'border-blue-700 bg-blue-900/30'
  } else if (rho >= -0.1) {
    interpretation = 'Prácticamente independientes. Buena pareja diversificadora.'
    color = 'border-emerald-700 bg-emerald-900/30'
  } else {
    interpretation = 'Se mueven en direcciones opuestas. Excelente para cobertura.'
    color = 'border-emerald-600 bg-emerald-900/40'
  }

  return (
    <div className={`rounded-md border-2 p-4 ${color}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-slate-500">Detalle del par</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {tickerA} <span className="text-slate-500">↔</span> {tickerB}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-white">{rho.toFixed(3)}</span>
            <span className="text-xs text-slate-500">correlación</span>
          </div>
          <p className="mt-3 text-sm text-slate-300 leading-relaxed">{interpretation}</p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white text-lg">×</button>
      </div>
    </div>
  )
}
