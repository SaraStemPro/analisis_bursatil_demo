import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { useCorrelation, type CorrelationPeriod, type CorrelationResponse } from '../../hooks/useCorrelation'
import { CorrelationHeatmap } from './CorrelationHeatmap'
import { diagnoseAvgCorrelation, diagnoseDiversificationRatio, getSuggestions, fmtPct, type Diagnosis } from '../../lib/correlationInterpretation'

function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-block ml-1">
      <button onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onClick={() => setShow(!show)} className="text-slate-500 hover:text-slate-300" type="button">
        <Info size={12} />
      </button>
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-700 text-slate-200 text-xs rounded-lg shadow-lg w-64 leading-relaxed pointer-events-none">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-700" />
        </span>
      )}
    </span>
  )
}

interface Props {
  tickers: string[]
  weights?: number[]
  autoCalcKey?: string  // si cambia y hay >=2 tickers, dispara el cálculo automáticamente (una sola vez por valor)
}

const PERIOD_OPTIONS: { value: CorrelationPeriod; label: string }[] = [
  { value: '3mo', label: '3 meses' },
  { value: '6mo', label: '6 meses' },
  { value: '1y',  label: '1 año' },
  { value: '2y',  label: '2 años' },
  { value: '5y',  label: '5 años' },
]

export function CorrelationPanel({ tickers, weights, autoCalcKey }: Props) {
  const [period, setPeriod] = useState<CorrelationPeriod>('6mo')
  const correlation = useCorrelation()

  const canCalc = tickers.length >= 2 && tickers.length <= 30

  // Auto-cálculo cuando autoCalcKey cambia (p. ej. precarga desde ?tickers= de la lección).
  // Sólo dispara una vez por valor del key para no pisarse con cambios manuales del usuario.
  const lastAutoKeyRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!autoCalcKey) return
    if (lastAutoKeyRef.current === autoCalcKey) return
    if (!canCalc) return
    lastAutoKeyRef.current = autoCalcKey
    correlation.mutate({ tickers, period, weights })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCalcKey, canCalc])

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Análisis de correlación</h2>
          <p className="mt-1 text-sm text-slate-400 max-w-prose">
            La distribución sectorial (arriba) mide <span className="text-slate-300">variedad de etiquetas</span>: cuántos sectores distintos tienes.
            La correlación mide <span className="text-slate-300">comportamiento real</span>: si tus activos suben y bajan juntos o no.
            Puedes tener 5 sectores y aun así tener correlación alta si todos reaccionan igual al mercado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Período</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as CorrelationPeriod)}
            className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-white"
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button
            onClick={() => correlation.mutate({ tickers, period, weights })}
            disabled={!canCalc || correlation.isPending}
            className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {correlation.isPending ? 'Calculando...' : 'Calcular correlación'}
          </button>
        </div>
      </div>

      {!canCalc && (
        <div className="rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-sm text-amber-400">
          Selecciona entre 2 y 30 activos para calcular la correlación.
        </div>
      )}

      {correlation.isError && (
        <div className="rounded border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-400">
          No se pudo calcular: {correlation.error.message}
        </div>
      )}

      {correlation.data && <CorrelationResults data={correlation.data} />}
    </section>
  )
}

