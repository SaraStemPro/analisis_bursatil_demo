import { useQuery } from '@tanstack/react-query'
import { demo } from '../../api'

const SECTOR_COLORS: Record<string, string> = {
  'Technology': 'bg-blue-500',
  'Healthcare': 'bg-emerald-500',
  'Financial Services': 'bg-amber-500',
  'Consumer Cyclical': 'bg-purple-500',
  'Communication Services': 'bg-pink-500',
  'Industrials': 'bg-cyan-500',
  'Consumer Defensive': 'bg-lime-500',
  'Energy': 'bg-orange-500',
  'Utilities': 'bg-teal-500',
  'Real Estate': 'bg-indigo-500',
  'Basic Materials': 'bg-yellow-500',
  'Otros': 'bg-slate-500',
}

function getDiversityLabel(score: number): { text: string; color: string; barColor: string } {
  if (score >= 60) return { text: 'Diversificado', color: 'text-emerald-400', barColor: 'bg-emerald-500' }
  if (score >= 30) return { text: 'Moderado', color: 'text-amber-400', barColor: 'bg-amber-500' }
  return { text: 'Concentrado', color: 'text-red-400', barColor: 'bg-red-500' }
}

export default function PortfolioSummaryPanel() {
  const { data: summary } = useQuery({
    queryKey: ['portfolioSummary'],
    queryFn: demo.portfolioSummary,
  })

  if (!summary || summary.positions_count === 0) return null

  const label = getDiversityLabel(summary.diversity_score)

  return (
    <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
      <h2 className="font-semibold mb-3">Resumen del portfolio</h2>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-sm text-slate-400">Invertido</p>
          <p className="text-lg font-bold">{summary.invested.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
        </div>
        <div>
          <p className="text-sm text-slate-400">Posiciones</p>
          <p className="text-lg font-bold">{summary.positions_count}</p>
        </div>
        <div>
          <p className="text-sm text-slate-400">Diversificacion</p>
          <p className={`text-lg font-bold ${label.color}`}>{summary.diversity_score}%</p>
        </div>
      </div>

      {/* Diversity score bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm text-slate-400">Diversificacion</span>
          <span className={`text-sm font-medium ${label.color}`}>{label.text}</span>
        </div>
        <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${label.barColor}`}
            style={{ width: `${summary.diversity_score}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
          <span>Concentrado</span>
          <span>Moderado</span>
          <span>Diversificado</span>
        </div>
      </div>

      {/* Sector allocation */}
      {summary.sectors.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-400 mb-2">Distribucion por sector</h3>
          <div className="space-y-2">
            {summary.sectors.map((s) => (
              <div key={s.sector} className="flex items-center gap-2 text-sm">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${SECTOR_COLORS[s.sector] || 'bg-slate-500'}`} />
                <span className="text-slate-300 flex-1 truncate">{s.sector}</span>
                <span className="text-slate-400 w-16 text-right">{s.weight_pct}%</span>
                <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${SECTOR_COLORS[s.sector] || 'bg-slate-500'}`} style={{ width: `${s.weight_pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