function CorrelationResults({ data }: { data: CorrelationResponse }) {
  const avgDiagnosis = diagnoseAvgCorrelation(data.avg_correlation)
  const drDiagnosis = diagnoseDiversificationRatio(data.diversification_ratio)
  const suggestions = getSuggestions(data)

  const riskAvoided = data.weighted_avg_volatility - data.portfolio_volatility
  const riskAvoidedPct = data.weighted_avg_volatility > 0 ? (riskAvoided / data.weighted_avg_volatility) * 100 : 0

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI label="Correlación media" value={data.avg_correlation.toFixed(2)} sub="entre todos los pares" diagnosis={avgDiagnosis}
          tip="Promedio de la correlación de Pearson entre cada par de activos. Mide si se mueven juntos (+1) o no (0). Por debajo de 0.3 hay diversificación real." />
        <KPI label="Diversification ratio" value={data.diversification_ratio.toFixed(2)} sub="σ media ponderada / σ cartera" diagnosis={drDiagnosis}
          tip="Volatilidad media ponderada dividida por la volatilidad real de la cartera. Si es 1.0 no hay beneficio de diversificar. Cuanto mayor, más riesgo estás eliminando al combinar activos." />
        <KPI label="Vol. cartera anualizada" value={fmtPct(data.portfolio_volatility)} sub={`vs ${fmtPct(data.weighted_avg_volatility)} si ρ=+1`}
          tip="Desviación típica anualizada (σ×√252) de los retornos de tu cartera. El valor comparativo es lo que sería si todos los activos estuvieran perfectamente correlacionados." />
        <KPI label="Riesgo evitado" value={`${riskAvoidedPct.toFixed(1)}%`} sub="reducción por diversificar"
          tip="Porcentaje de volatilidad que la diversificación te ha ahorrado: (σ_media − σ_cartera) / σ_media. Un 30% significa que tu cartera oscila un 30% menos que si todos se movieran igual." />
      </div>

      {/* Diagnosis */}
      <div className="grid gap-3 md:grid-cols-2">
        <DiagnosisBox title="Tu correlación media" value={data.avg_correlation.toFixed(2)} diagnosis={avgDiagnosis} />
        <DiagnosisBox title="Tu diversification ratio" value={data.diversification_ratio.toFixed(2)} diagnosis={drDiagnosis} />
      </div>

      {/* Pairs */}
      <div className="grid gap-3 md:grid-cols-2">
        <PairCard tone="warning" title="Par más correlacionado" tickerA={data.max_pair.a} tickerB={data.max_pair.b} rho={data.max_pair.correlation} note="Estos dos aportan información casi idéntica a tu cartera." />
        <PairCard tone="success" title="Par menos correlacionado" tickerA={data.min_pair.a} tickerB={data.min_pair.b} rho={data.min_pair.correlation} note="Esta pareja sí está diversificando de verdad." />
      </div>

      {/* Heatmap */}
      <CorrelationHeatmap data={data} />

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="rounded-md border border-slate-700 bg-slate-800 p-4">
          <h3 className="text-sm font-semibold text-slate-300">Sugerencias</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-400">
            {suggestions.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-slate-600">→</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Meta */}
      <div className="text-xs text-slate-600 font-mono">
        Calculado sobre {data.n_observations} días de retornos · período {data.period} · datos de Yahoo Finance
        {data.missing_tickers.length > 0 && (
          <span className="ml-2 text-amber-500">· sin datos para: {data.missing_tickers.join(', ')}</span>
        )}
      </div>
    </div>
  )
}

function KPI({ label, value, sub, diagnosis, tip }: { label: string; value: string; sub: string; diagnosis?: { color: string }; tip?: string }) {
  return (
    <div className="rounded-md border border-slate-700 bg-slate-800 p-3">
      <div className="text-xs text-slate-500 flex items-center">{label}{tip && <Tip text={tip} />}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${diagnosis?.color ?? 'text-white'}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
    </div>
  )
}

function DiagnosisBox({ title, value, diagnosis }: { title: string; value: string; diagnosis: Diagnosis }) {
  return (
    <div className={`rounded-md border-2 p-4 ${diagnosis.bgColor}`}>
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-semibold text-slate-300">{title}</h4>
        <span className={`text-xs font-mono ${diagnosis.color}`}>{diagnosis.label}</span>
      </div>
      <div className={`mt-1 text-xl font-bold ${diagnosis.color}`}>{value}</div>
      <p className="mt-2 text-sm text-slate-400 leading-relaxed">{diagnosis.message}</p>
    </div>
  )
}

function PairCard({ tone, title, tickerA, tickerB, rho, note }: { tone: 'warning' | 'success'; title: string; tickerA: string; tickerB: string; rho: number; note: string }) {
  const styles = tone === 'warning' ? 'border-amber-700 bg-amber-900/30' : 'border-emerald-700 bg-emerald-900/30'
  return (
    <div className={`rounded-md border-2 p-4 ${styles}`}>
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="font-mono font-semibold text-white">{tickerA}</span>
        <span className="text-slate-600">↔</span>
        <span className="font-mono font-semibold text-white">{tickerB}</span>
        <span className="ml-auto text-2xl font-bold tabular-nums text-white">{rho.toFixed(2)}</span>
      </div>
      <p className="mt-2 text-xs text-slate-500 leading-relaxed">{note}</p>
    </div>
  )
}
